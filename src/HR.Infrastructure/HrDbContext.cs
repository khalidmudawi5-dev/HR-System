using System.Security.Claims;
using HR.Application;
using HR.Domain;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace HR.Infrastructure;

public class ApplicationUser : IdentityUser { public bool IsActive { get; set; } = true; }

public class HrDbContext(DbContextOptions<HrDbContext> options, IHttpContextAccessor? http = null)
    : IdentityDbContext<ApplicationUser>(options)
{
    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<Branch> Branches => Set<Branch>();
    public DbSet<Department> Departments => Set<Department>();
    public DbSet<JobPosition> Jobs => Set<JobPosition>();
    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<EmployeeFinancial> Financials => Set<EmployeeFinancial>();
    public DbSet<Attachment> Attachments => Set<Attachment>();
    public DbSet<AuditEvent> Audit => Set<AuditEvent>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);
        foreach (var t in new[] { typeof(Organization), typeof(Branch), typeof(Department), typeof(JobPosition), typeof(Employee), typeof(EmployeeFinancial), typeof(Attachment) })
            b.Entity(t).Property(nameof(Versioned.Version)).IsConcurrencyToken();
        b.Entity<Organization>().HasIndex(x=>x.Singleton).IsUnique();
        b.Entity<Organization>().ToTable(t=>t.HasCheckConstraint("CK_Organization_Singleton", "[Singleton] = 1"));
        b.Entity<Organization>().Property(x=>x.Name).HasMaxLength(160);
        b.Entity<Organization>().Property(x=>x.TimeZone).HasMaxLength(100);
        b.Entity<Branch>().Property(x=>x.Name).HasMaxLength(160);
        b.Entity<Branch>().HasIndex(x=>x.Name).IsUnique();
        b.Entity<Department>().Property(x=>x.Name).HasMaxLength(160);
        b.Entity<Department>().HasIndex(x=>new {x.BranchId,x.Name}).IsUnique();
        b.Entity<Department>().HasOne(x=>x.Branch).WithMany().OnDelete(DeleteBehavior.Restrict);
        b.Entity<JobPosition>().Property(x=>x.Name).HasMaxLength(160);
        b.Entity<JobPosition>().HasIndex(x=>new{x.DepartmentId,x.Name}).IsUnique();
        b.Entity<JobPosition>().HasOne(x=>x.Department).WithMany().OnDelete(DeleteBehavior.Restrict);
        b.Entity<Employee>().Property(x=>x.Number).HasMaxLength(30);
        b.Entity<Employee>().Property(x=>x.FullName).HasMaxLength(160);
        b.Entity<Employee>().Property(x=>x.Email).HasMaxLength(254);
        b.Entity<Employee>().Property(x=>x.Phone).HasMaxLength(30);
        b.Entity<Employee>().Property(x=>x.Status).HasMaxLength(20);
        b.Entity<Employee>().Property(x=>x.ContractType).HasMaxLength(20);
        b.Entity<Employee>().HasIndex(x=>x.Number).IsUnique();
        b.Entity<Employee>().HasIndex(x=>x.UserId).IsUnique().HasFilter("[UserId] IS NOT NULL");
        b.Entity<Employee>().HasIndex(x=>new{x.JobPositionId,x.Status});
        b.Entity<Employee>().HasOne<ApplicationUser>().WithOne().HasForeignKey<Employee>(x=>x.UserId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Employee>().HasOne(x=>x.JobPosition).WithMany().OnDelete(DeleteBehavior.Restrict);
        b.Entity<Employee>().HasOne(x=>x.Manager).WithMany().HasForeignKey(x=>x.ManagerId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Employee>().ToTable(t=>{
            t.HasCheckConstraint("CK_Employee_Status","[Status] IN ('Active','Inactive','Terminated')");
            t.HasCheckConstraint("CK_Employee_Contract","[ContractType] IN ('FixedTerm','Indefinite')");
        });
        b.Entity<EmployeeFinancial>().HasIndex(x=>x.EmployeeId).IsUnique();
        b.Entity<EmployeeFinancial>().Property(x=>x.BaseSalary).HasPrecision(18,2);
        b.Entity<EmployeeFinancial>().Property(x=>x.Bank).HasMaxLength(120);
        b.Entity<EmployeeFinancial>().Property(x=>x.Iban).HasMaxLength(24);
        b.Entity<EmployeeFinancial>().HasOne(x=>x.Employee).WithOne().HasForeignKey<EmployeeFinancial>(x=>x.EmployeeId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<EmployeeFinancial>().ToTable(t=>t.HasCheckConstraint("CK_Financial_Salary","[BaseSalary] >= 0"));
        b.Entity<Attachment>().Property(x=>x.FileName).HasMaxLength(200);
        b.Entity<Attachment>().Property(x=>x.StorageKey).HasMaxLength(100);
        b.Entity<Attachment>().Property(x=>x.MediaType).HasMaxLength(100);
        b.Entity<Attachment>().HasOne(x=>x.Employee).WithMany().OnDelete(DeleteBehavior.Restrict);
        b.Entity<AuditEvent>().Property(x=>x.ActorId).HasMaxLength(450);
        b.Entity<AuditEvent>().Property(x=>x.Action).HasMaxLength(160);
        b.Entity<AuditEvent>().Property(x=>x.EntityId).HasMaxLength(100);
        b.Entity<AuditEvent>().HasIndex(x=>x.OccurredAt);
    }
    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var actor = http?.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "operator";
        foreach (var e in ChangeTracker.Entries<Versioned>().Where(e=>e.State is EntityState.Added or EntityState.Modified).ToList())
        {
            if(e.State==EntityState.Modified) e.Entity.Version=Guid.NewGuid();
            Audit.Add(new AuditEvent { ActorId=actor, Action=$"{e.Entity.GetType().Name}.{e.State}", EntityId=e.Entity.Id.ToString() });
        }
        return base.SaveChangesAsync(cancellationToken);
    }
}
public class DesignDbFactory : IDesignTimeDbContextFactory<HrDbContext>
{
    public HrDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<HrDbContext>()
        .UseSqlServer("Server=localhost;Database=HRPlatform_DesignOnly;Integrated Security=True;Encrypt=True").Options);
}
