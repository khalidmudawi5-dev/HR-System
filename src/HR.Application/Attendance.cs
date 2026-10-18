using System.Globalization;
using HR.Domain;

namespace HR.Application;

public record ShiftInput(string Name,int StartMinute,int EndMinute,bool EndsNextDay,int BreakOffsetMinutes=0,
    int BreakMinutes=0,int ArrivalGraceMinutes=0,int DepartureGraceMinutes=0,int CaptureBeforeMinutes=60,int CaptureAfterMinutes=120);
public record ScheduleInput(Guid[] EmployeeIds,DateOnly From,DateOnly To,Guid ShiftId,int WorkDaysMask);
public record ScheduleChange(Guid? ShiftId,bool IsRestDay,Guid Version,string Reason);
public record HolidayInput(DateOnly Date,string Name);
public record PolicyInput(bool PortalEnabled,Guid? Version);
public record PortalPunchInput(string Kind,Guid RequestId);
public record CorrectionInput(Guid ScheduleId,string FirstInLocal,string LastOutLocal,string Reason);
public record CorrectionDecision(string Decision,string Note,Guid Version);
public record AttendanceResult(string Status,DateTime? FirstInUtc,DateTime? LastOutUtc,int WorkedMinutes,
    int LateMinutes,int EarlyMinutes,int ExtraPresenceMinutes,int RawCount,bool Corrected,bool HasException);
public record AttendanceRow(Guid Id,Guid Version,Guid EmployeeId,string Number,string FullName,DateOnly WorkDate,
    string ShiftName,string TimeZone,bool IsRestDay,DateTime? StartsAtUtc,DateTime? EndsAtUtc,AttendanceResult Result);

