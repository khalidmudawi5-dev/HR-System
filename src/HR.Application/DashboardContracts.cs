namespace HR.Application;

public record EmployeeSummary(int Total,int Active,int Inactive,int Terminated,int JoinedThisMonth);
public record StructureSummary(int Branches,int Departments,int Jobs);
public record SetupSummary(bool Organization,bool Branches,bool Departments,bool Jobs,bool Employees,bool LinkedAccounts);
public record RecentEmployee(Guid Id,string Number,string FullName,string Status,DateOnly JoinDate,string Job,string Department,string Branch);
public record BranchSummary(Guid Id,string Name,int Employees);
public record ActivityView(long Id,DateTimeOffset OccurredAt,string ActorId,string ActorName,string Action,string EntityId);
public record DashboardView(string OrganizationName,string TimeZone,DateOnly BusinessDate,string? CurrentEmployeeName,
    string Scope,EmployeeSummary? Employees,StructureSummary? Structure,SetupSummary? Setup,
    IReadOnlyList<RecentEmployee> RecentEmployees,IReadOnlyList<BranchSummary> Branches,IReadOnlyList<ActivityView> Activity);
