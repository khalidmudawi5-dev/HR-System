using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text.RegularExpressions;
using HR.Domain;

namespace HR.Application;

public static class Access
{
    public static readonly string[] Roles = ["Administrator", "HR", "Payroll", "Manager", "Employee"];
    public static bool IsHr(ClaimsPrincipal u) => u.IsInRole("Administrator") || u.IsInRole("HR");
    public static bool IsPayroll(ClaimsPrincipal u) => u.IsInRole("Administrator") || u.IsInRole("Payroll");
    public static string UserId(ClaimsPrincipal u) => u.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "";
}
public class RuleException(string message) : Exception(message);
public record EmployeeInput(string Number, string FullName, string Email, string Phone,
    DateOnly JoinDate, string Status, string ContractType, Guid JobPositionId, Guid? ManagerId, Guid? Version);
public record EmployeeView(Guid Id, Guid Version, string Number, string FullName, string Email,
    string Phone, DateOnly JoinDate, string Status, string ContractType, Guid JobPositionId, Guid? ManagerId);
public record FinancialInput(decimal BaseSalary, string Bank, string Iban, DateOnly EffectiveFrom, Guid? Version);
public record OrganizationInput(string Name, string TimeZone, Guid? Version);
public record UnitInput(string Name, Guid? ParentId,Guid? Version=null);
public record LoginInput(string Email, string Password);
public record UserInput(string Email, string Password, string Role, Guid? EmployeeId);
public record RoleInput(string Role);
public record PasswordInput(string CurrentPassword,string NewPassword);
public record ActiveInput(bool IsActive);

public static partial class Rules
{
    [GeneratedRegex("^[A-Z0-9][A-Z0-9_-]{0,29}$")]
    private static partial Regex NumberPattern();
    public static string Text(string? value, int max, string label, bool optional = false)
    {
        var s = value?.Trim() ?? "";
        if ((!optional && s.Length == 0) || s.Length > max || s.Any(char.IsControl))
            throw new RuleException($"قيمة {label} غير صالحة (الحد {max}).");
        return s;
    }
    public static EmployeeInput Employee(EmployeeInput x)
    {
        var n = Text(x.Number, 30, "الرقم الوظيفي").ToUpperInvariant();
        if (!NumberPattern().IsMatch(n)) throw new RuleException("الرقم الوظيفي: أحرف إنجليزية وأرقام وشرطة فقط.");
        var email = Text(x.Email, 254, "البريد", true);
        if (email != "" && !new EmailAddressAttribute().IsValid(email)) throw new RuleException("البريد الإلكتروني غير صالح.");
        if (x.JoinDate == default || x.Status is not ("Active" or "Inactive" or "Terminated") ||
            x.ContractType is not ("FixedTerm" or "Indefinite") || x.JobPositionId == Guid.Empty)
            throw new RuleException("تحقق من تاريخ الالتحاق والحالة والعقد والوظيفة.");
        return x with { Number = n, FullName = Text(x.FullName, 160, "الاسم"), Email = email, Phone = Text(x.Phone, 30, "الهاتف", true) };
    }
    public static string SaudiIban(string? value)
    {
        var s = (value ?? "").Replace(" ", "").ToUpperInvariant();
        if (s == "") return s;
        if (s.Length != 24 || !s.StartsWith("SA") || !s[2..].All(char.IsAsciiDigit)) throw new RuleException("IBAN سعودي غير صالح.");
        var remainder = 0;
        foreach (var c in s[4..] + s[..4])
            foreach (var digit in char.IsAsciiLetterUpper(c) ? ((int)c - 55).ToString() : c.ToString())
                remainder = (remainder * 10 + digit - '0') % 97;
        if (remainder != 1) throw new RuleException("رقم تحقق IBAN غير صحيح.");
        return s;
    }
    public static EmployeeView View(Employee x) => new(x.Id, x.Version, x.Number, x.FullName, x.Email,
        x.Phone, x.JoinDate, x.Status, x.ContractType, x.JobPositionId, x.ManagerId);
    public static void Apply(Employee e, EmployeeInput x)
    {
        e.Number=x.Number; e.FullName=x.FullName; e.Email=x.Email; e.Phone=x.Phone;
        e.JoinDate=x.JoinDate; e.Status=x.Status; e.ContractType=x.ContractType;
        e.JobPositionId=x.JobPositionId; e.ManagerId=x.ManagerId;
    }
}
