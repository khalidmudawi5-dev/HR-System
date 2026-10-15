using System.Security.Claims;
using HR.Application;
using Microsoft.EntityFrameworkCore;

namespace HR.Infrastructure;

public class DashboardService(HrDbContext db,EmployeeService employees,TimeProvider clock)
{
    public IQueryable<ActivityView> Activity(int page=1,int size=50) =>
        (
        from audit in db.Audit.AsNoTracking()
        join user in db.Users.AsNoTracking() on audit.ActorId equals user.Id into actors
        from user in actors.DefaultIfEmpty()
        orderby audit.Id descending
        select new ActivityView(audit.Id,audit.OccurredAt,audit.ActorId,
            user!=null ? user.Email ?? "حساب مستخدم" : audit.ActorId=="operator" || audit.ActorId=="system" ? "مشغل النظام" : "حساب غير متاح",
            audit.Action,audit.EntityId)).Skip((Math.Clamp(page,1,100000)-1)*size).Take(size);

    public async Task<DashboardView> Read(ClaimsPrincipal actor,string productName,CancellationToken ct)
    {
        var organization=await db.Organizations.AsNoTracking().SingleOrDefaultAsync(ct);
        var zone=organization?.TimeZone ?? "Asia/Riyadh";
        var today=DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(),TimeZoneInfo.FindSystemTimeZoneById(zone)).DateTime);
        var admin=actor.IsInRole("Administrator");var hr=Access.IsHr(actor);
        var canReadEmployees=hr || actor.IsInRole("Manager") || actor.IsInRole("Employee");
        var scope=hr ? "organization" : actor.IsInRole("Manager") ? "team" : canReadEmployees ? "self" : "financial";
        var visible=employees.Visible(actor).AsNoTracking();
        var userId=Access.UserId(actor);
        var name=await db.Employees.Where(x=>x.UserId==userId).Select(x=>x.FullName).SingleOrDefaultAsync(ct);
        EmployeeSummary? summary=null;
        List<RecentEmployee> recent=[];
        if(canReadEmployees)
        {
            var start=new DateOnly(today.Year,today.Month,1);var end=start.AddMonths(1);
            summary=new(await visible.CountAsync(ct),await visible.CountAsync(x=>x.Status=="Active",ct),
                await visible.CountAsync(x=>x.Status=="Inactive",ct),await visible.CountAsync(x=>x.Status=="Terminated",ct),
                await visible.CountAsync(x=>x.JoinDate>=start && x.JoinDate<end && x.JoinDate<=today,ct));
            recent=await visible.OrderByDescending(x=>x.JoinDate).ThenBy(x=>x.Number).Take(5)
                .Select(x=>new RecentEmployee(x.Id,x.Number,x.FullName,x.Status,x.JoinDate,x.JobPosition.Name,
                    x.JobPosition.Department.Name,x.JobPosition.Department.Branch.Name)).ToListAsync(ct);
        }
        StructureSummary? structure=null;SetupSummary? setup=null;List<BranchSummary> branches=[];
        if(hr)
        {
            structure=new(await db.Branches.CountAsync(ct),await db.Departments.CountAsync(ct),await db.Jobs.CountAsync(ct));
            branches=await db.Branches.AsNoTracking().OrderBy(x=>x.Name).Take(8)
                .Select(b=>new BranchSummary(b.Id,b.Name,db.Employees.Count(e=>e.JobPosition.Department.BranchId==b.Id))).ToListAsync(ct);
        }
        if(admin)
        {
            setup=new(organization!=null,structure!.Branches>0,structure.Departments>0,structure.Jobs>0,
                summary!.Total>0,await db.Employees.AnyAsync(x=>x.UserId!=null,ct));
        }
        var activity=admin ? await Activity(size:5).ToListAsync(ct) : [];
        return new(organization?.Name ?? productName,zone,today,name,scope,summary,structure,setup,recent,branches,activity);
    }
}
