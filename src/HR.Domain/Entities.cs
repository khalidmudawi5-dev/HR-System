namespace HR.Domain;

public abstract class Versioned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid Version { get; set; } = Guid.NewGuid();
}
public class Organization : Versioned
{
    public int Singleton { get; set; } = 1;
    public string Name { get; set; } = "HR Platform";
    public string TimeZone { get; set; } = "Asia/Riyadh";
}
public interface INamedUnit { string Name {get;set;} }
public class Branch : Versioned,INamedUnit { public string Name { get; set; } = ""; }
public class Department : Versioned,INamedUnit
{
    public string Name { get; set; } = "";
    public Guid BranchId { get; set; }
    public Branch Branch { get; set; } = null!;
}
public class JobPosition : Versioned,INamedUnit
{
    public string Name { get; set; } = "";
    public Guid DepartmentId { get; set; }
    public Department Department { get; set; } = null!;
}
public class Employee : Versioned
{
    public string Number { get; set; } = "";
    public string FullName { get; set; } = "";
    public string Email { get; set; } = "";
    public string Phone { get; set; } = "";
    public DateOnly JoinDate { get; set; }
    public string Status { get; set; } = "Active";
    public string ContractType { get; set; } = "FixedTerm";
    public Guid JobPositionId { get; set; }
    public JobPosition JobPosition { get; set; } = null!;
    public Guid? ManagerId { get; set; }
    public Employee? Manager { get; set; }
    public string? UserId { get; set; }
}
public class EmployeeFinancial : Versioned
{
    public Guid EmployeeId { get; set; }
    public Employee Employee { get; set; } = null!;
    public decimal BaseSalary { get; set; }
    public string Bank { get; set; } = "";
    public string Iban { get; set; } = "";
    public DateOnly EffectiveFrom { get; set; }
}
public class Attachment : Versioned
{
    public Guid EmployeeId { get; set; }
    public Employee Employee { get; set; } = null!;
    public string StorageKey { get; set; } = "";
    public string FileName { get; set; } = "";
    public string MediaType { get; set; } = "";
    public long Size { get; set; }
}
public class AuditEvent
{
    public long Id { get; set; }
    public DateTimeOffset OccurredAt { get; set; } = DateTimeOffset.UtcNow;
    public string ActorId { get; set; } = "system";
    public string Action { get; set; } = "";
    public string EntityId { get; set; } = "";
}
