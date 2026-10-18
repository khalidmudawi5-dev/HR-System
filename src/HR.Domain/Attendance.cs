namespace HR.Domain;

// Shift definitions are immutable after creation. Create a replacement definition to change policy.
public class WorkShift : Versioned
{
    public string Name { get; set; } = "";
    public int StartMinute { get; set; }
    public int EndMinute { get; set; }
    public bool EndsNextDay { get; set; }
    public int BreakOffsetMinutes { get; set; }
    public int BreakMinutes { get; set; }
    public int ArrivalGraceMinutes { get; set; }
    public int DepartureGraceMinutes { get; set; }
    public int CaptureBeforeMinutes { get; set; } = 60;
    public int CaptureAfterMinutes { get; set; } = 120;
}
public class WorkSchedule : Versioned
{
    public Guid EmployeeId { get; set; }
    public Employee Employee { get; set; } = null!;
    public DateOnly WorkDate { get; set; }
    public Guid? ShiftId { get; set; }
    public WorkShift? Shift { get; set; }
    public bool IsRestDay { get; set; }
    public string TimeZone { get; set; } = "Asia/Riyadh";
    public string LastChangeReason { get; set; } = "";
}
public class AttendanceHoliday : Versioned
{
    public DateOnly Date { get; set; }
    public string Name { get; set; } = "";
}
public class AttendancePolicy : Versioned
{
    public int Singleton { get; set; } = 1;
    public bool PortalEnabled { get; set; }
}
public class AttendancePunch : Versioned
{
    public Guid EmployeeId { get; set; }
    public Employee Employee { get; set; } = null!;
    public DateTime OccurredAtUtc { get; set; }
    public string Kind { get; set; } = "In";
    public string Source { get; set; } = "Excel";
    public DateTime RecordedAtUtc { get; set; }
}
public class AttendanceCorrection : Versioned
{
    public Guid ScheduleId { get; set; }
    public WorkSchedule Schedule { get; set; } = null!;
    public Guid ScheduleVersion { get; set; }
    // A filtered unique key reserves the day while pending or approved.
    public Guid? ActiveScheduleId { get; set; }
    public DateTime FirstInUtc { get; set; }
    public DateTime LastOutUtc { get; set; }
    public string Reason { get; set; } = "";
    public string Status { get; set; } = "Pending";
    public string RequestedBy { get; set; } = "";
    public DateTime RequestedAtUtc { get; set; }
    public string? ReviewedBy { get; set; }
    public DateTime? ReviewedAtUtc { get; set; }
    public string ReviewNote { get; set; } = "";
}
