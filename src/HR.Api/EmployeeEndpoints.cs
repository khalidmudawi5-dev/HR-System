using System.Security.Claims;
using HR.Application;
using HR.Domain;
using HR.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace HR.Api;
public static class EmployeeEndpoints
{
    public static void MapEmployees(this WebApplication app)
    {
        app.MapGet("/api/employees",async(string? q,string? status,Guid? jobId,int? page,int? pageSize,ClaimsPrincipal u,EmployeeService service)=>{
            var n=Math.Clamp(page ?? 1,1,100000);var size=Math.Clamp(pageSize ?? 20,1,100);
            var query=service.Visible(u).AsNoTracking();
            if(!string.IsNullOrWhiteSpace(q)) {var text=q.Trim();if(text.Length>160) throw new RuleException("البحث طويل جدًا.");query=query.Where(x=>x.FullName.Contains(text)||x.Number.Contains(text));}
            if(!string.IsNullOrWhiteSpace(status)) query=query.Where(x=>x.Status==status);
            if(jobId.HasValue) query=query.Where(x=>x.JobPositionId==jobId);
            var count=await query.CountAsync();var rows=await query.OrderBy(x=>x.Number).Skip((n-1)*size).Take(size).ToListAsync();
            return Results.Ok(new{total=count,page=n,pageSize=size,items=rows.Select(Rules.View)});
        }).RequireAuthorization();
        app.MapGet("/api/employees/{id:guid}",async(Guid id,ClaimsPrincipal u,EmployeeService service)=>{
            var e=await service.Visible(u).AsNoTracking().SingleOrDefaultAsync(x=>x.Id==id);
            return e is null ? Results.NotFound() : Results.Ok(Rules.View(e));
        }).RequireAuthorization();
        app.MapPost("/api/employees",async(EmployeeInput x,EmployeeService service)=>Results.Ok(Rules.View(await service.Save(x)))).RequireAuthorization("HR");
        app.MapPut("/api/employees/{id:guid}",async(Guid id,EmployeeInput x,EmployeeService service)=>Results.Ok(Rules.View(await service.Save(x,id)))).RequireAuthorization("HR");
        app.MapGet("/api/financial/employees",async(string? q,int? page,HrDbContext db)=>{
            var query=db.Employees.AsNoTracking();
            if(!string.IsNullOrWhiteSpace(q)) query=query.Where(x=>x.Number.Contains(q)||x.FullName.Contains(q));
            var n=Math.Clamp(page ?? 1,1,100000);return Results.Ok(new{total=await query.CountAsync(),items=await query.OrderBy(x=>x.Number).Skip((n-1)*20).Take(20).Select(x=>new{x.Id,x.Number,x.FullName}).ToListAsync()});
        }).RequireAuthorization("Payroll");
        app.MapGet("/api/employees/{id:guid}/financial",async(Guid id,HrDbContext db)=>{
            if(!await db.Employees.AnyAsync(x=>x.Id==id)) return Results.NotFound();
            var x=await db.Financials.AsNoTracking().SingleOrDefaultAsync(x=>x.EmployeeId==id);
            return Results.Ok(x is null ? null : new{x.Version,BaseSalary=x.BaseSalary.ToString("F2",System.Globalization.CultureInfo.InvariantCulture),x.Bank,x.Iban,x.EffectiveFrom});
        }).RequireAuthorization("Payroll");
        app.MapPut("/api/employees/{id:guid}/financial",async(Guid id,FinancialInput x,HrDbContext db)=>{
            if(!await db.Employees.AnyAsync(e=>e.Id==id)) return Results.NotFound();
            if(x.BaseSalary<0 || x.BaseSalary>9999999999999999.99m || decimal.Round(x.BaseSalary,2,MidpointRounding.AwayFromZero)!=x.BaseSalary || x.EffectiveFrom==default)
                throw new RuleException("الراتب غير سالب ومنزلتان عشريتان كحد أقصى، والتاريخ مطلوب.");
            var iban=Rules.SaudiIban(x.Iban);var bank=Rules.Text(x.Bank,120,"البنك",true);
            var e=await db.Financials.SingleOrDefaultAsync(e=>e.EmployeeId==id);
            if(e is null) {if(x.Version.HasValue) throw new DbUpdateConcurrencyException();e=new EmployeeFinancial{EmployeeId=id};db.Financials.Add(e);}
            else if(e.Version!=x.Version) throw new DbUpdateConcurrencyException();
            e.BaseSalary=x.BaseSalary;e.Bank=bank;e.Iban=iban;e.EffectiveFrom=x.EffectiveFrom;
            await db.SaveChangesAsync();return Results.Ok(new{e.Version,BaseSalary=e.BaseSalary.ToString("F2",System.Globalization.CultureInfo.InvariantCulture),e.Bank,e.Iban,e.EffectiveFrom});
        }).RequireAuthorization("Payroll");
        app.MapGet("/api/employees/{id:guid}/attachments",async(Guid id,ClaimsPrincipal u,HrDbContext db)=>{
            if(!await OwnOrHr(id,u,db)) return Results.NotFound();
            return Results.Ok(await db.Attachments.Where(x=>x.EmployeeId==id).Select(x=>new{x.Id,x.FileName,x.MediaType,x.Size}).ToListAsync());
        }).RequireAuthorization();
        app.MapPost("/api/employees/{id:guid}/attachments",async(Guid id,HttpContext ctx,HrDbContext db,IConfiguration config,CancellationToken ct)=>{
            if(!await db.Employees.AnyAsync(x=>x.Id==id,ct)) return Results.NotFound();
            var file=await FileFrom(ctx,5*1024*1024,ct);
            var name=Rules.Text(Path.GetFileName(file.FileName.Replace('\\','/')),200,"اسم الملف");
            await using var input=file.OpenReadStream();var signature=new byte[8];var n=await input.ReadAsync(signature,ct);input.Position=0;
            var ext=Path.GetExtension(name).ToLowerInvariant();
            var media=ext switch{
                ".pdf" when n>=5 && signature.AsSpan(0,5).SequenceEqual("%PDF-"u8)=>"application/pdf",
                ".png" when n==8 && signature.AsSpan().SequenceEqual(new byte[]{137,80,78,71,13,10,26,10})=>"image/png",
                ".jpg" or ".jpeg" when n>=3 && signature[0]==255 && signature[1]==216 && signature[2]==255=>"image/jpeg",
                _=>throw new RuleException("المسموح PDF وPNG وJPEG، ويجب أن يطابق المحتوى النوع.")};
            var root=StorageRoot(config);Directory.CreateDirectory(root);var key=Guid.NewGuid().ToString("N");var path=Path.Combine(root,key);
            try{
                await using(var output=new FileStream(path,FileMode.CreateNew)) await input.CopyToAsync(output,ct);
                var e=new Attachment{EmployeeId=id,FileName=name,StorageKey=key,MediaType=media,Size=file.Length};
                db.Attachments.Add(e);await db.SaveChangesAsync(ct);return Results.Ok(new{e.Id,e.FileName,e.Size});
            }catch{if(File.Exists(path)) File.Delete(path);throw;}
        }).RequireAuthorization("HR");
        app.MapGet("/api/employees/{id:guid}/attachments/{fileId:guid}",async(Guid id,Guid fileId,ClaimsPrincipal u,HrDbContext db,IConfiguration config)=>{
            if(!await OwnOrHr(id,u,db)) return Results.NotFound();
            var e=await db.Attachments.SingleOrDefaultAsync(x=>x.Id==fileId && x.EmployeeId==id);
            if(e is null) return Results.NotFound();
            var path=Path.Combine(StorageRoot(config),e.StorageKey);
            return File.Exists(path)? Results.File(path,e.MediaType,e.FileName,enableRangeProcessing:false) : Results.NotFound();
        }).RequireAuthorization();
        app.MapGet("/api/import/employees/template",()=>Results.File(ExcelEmployees.Template(),"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","employees-template.xlsx")).RequireAuthorization("HR");
        app.MapPost("/api/import/employees/preview",async(HttpContext ctx,ExcelEmployees excel,CancellationToken ct)=>{
            var file=await FileFrom(ctx,2*1024*1024,ct);using var input=file.OpenReadStream();return Results.Ok(await excel.Preview(input,ct));
        }).RequireAuthorization("HR");
        app.MapPost("/api/import/employees/commit",async(HttpContext ctx,ExcelEmployees excel,CancellationToken ct)=>{
            var file=await FileFrom(ctx,2*1024*1024,ct);using var input=file.OpenReadStream();return Results.Ok(new{count=await excel.Commit(input,ct)});
        }).RequireAuthorization("HR");
    }
    private static Task<bool> OwnOrHr(Guid id,ClaimsPrincipal u,HrDbContext db) => Access.IsHr(u)
        ? db.Employees.AnyAsync(x=>x.Id==id) : db.Employees.AnyAsync(x=>x.Id==id && x.UserId==Access.UserId(u));
    private static string StorageRoot(IConfiguration c) => Path.GetFullPath(c["Storage:Root"] ?? "../../.local/attachments");
    private static async Task<IFormFile> FileFrom(HttpContext ctx,long max,CancellationToken ct)
    {
        if(!ctx.Request.HasFormContentType) throw new RuleException("أرسل ملفًا بصيغة multipart/form-data.");
        var form=await ctx.Request.ReadFormAsync(ct);
        var file=form.Files.GetFile("file");
        if(form.Files.Count!=1 || file is null || file.Length==0 || file.Length>max) throw new RuleException($"أرسل ملفًا واحدًا لا يزيد على {max/1024/1024} MB.");
        return file;
    }
}
