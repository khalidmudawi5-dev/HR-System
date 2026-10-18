using HR.Application;
using HR.Domain;
using Xunit;
namespace HR.Tests;
public class AttendanceCalculationTests
{
    private static WorkSchedule Schedule(bool night=false,int grace=0,int pause=0) => new(){WorkDate=new(2026,10,15),TimeZone="Asia/Riyadh",
        Shift=AttendanceRules.Shift(new(night?"ليلي":"صباحي",night?1320:480,night?360:960,night,240,pause,grace,grace,60,120))};
    private static AttendancePunch Punch(string local,string kind)=>new(){Kind=kind,OccurredAtUtc=AttendanceRules.ParseLocal(local,"Asia/Riyadh")};
    private static DateTime Closed=>new(2026,10,17,0,0,0,DateTimeKind.Utc);
    [Fact] public void Night_shift_pairs_checkout_on_next_calendar_day()
    {
        var s=Schedule(true);var w=AttendanceRules.Window(s);Assert.Equal(new DateTime(2026,10,15,19,0,0,DateTimeKind.Utc),w.Start);Assert.Equal(w.Start.AddHours(8),w.End);
        var r=AttendanceRules.Calculate(s,[Punch("2026-10-15T22:00","In"),Punch("2026-10-16T06:00","Out")],Closed);
        Assert.Equal("Present",r.Status);Assert.Equal(480,r.WorkedMinutes);Assert.Equal(0,r.LateMinutes);Assert.Equal(0,r.EarlyMinutes);
    }
    [Fact] public void Break_is_deducted_only_where_it_overlaps_worked_pairs()
    {
        var r=AttendanceRules.Calculate(Schedule(pause:60),[Punch("2026-10-15T08:00","In"),Punch("2026-10-15T12:30","Out"),Punch("2026-10-15T13:00","In"),Punch("2026-10-15T16:00","Out")],Closed);
        Assert.Equal(420,r.WorkedMinutes);Assert.Equal("Present",r.Status);
        r=AttendanceRules.Calculate(Schedule(pause:60),[Punch("2026-10-15T13:00","In"),Punch("2026-10-15T16:00","Out")],Closed);
        Assert.Equal(180,r.WorkedMinutes);
    }
    [Theory][InlineData(5,0)][InlineData(8,3)] public void Grace_is_subtracted_from_late_and_early_minutes(int diff,int expected)
    {
        var r=AttendanceRules.Calculate(Schedule(grace:5),[Punch($"2026-10-15T08:{diff:00}","In"),Punch($"2026-10-15T15:{60-diff:00}","Out")],Closed);
        Assert.Equal(expected,r.LateMinutes);Assert.Equal(expected,r.EarlyMinutes);
    }
    [Fact] public void Outside_shift_presence_is_separate_from_work_and_not_approved_overtime()
    {
        var r=AttendanceRules.Calculate(Schedule(),[Punch("2026-10-15T07:30","In"),Punch("2026-10-15T17:00","Out")],Closed);
        Assert.Equal(480,r.WorkedMinutes);Assert.Equal(90,r.ExtraPresenceMinutes);
    }
    [Fact] public void Missing_and_conflicting_punches_are_exceptions()
    {
        var s=Schedule();var first=Punch("2026-10-15T08:00","In");
        Assert.Equal("Incomplete",AttendanceRules.Calculate(s,[first],Closed).Status);
        var r=AttendanceRules.Calculate(s,[first,Punch("2026-10-15T08:05","In"),Punch("2026-10-15T16:00","Out")],Closed);
        Assert.Equal("Incomplete",r.Status);Assert.True(r.HasException);
        Assert.Equal("Incomplete",AttendanceRules.Calculate(s,[Punch("2026-10-15T16:00","Out")],Closed).Status);
    }
    [Fact] public void Absence_is_not_final_until_capture_window_closes()
    {
        var s=Schedule();var w=AttendanceRules.Window(s);
        Assert.Equal("Scheduled",AttendanceRules.Calculate(s,[],w.Start.AddMinutes(-1)).Status);
        Assert.Equal("InProgress",AttendanceRules.Calculate(s,[],w.Close.AddMinutes(-1)).Status);
        Assert.Equal("Absent",AttendanceRules.Calculate(s,[],w.Close).Status);
    }
    [Fact] public void Holidays_and_rest_days_do_not_generate_absence()
    {
        var s=Schedule();Assert.Equal("Holiday",AttendanceRules.Calculate(s,[],Closed,true).Status);
        s.IsRestDay=true;s.Shift=null;Assert.Equal("RestDay",AttendanceRules.Calculate(s,[],Closed).Status);
        var r=AttendanceRules.Calculate(Schedule(),[Punch("2026-10-15T08:00","In"),Punch("2026-10-15T16:00","Out")],Closed,true);
        Assert.Equal(0,r.WorkedMinutes);Assert.Equal(480,r.ExtraPresenceMinutes);
    }
    [Fact] public void Approved_correction_overlays_calculation_and_preserves_original_count()
    {
        var original=Punch("2026-10-15T08:12","In");var c=new AttendanceCorrection{FirstInUtc=Punch("2026-10-15T08:00","In").OccurredAtUtc,LastOutUtc=Punch("2026-10-15T16:00","Out").OccurredAtUtc};
        var r=AttendanceRules.Calculate(Schedule(),[original],Closed,correction:c);
        Assert.True(r.Corrected);Assert.Equal(1,r.RawCount);Assert.Equal("Present",r.Status);Assert.Equal(480,r.WorkedMinutes);Assert.Equal(12,original.OccurredAtUtc.Minute);
    }
    [Fact] public void Notes_support_multiline_text_and_zero_break_does_not_limit_short_shifts()
    {
        Assert.Equal("سطر أول\nسطر ثان",AttendanceRules.Note("سطر أول\r\nسطر ثان","السبب"));
        Assert.Throws<RuleException>(()=>AttendanceRules.Note("قيمة\0غير صالحة","السبب"));
        Assert.Equal(0,AttendanceRules.Shift(new("شفت قصير",480,600,false,240,0)).BreakOffsetMinutes);
    }
    [Theory][InlineData(480,480,false)][InlineData(480,480,true)][InlineData(1320,360,false)]
    public void Invalid_or_overlong_shifts_are_rejected(int start,int end,bool next)=>Assert.Throws<RuleException>(()=>AttendanceRules.Shift(new("غير صالح",start,end,next)));
    [Fact] public void Invalid_break_and_dst_ambiguity_are_rejected()
    {
        Assert.Throws<RuleException>(()=>AttendanceRules.Shift(new("استراحة خارج الشفت",480,960,false,470,60)));
        Assert.Throws<RuleException>(()=>AttendanceRules.ParseLocal("2026-11-01T01:30","America/New_York"));
        Assert.Throws<RuleException>(()=>AttendanceRules.ParseLocal("2026-03-08T02:30","America/New_York"));
    }
}
