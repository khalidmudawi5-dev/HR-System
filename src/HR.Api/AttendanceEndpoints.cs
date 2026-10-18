using System.Security.Claims;
using HR.Application;
using HR.Domain;
using HR.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace HR.Api;
public static class AttendanceEndpoints
{
    public static void MapAttendance(this WebApplication app)
    {
        var group=app.MapGroup("/api/attendance").RequireAuthorization("Attendance");
        group.MapGet("/context",(ClaimsPrincipal u,AttendanceService service,CancellationToken ct)=>service.Context(u,ct));
        group.MapGet("/setup",async(HrDbContext db,CancellationToken ct)=>new{
            shifts=await db.WorkShifts.AsNoTracking().OrderBy(s=>s.Name).ToListAsync(ct),
            holidays=await db.AttendanceHolidays.AsNoTracking().OrderByDescending(h=>h.Date).Take(200).ToListAsync(ct),
            policy=await db.AttendancePolicies.AsNoTracking().SingleOrDefaultAsync(ct)
        }).RequireAuthorization("HR");
        group.MapPost("/shifts",async(ShiftInput x,HrDbContext db,CancellationToken ct)=>{
            var shift=AttendanceRules.Shift(x);db.WorkShifts.Add(shift);await db.SaveChangesAsync(ct);return Results.Ok(shift);
        }).RequireAuthorization("HR");
        group.MapPost("/schedules",async(ScheduleInput x,AttendanceService service,CancellationToken ct)=>Results.Ok(new{created=await service.Assign(x,ct)})).RequireAuthorization("HR");
        group.MapPut("/schedules/{id:guid}",async(Guid id,ScheduleChange x,AttendanceService service,CancellationToken ct)=>{await service.Change(id,x,ct);return Results.Ok();}).RequireAuthorization("HR");
        group.MapPost("/holidays",async(HolidayInput x,HrDbContext db,CancellationToken ct)=>{
            AttendanceService.Range(x.Date,x.Date);var holiday=new AttendanceHoliday{Date=x.Date,Name=Rules.Text(x.Name,160,"اسم العطلة")};
            db.AttendanceHolidays.Add(holiday);await db.SaveChangesAsync(ct);return Results.Ok(holiday);
        }).RequireAuthorization("HR");
        group.MapDelete("/holidays/{id:guid}",async(Guid id,Guid version,HrDbContext db,CancellationToken ct)=>{
            var holiday=await db.AttendanceHolidays.SingleOrDefaultAsync(h=>h.Id==id,ct);if(holiday is null)return Results.NotFound();
            if(holiday.Version!=version)throw new DbUpdateConcurrencyException();
            db.AttendanceHolidays.Remove(holiday);await db.SaveChangesAsync(ct);return Results.Ok();
        }).RequireAuthorization("HR");
        group.MapPut("/policy",async(PolicyInput x,HrDbContext db,CancellationToken ct)=>{
            var policy=await db.AttendancePolicies.SingleOrDefaultAsync(ct);
            if(policy is null){if(x.Version!=null)throw new DbUpdateConcurrencyException();policy=new AttendancePolicy();db.AttendancePolicies.Add(policy);}
            else if(policy.Version!=x.Version)throw new DbUpdateConcurrencyException();
            policy.PortalEnabled=x.PortalEnabled;await db.SaveChangesAsync(ct);return Results.Ok(policy);
        }).RequireAuthorization("Admin");
        group.MapGet("/report",async(DateOnly? from,DateOnly? to,Guid? employeeId,string? q,int? page,ClaimsPrincipal actor,AttendanceService service,CancellationToken ct)=>{
            var today=await service.Today(ct);return Results.Ok(await service.Report(actor,from??today.AddDays(-6),to??today,employeeId,q,page??1,ct));
        });
        group.MapGet("/punches",async(DateOnly from,DateOnly to,Guid? employeeId,int? page,ClaimsPrincipal actor,HrDbContext db,EmployeeService employees,AttendanceService service,CancellationToken ct)=>{
            AttendanceService.Range(from,to);var zone=await service.Zone(ct);var lo=AttendanceRules.ToUtc(from.ToDateTime(TimeOnly.MinValue),zone);var hi=AttendanceRules.ToUtc(to.AddDays(1).ToDateTime(TimeOnly.MinValue),zone);
            var ids=employees.Visible(actor).Select(e=>e.Id);
            var query=db.AttendancePunches.AsNoTracking().Where(p=>ids.Contains(p.EmployeeId)&&p.OccurredAtUtc>=lo&&p.OccurredAtUtc<hi&&(!employeeId.HasValue||p.EmployeeId==employeeId));
            return Results.Ok(new{total=await query.CountAsync(ct),items=await query.OrderByDescending(p=>p.OccurredAtUtc).ThenBy(p=>p.Id).Skip((Math.Clamp(page??1,1,100000)-1)*20).Take(20)
                .Select(p=>new{p.Id,p.EmployeeId,p.Employee.Number,p.Employee.FullName,p.OccurredAtUtc,p.Kind,p.Source,p.RecordedAtUtc}).ToListAsync(ct)});
        });
        group.MapPost("/punch",async(PortalPunchInput x,ClaimsPrincipal u,AttendanceService service,CancellationToken ct)=>{
            var p=await service.Portal(u,x,ct);return Results.Ok(new{p.Id,p.Kind,occurredAtUtc=AttendanceRules.Utc(p.OccurredAtUtc),p.Source});
        });
        group.MapGet("/corrections",(int? page,ClaimsPrincipal u,AttendanceService service,CancellationToken ct)=>service.Corrections(u,page??1,ct));
        group.MapPost("/corrections",async(CorrectionInput x,ClaimsPrincipal u,AttendanceService service,CancellationToken ct)=>{
            var c=await service.Request(u,x,ct);return Results.Ok(new{c.Id,c.Version,c.Status});
        });
        group.MapPut("/corrections/{id:guid}",async(Guid id,CorrectionDecision x,ClaimsPrincipal u,AttendanceService service,CancellationToken ct)=>{await service.Decide(u,id,x,ct);return Results.Ok();});
        group.MapGet("/import/template",()=>Results.File(AttendanceImport.Template(),"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","attendance-punches.xlsx")).RequireAuthorization("HR");
        group.MapPost("/import/preview",async(HttpContext ctx,AttendanceImport service,CancellationToken ct)=>{using var file=await ImportFile(ctx,ct);return Results.Ok(await service.Preview(file,ct));}).RequireAuthorization("HR");
        group.MapPost("/import/commit",async(HttpContext ctx,AttendanceImport service,CancellationToken ct)=>{using var file=await ImportFile(ctx,ct);return Results.Ok(await service.Commit(file,ct));}).RequireAuthorization("HR");
    }
    private static async Task<MemoryStream> ImportFile(HttpContext ctx,CancellationToken ct)
    {
        if(!ctx.Request.HasFormContentType)throw new RuleException("أرسل ملف Excel بصيغة multipart/form-data.");
        var form=await ctx.Request.ReadFormAsync(ct);var file=form.Files.GetFile("file");
        if(form.Files.Count!=1||file is null||file.Length==0||file.Length>2*1024*1024||!file.FileName.EndsWith(".xlsx",StringComparison.OrdinalIgnoreCase))throw new RuleException("أرسل ملف Excel واحدًا حتى 2 MB.");
        var memory=new MemoryStream();try{await file.CopyToAsync(memory,ct);memory.Position=0;return memory;}catch{memory.Dispose();throw;}
    }
}
