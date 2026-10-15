using System.Security.Claims;
using HR.Application;
using HR.Domain;
using Microsoft.EntityFrameworkCore;

namespace HR.Infrastructure;

public class EmployeeService(HrDbContext db)
{
    public IQueryable<Employee> Visible(ClaimsPrincipal actor)
    {
        if(Access.IsHr(actor)) return db.Employees;
        var uid=Access.UserId(actor);
        var own=db.Employees.Where(x=>x.UserId==uid).Select(x=>x.Id);
        return actor.IsInRole("Manager")
            ? db.Employees.Where(x=>x.UserId==uid || (x.ManagerId!=null && own.Contains(x.ManagerId.Value)))
            : db.Employees.Where(x=>x.UserId==uid);
    }
    public async Task<Employee> Save(EmployeeInput raw, Guid? id=null, CancellationToken ct=default)
    {
        await using var transaction=await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable,ct);
        var x=Rules.Employee(raw);
        if(!await db.Jobs.AnyAsync(j=>j.Id==x.JobPositionId,ct)) throw new RuleException("الوظيفة غير موجودة.");
        var e=id.HasValue ? await db.Employees.SingleOrDefaultAsync(e=>e.Id==id,ct) ?? throw new RuleException("الموظف غير موجود.") : new Employee();
        if(id.HasValue && x.Version!=e.Version) throw new DbUpdateConcurrencyException();
        if(await db.Employees.AnyAsync(v=>v.Number==x.Number && v.Id!=e.Id,ct)) throw new RuleException("الرقم الوظيفي مستخدم.");
        var current=x.ManagerId; var seen=new HashSet<Guid>{e.Id};
        while(current.HasValue)
        {
            if(!seen.Add(current.Value)) throw new RuleException("تسلسل المديرين يحتوي على دورة.");
            var manager=await db.Employees.SingleOrDefaultAsync(v=>v.Id==current,ct) ?? throw new RuleException("المدير غير موجود.");
            current=manager.ManagerId;
        }
        Rules.Apply(e,x);
        if(!id.HasValue) db.Employees.Add(e);
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct); return e;
    }
}