public static class AttendanceRules
{
    public static WorkShift Shift(ShiftInput x)
    {
        var duration=x.EndMinute+(x.EndsNextDay?1440:0)-x.StartMinute;
        if(x.StartMinute is <0 or >1439 || x.EndMinute is <0 or >1439 || duration is <1 or >960 ||
            x.BreakMinutes is <0 or >180 || x.BreakOffsetMinutes<0 || (x.BreakMinutes>0&&x.BreakOffsetMinutes+x.BreakMinutes>duration) ||
            x.ArrivalGraceMinutes is <0 or >120 || x.DepartureGraceMinutes is <0 or >120 ||
            x.CaptureBeforeMinutes is <0 or >120 || x.CaptureAfterMinutes is <0 or >240)
            throw new RuleException("تحقق من أوقات الشفت: مدته حتى 16 ساعة، والاستراحة داخله، والسماح حتى 120 دقيقة.");
        return new WorkShift{Name=Rules.Text(x.Name,100,"اسم الشفت"),StartMinute=x.StartMinute,EndMinute=x.EndMinute,
            EndsNextDay=x.EndsNextDay,BreakOffsetMinutes=x.BreakMinutes==0?0:x.BreakOffsetMinutes,BreakMinutes=x.BreakMinutes,
            ArrivalGraceMinutes=x.ArrivalGraceMinutes,DepartureGraceMinutes=x.DepartureGraceMinutes,
            CaptureBeforeMinutes=x.CaptureBeforeMinutes,CaptureAfterMinutes=x.CaptureAfterMinutes};
    }
    public static string Note(string? value,string label,bool optional=false)
    {
        var note=(value??"").Replace("\r\n","\n").Replace('\r','\n').Trim();
        if((!optional&&note.Length==0)||note.Length>500||note.Any(c=>char.IsControl(c)&&c!='\n'&&c!='\t'))
            throw new RuleException($"قيمة {label} غير صالحة (الحد 500).");
        return note;
    }
    public static DateTime ToUtc(DateTime local,string zoneName)
    {
        var zone=TimeZoneInfo.FindSystemTimeZoneById(zoneName);
        local=DateTime.SpecifyKind(local,DateTimeKind.Unspecified);
        if(zone.IsInvalidTime(local)||zone.IsAmbiguousTime(local)) throw new RuleException("الوقت المحلي غير محدد بسبب تغيير التوقيت؛ اختر وقتًا آخر.");
        return TimeZoneInfo.ConvertTimeToUtc(local,zone);
    }
    public static DateTime ParseLocal(string value,string zone) => ToUtc(DateTime.ParseExact(value,"yyyy-MM-ddTHH:mm",CultureInfo.InvariantCulture),zone);
    public static (DateTime Start,DateTime End,DateTime Open,DateTime Close) Window(WorkSchedule schedule)
    {
        var day=schedule.WorkDate.ToDateTime(TimeOnly.MinValue);
        var shift=schedule.Shift;
        var start=ToUtc(day.AddMinutes(shift?.StartMinute??0),schedule.TimeZone);
        var end=ToUtc(day.AddDays(shift?.EndsNextDay==true||shift is null?1:0).AddMinutes(shift?.EndMinute??0),schedule.TimeZone);
        return(start,end,start.AddMinutes(-(shift?.CaptureBeforeMinutes??0)),end.AddMinutes(shift?.CaptureAfterMinutes??0));
    }
    public static DateTime Utc(DateTime value) => DateTime.SpecifyKind(value,DateTimeKind.Utc);
    public static AttendanceResult Calculate(WorkSchedule schedule,IEnumerable<AttendancePunch> source,DateTime now,
        bool holiday=false,AttendanceCorrection? correction=null)
    {
        var window=Window(schedule);var shift=schedule.Shift;var raw=source.OrderBy(x=>x.OccurredAtUtc).ThenBy(x=>x.Kind).ToArray();
        var punches=correction is null ? raw : new[]{new AttendancePunch{Kind="In",OccurredAtUtc=correction.FirstInUtc},new AttendancePunch{Kind="Out",OccurredAtUtc=correction.LastOutUtc}};
        DateTime? open=null,first=null,last=null;var invalid=false;double worked=0,extra=0;
        var breakStart=window.Start.AddMinutes(shift?.BreakOffsetMinutes??0);var breakEnd=breakStart.AddMinutes(shift?.BreakMinutes??0);
        foreach(var punch in punches)
        {
            var at=Utc(punch.OccurredAtUtc);
            if(punch.Kind=="In") {first??=at;if(open.HasValue)invalid=true;else open=at;}
            else if(punch.Kind=="Out")
            {
                last=at;
                if(!open.HasValue||at<=open.Value){invalid=true;continue;}
                var start=open.Value>window.Start?open.Value:window.Start;var end=at<window.End?at:window.End;
                var inside=Math.Max(0,(end-start).TotalSeconds);
                var overlapStart=start>breakStart?start:breakStart;var overlapEnd=end<breakEnd?end:breakEnd;
                worked+=Math.Max(0,inside-Math.Max(0,(overlapEnd-overlapStart).TotalSeconds));
                extra+=Math.Max(0,(at-open.Value).TotalSeconds-inside);open=null;
            }
        }
        invalid|=open.HasValue;
        var off=schedule.IsRestDay||holiday;
        var late=off||first is null?0:Math.Max(0,(int)Math.Ceiling((first.Value-window.Start).TotalMinutes)-(shift?.ArrivalGraceMinutes??0));
        var early=off||last is null?0:Math.Max(0,(int)Math.Ceiling((window.End-last.Value).TotalMinutes)-(shift?.DepartureGraceMinutes??0));
        var status=holiday?"Holiday":schedule.IsRestDay?"RestDay":now<window.Start?"Scheduled":now<window.Close?"InProgress":punches.Length==0?"Absent":invalid?"Incomplete":"Present";
        if(off){extra+=worked;worked=0;}
        return new(status,first,last,(int)Math.Floor(worked/60),late,early,(int)Math.Floor(extra/60),raw.Length,correction!=null,
            status is "Absent" or "Incomplete" || late>0 || early>0);
    }
}
