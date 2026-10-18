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

    public DbSet<WorkShift> WorkShifts => Set<WorkShift>();
    public DbSet<WorkSchedule> WorkSchedules => Set<WorkSchedule>();
    public DbSet<AttendanceHoliday> AttendanceHolidays => Set<AttendanceHoliday>();
    public DbSet<AttendancePolicy> AttendancePolicies => Set<AttendancePolicy>();
    public DbSet<AttendancePunch> AttendancePunches => Set<AttendancePunch>();
    public DbSet<AttendanceCorrection> AttendanceCorrections => Set<AttendanceCorrection>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);
        foreach (var t in new[] { typeof(Organization), typeof(Branch), typeof(Department), typeof(JobPosition), typeof(Employee), typeof(EmployeeFinancial), typeof(Attachment),typeof(WorkShift),typeof(WorkSchedule),typeof(AttendanceHoliday),typeof(AttendancePolicy),typeof(AttendancePunch),typeof(AttendanceCorrection) })
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
        b.Entity<WorkShift>().Property(x=>x.Name).HasMaxLength(100);
        b.Entity<WorkShift>().HasIndex(x=>x.Name).IsUnique();
        b.Entity<WorkSchedule>().HasIndex(x=>new{x.EmployeeId,x.WorkDate}).IsUnique();
        b.Entity<WorkSchedule>().Property(x=>x.LastChangeReason).HasMaxLength(500);
        b.Entity<WorkSchedule>().ToTable(t=>t.HasCheckConstraint("CK_WorkSchedule_Shift","([IsRestDay] = 1 AND [ShiftId] IS NULL) OR ([IsRestDay] = 0 AND [ShiftId] IS NOT NULL)"));
        b.Entity<WorkSchedule>().Property(x=>x.TimeZone).HasMaxLength(100);
        b.Entity<WorkSchedule>().HasOne(x=>x.Employee).WithMany().OnDelete(DeleteBehavior.Restrict);
        b.Entity<WorkSchedule>().HasOne(x=>x.Shift).WithMany().OnDelete(DeleteBehavior.Restrict);
        b.Entity<AttendanceHoliday>().HasIndex(x=>x.Date).IsUnique();
        b.Entity<AttendanceHoliday>().Property(x=>x.Name).HasMaxLength(160);
        b.Entity<AttendancePolicy>().HasIndex(x=>x.Singleton).IsUnique();
        b.Entity<AttendancePolicy>().ToTable(t=>t.HasCheckConstraint("CK_AttendancePolicy_Singleton","[Singleton] = 1"));
        b.Entity<AttendancePunch>().HasIndex(x=>new{x.EmployeeId,x.OccurredAtUtc,x.Kind}).IsUnique();
        b.Entity<AttendancePunch>().HasOne(x=>x.Employee).WithMany().OnDelete(DeleteBehavior.Restrict);
        b.Entity<AttendancePunch>().Property(x=>x.OccurredAtUtc).HasConversion(v=>v,v=>DateTime.SpecifyKind(v,DateTimeKind.Utc));
        b.Entity<AttendancePunch>().Property(x=>x.RecordedAtUtc).HasConversion(v=>v,v=>DateTime.SpecifyKind(v,DateTimeKind.Utc));
        b.Entity<AttendanceCorrection>().Property(x=>x.FirstInUtc).HasConversion(v=>v,v=>DateTime.SpecifyKind(v,DateTimeKind.Utc));
        b.Entity<AttendanceCorrection>().Property(x=>x.LastOutUtc).HasConversion(v=>v,v=>DateTime.SpecifyKind(v,DateTimeKind.Utc));
        b.Entity<AttendanceCorrection>().Property(x=>x.RequestedAtUtc).HasConversion(v=>v,v=>DateTime.SpecifyKind(v,DateTimeKind.Utc));
        b.Entity<AttendancePunch>().Property(x=>x.Kind).HasMaxLength(10);
        b.Entity<AttendancePunch>().Property(x=>x.Source).HasMaxLength(50);
        b.Entity<AttendancePunch>().ToTable(t=>t.HasCheckConstraint("CK_AttendancePunch_Kind","[Kind] IN ('In','Out')"));
        b.Entity<AttendanceCorrection>().HasIndex(x=>x.ActiveScheduleId).IsUnique().HasFilter("[ActiveScheduleId] IS NOT NULL");
        b.Entity<AttendanceCorrection>().HasOne(x=>x.Schedule).WithMany().OnDelete(DeleteBehavior.Restrict);
        b.Entity<AttendanceCorrection>().Property(x=>x.Reason).HasMaxLength(500);
        b.Entity<AttendanceCorrection>().Property(x=>x.ReviewNote).HasMaxLength(500);
        b.Entity<AttendanceCorrection>().Property(x=>x.Status).HasMaxLength(20);
        b.Entity<AttendanceCorrection>().Property(x=>x.RequestedBy).HasMaxLength(450);
        b.Entity<AttendanceCorrection>().Property(x=>x.ReviewedBy).HasMaxLength(450);
        b.Entity<AttendanceCorrection>().ToTable(t=>t.HasCheckConstraint("CK_AttendanceCorrection_Status","[Status] IN ('Pending','Approved','Rejected','Cancelled')"));
        b.Entity<AuditEvent>().Property(x=>x.ActorId).HasMaxLength(450);
        b.Entity<AuditEvent>().Property(x=>x.Action).HasMaxLength(160);
        b.Entity<AuditEvent>().Property(x=>x.EntityId).HasMaxLength(100);
        b.Entity<AuditEvent>().HasIndex(x=>x.OccurredAt);
    }
    private void PrepareChanges()
    {
        if(ChangeTracker.Entries<AttendancePunch>().Any(e=>e.State is EntityState.Modified or EntityState.Deleted))
            throw new InvalidOperationException("Raw attendance punches are append-only.");
        if(ChangeTracker.Entries<WorkShift>().Any(e=>e.State is EntityState.Modified or EntityState.Deleted))
            throw new InvalidOperationException("Shift definitions are immutable; create a replacement.");
        var actor = http?.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "operator";
        foreach (var e in ChangeTracker.Entries<Versioned>().Where(e=>e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted).ToList())
        {
            if(e.State==EntityState.Modified) e.Entity.Version=Guid.NewGuid();
            Audit.Add(new AuditEvent { ActorId=actor, Action=$"{e.Entity.GetType().Name}.{e.State}", EntityId=e.Entity.Id.ToString() });
        }
    }
    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess,CancellationToken cancellationToken = default)
    {PrepareChanges();return base.SaveChangesAsync(acceptAllChangesOnSuccess,cancellationToken);}
    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {PrepareChanges();return base.SaveChanges(acceptAllChangesOnSuccess);}

}
public class DesignDbFactory : IDesignTimeDbContextFactory<HrDbContext>
{
    public HrDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<HrDbContext>()
        .UseSqlServer("Server=localhost;Database=HRPlatform_DesignOnly;Integrated Security=True;Encrypt=True").Options);
}
