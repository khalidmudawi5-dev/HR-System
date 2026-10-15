using HR.Application;
using HR.Domain;
using HR.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace HR.Api;
public static class FoundationEndpoints
{
    public static void MapFoundation(this WebApplication app)
    {
        app.MapGet("/api/organization",async(HrDbContext db)=>Results.Ok(await db.Organizations.SingleOrDefaultAsync())).RequireAuthorization();
        app.MapPut("/api/organization",async(OrganizationInput x,HrDbContext db)=>{
            var name=Rules.Text(x.Name,160,"اسم المنشأة");
            try{TimeZoneInfo.FindSystemTimeZoneById(x.TimeZone);}catch(TimeZoneNotFoundException){throw new RuleException("المنطقة الزمنية غير معروفة.");}
            var org=await db.Organizations.SingleOrDefaultAsync();
            if(org is null){org=new Organization();db.Organizations.Add(org);} else if(org.Version!=x.Version) throw new DbUpdateConcurrencyException();
            org.Name=name;org.TimeZone=x.TimeZone;await db.SaveChangesAsync();return Results.Ok(org);
        }).RequireAuthorization("Admin");
        app.MapGet("/api/structure",async(HrDbContext db)=>new{
            branches=await db.Branches.AsNoTracking().OrderBy(x=>x.Name).Select(x=>new{x.Id,x.Name,x.Version}).ToListAsync(),
            departments=await db.Departments.AsNoTracking().OrderBy(x=>x.Name).Select(x=>new{x.Id,x.Name,x.Version,x.BranchId}).ToListAsync(),
            jobs=await db.Jobs.AsNoTracking().OrderBy(x=>x.Name).Select(x=>new{x.Id,x.Name,x.Version,x.DepartmentId}).ToListAsync()
        }).RequireAuthorization("HR");
        app.MapPost("/api/branches",async(UnitInput x,HrDbContext db)=>{
            var e=new Branch{Name=Rules.Text(x.Name,160,"الفرع")};db.Branches.Add(e);await db.SaveChangesAsync();return Results.Ok(new{e.Id,e.Name});
        }).RequireAuthorization("HR");
        app.MapPost("/api/departments",async(UnitInput x,HrDbContext db)=>{
            if(!await db.Branches.AnyAsync(b=>b.Id==x.ParentId)) throw new RuleException("اختر فرعًا موجودًا.");
            var e=new Department{Name=Rules.Text(x.Name,160,"القسم"),BranchId=x.ParentId!.Value};db.Departments.Add(e);await db.SaveChangesAsync();return Results.Ok(new{e.Id,e.Name,e.BranchId});
        }).RequireAuthorization("HR");
        app.MapPost("/api/jobs",async(UnitInput x,HrDbContext db)=>{
            if(!await db.Departments.AnyAsync(b=>b.Id==x.ParentId)) throw new RuleException("اختر قسمًا موجودًا.");
            var e=new JobPosition{Name=Rules.Text(x.Name,160,"الوظيفة"),DepartmentId=x.ParentId!.Value};db.Jobs.Add(e);await db.SaveChangesAsync();return Results.Ok(new{e.Id,e.Name,e.DepartmentId});
        }).RequireAuthorization("HR");
        app.MapPut("/api/branches/{id:guid}",async(Guid id,UnitInput x,HrDbContext db)=>await Rename(id,x,db.Branches,db)).RequireAuthorization("HR");
        app.MapPut("/api/departments/{id:guid}",async(Guid id,UnitInput x,HrDbContext db)=>await Rename(id,x,db.Departments,db)).RequireAuthorization("HR");
        app.MapPut("/api/jobs/{id:guid}",async(Guid id,UnitInput x,HrDbContext db)=>await Rename(id,x,db.Jobs,db)).RequireAuthorization("HR");
        app.MapGet("/api/audit",async(int? page,HrDbContext db)=>{
            var n=Math.Max(page ?? 1,1);return Results.Ok(new{total=await db.Audit.CountAsync(),items=await db.Audit.AsNoTracking().OrderByDescending(x=>x.Id).Skip((Math.Min(n,100000)-1)*50).Take(50).ToListAsync()});
        }).RequireAuthorization("Admin");
    }
    private static async Task<IResult> Rename<T>(Guid id,UnitInput x,DbSet<T> set,HrDbContext db) where T:Versioned,INamedUnit
    {
        var e=await set.FindAsync(id);if(e is null)return Results.NotFound();
        if(x.Version!=e.Version)throw new DbUpdateConcurrencyException();
        e.Name=Rules.Text(x.Name,160,"الاسم");await db.SaveChangesAsync();return Results.Ok(new{e.Id,e.Name,e.Version});
    }
}
