using System.ComponentModel.DataAnnotations;
using System.Data;
using System.Security.Claims;
using HR.Application;
using HR.Domain;
using HR.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace HR.Api;
public static class IdentityEndpoints
{
    public static void MapIdentityAdmin(this WebApplication app)
    {
        app.MapPost("/api/auth/password",async(PasswordInput x,ClaimsPrincipal actor,UserManager<ApplicationUser> users,SignInManager<ApplicationUser> sign,HrDbContext db)=>{
            if(string.IsNullOrEmpty(x.NewPassword) || x.NewPassword.Length>256 || string.IsNullOrEmpty(x.CurrentPassword) || x.CurrentPassword.Length>256) throw new RuleException("تحقق من كلمة المرور الحالية والجديدة.");
            var u=await users.GetUserAsync(actor);if(u is null) return Results.Unauthorized();
            await using var tx=await db.Database.BeginTransactionAsync();
            Ensure(await users.ChangePasswordAsync(u,x.CurrentPassword,x.NewPassword));
            db.Audit.Add(new AuditEvent{ActorId=u.Id,Action="User.PasswordChanged",EntityId=u.Id});await db.SaveChangesAsync();await tx.CommitAsync();
            await sign.SignOutAsync();return Results.Ok();
        }).RequireAuthorization();
        app.MapGet("/api/users",async(int? page,UserManager<ApplicationUser> users,HrDbContext db)=>{
            var n=Math.Clamp(page ?? 1,1,100000); var total=await users.Users.CountAsync();
            var rows=await users.Users.OrderBy(x=>x.Email).Skip((n-1)*20).Take(20).ToListAsync();
            var result=new List<object>();foreach(var u in rows) result.Add(new{u.Id,u.Email,u.IsActive,roles=await users.GetRolesAsync(u),employeeId=await db.Employees.Where(e=>e.UserId==u.Id).Select(e=>(Guid?)e.Id).SingleOrDefaultAsync()});
            return Results.Ok(new{total,items=result});
        }).RequireAuthorization("Admin");
        app.MapPost("/api/users",async(UserInput x,UserManager<ApplicationUser> users,HrDbContext db,ClaimsPrincipal actor)=>{
            if(!Access.Roles.Contains(x.Role) || !new EmailAddressAttribute().IsValid(x.Email) || x.Email.Length>254) throw new RuleException("البريد أو الدور غير صالح.");
            if(x.Role is "Employee" or "Manager" && !x.EmployeeId.HasValue) throw new RuleException("اربط الحساب بموظف.");
            await using var tx=await db.Database.BeginTransactionAsync();
            var e=x.EmployeeId.HasValue ? await db.Employees.SingleOrDefaultAsync(e=>e.Id==x.EmployeeId) ?? throw new RuleException("الموظف غير موجود.") : null;
            if(e?.UserId!=null) throw new RuleException("الموظف مرتبط بحساب.");
            var u=new ApplicationUser{UserName=x.Email.Trim(),Email=x.Email.Trim()};
            Ensure(await users.CreateAsync(u,x.Password));Ensure(await users.AddToRoleAsync(u,x.Role));
            if(e!=null) e.UserId=u.Id;
            db.Audit.Add(new AuditEvent{ActorId=Access.UserId(actor),Action="User.Created",EntityId=u.Id});
            await db.SaveChangesAsync();await tx.CommitAsync();return Results.Ok(new{u.Id,u.Email});
        }).RequireAuthorization("Admin");
        app.MapPut("/api/users/{id}/role",async(string id,RoleInput x,UserManager<ApplicationUser> users,HrDbContext db,ClaimsPrincipal actor)=>{
            if(!Access.Roles.Contains(x.Role)) throw new RuleException("الدور غير صالح.");
            await using var tx=await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var u=await users.FindByIdAsync(id);if(u is null) return Results.NotFound();
            var current=await users.GetRolesAsync(u);
            if(current.Contains("Administrator") && x.Role!="Administrator" && (await users.GetUsersInRoleAsync("Administrator")).Count(v=>v.IsActive)<=1) throw new RuleException("لا يمكن إزالة آخر مدير نظام.");
            if(x.Role is "Employee" or "Manager" && !await db.Employees.AnyAsync(e=>e.UserId==id)) throw new RuleException("يجب ربط الحساب بموظف أولًا.");
            Ensure(await users.RemoveFromRolesAsync(u,current));Ensure(await users.AddToRoleAsync(u,x.Role));Ensure(await users.UpdateSecurityStampAsync(u));
            db.Audit.Add(new AuditEvent{ActorId=Access.UserId(actor),Action="User.RoleChanged",EntityId=id});await db.SaveChangesAsync();await tx.CommitAsync();return Results.Ok();
        }).RequireAuthorization("Admin");
        app.MapPut("/api/users/{id}/active",async(string id,ActiveInput x,UserManager<ApplicationUser> users,HrDbContext db,ClaimsPrincipal actor)=>{
            if(id==Access.UserId(actor) && !x.IsActive) throw new RuleException("لا يمكنك تعطيل حسابك الحالي.");
            await using var tx=await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var u=await users.FindByIdAsync(id);if(u is null) return Results.NotFound();
            if(!x.IsActive && await users.IsInRoleAsync(u,"Administrator") && (await users.GetUsersInRoleAsync("Administrator")).Count(v=>v.IsActive)<=1)
                throw new RuleException("لا يمكن تعطيل آخر مدير نظام نشط.");
            u.IsActive=x.IsActive;Ensure(await users.UpdateAsync(u));Ensure(await users.UpdateSecurityStampAsync(u));
            db.Audit.Add(new AuditEvent{ActorId=Access.UserId(actor),Action=x.IsActive?"User.Enabled":"User.Disabled",EntityId=id});await db.SaveChangesAsync();await tx.CommitAsync();return Results.Ok();
        }).RequireAuthorization("Admin");
    }
    private static void Ensure(IdentityResult r)
    {
        if(!r.Succeeded) throw new RuleException("تعذر حفظ الحساب؛ تحقق من تكرار البريد، وكلمة مرور بطول 12 على الأقل تضم أحرفًا كبيرة وصغيرة وأرقامًا ورمزًا.");
    }
}
