using System.Security.Claims;
using HR.Application;
using HR.Domain;
using Microsoft.EntityFrameworkCore;

namespace HR.Infrastructure;

public class AttendanceService(HrDbContext db,EmployeeService employees,TimeProvider clock)
{
    public DateTime Now => clock.GetUtcNow().UtcDateTime;
    public async Task<string> Zone(CancellationToken ct=default) => await db.Organizations.Select(x=>x.TimeZone).SingleOrDefaultAsync(ct)??"Asia/Riyadh";
    public async Task<DateOnly> Today(CancellationToken ct=default) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(Now,TimeZoneInfo.FindSystemTimeZoneById(await Zone(ct))));
    public static void Range(DateOnly from,DateOnly to)
    {
        if(from==default||to<from||to.DayNumber-from.DayNumber>30||from.Year<2000||to.Year>2099)
            throw new RuleException("اختر فترة صحيحة لا تزيد على 31 يومًا بين 2000 و2099.");
    }
    public async Task<object> Context(ClaimsPrincipal actor,CancellationToken ct)
    {
        var zone=await Zone(ct);var own=await db.Employees.AsNoTracking().SingleOrDefaultAsync(x=>x.UserId==Access.UserId(actor),ct);
        var enabled=await db.AttendancePolicies.Select(x=>x.PortalEnabled).SingleOrDefaultAsync(ct);
        return new{timeZone=zone,today=await Today(ct),serverTimeUtc=Now,portalEnabled=enabled,ownEmployeeId=own?.Id,ownEmployeeName=own?.FullName};
    }
    private static void ValidateWindows(IEnumerable<WorkSchedule> schedules)
    {
        foreach(var group in schedules.Where(x=>!x.IsRestDay).GroupBy(x=>x.EmployeeId))
        {
            var ordered=group.Select(x=>AttendanceRules.Window(x)).OrderBy(x=>x.Open).ToArray();
            for(var i=1;i<ordered.Length;i++) if(ordered[i].Open<=ordered[i-1].Close)
                throw new RuleException("الشفتات أو نوافذ استقبال البصمات متداخلة لهذا الموظف. قلل نافذة الالتقاط أو غيّر الجدول.");
        }
    }
    public async Task<int> Assign(ScheduleInput x,CancellationToken ct)
    {
        Range(x.From,x.To);
        if(x.EmployeeIds is null||x.EmployeeIds.Length is <1 or >100||x.EmployeeIds.Distinct().Count()!=x.EmployeeIds.Length||x.WorkDaysMask is <1 or >127)
            throw new RuleException("اختر من 1 إلى 100 موظف وأيام العمل.");
        await using var tx=await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable,ct);
        var shift=await db.WorkShifts.SingleOrDefaultAsync(s=>s.Id==x.ShiftId,ct)??throw new RuleException("الشفت غير موجود.");
        var selected=await db.Employees.Where(e=>x.EmployeeIds.Contains(e.Id)&&e.Status=="Active").ToListAsync(ct);
        if(selected.Count!=x.EmployeeIds.Length||selected.Any(e=>e.JoinDate>x.From))throw new RuleException("الموظفون يجب أن يكونوا نشطين، وألا تسبق الفترة تاريخ التحاقهم.");
        var lower=x.From.AddDays(-2);var upper=x.To.AddDays(2);
        var existing=await db.WorkSchedules.Where(s=>x.EmployeeIds.Contains(s.EmployeeId)&&s.WorkDate>=lower&&s.WorkDate<=upper).Include(s=>s.Shift).ToListAsync(ct);
        if(existing.Any(s=>s.WorkDate>=x.From&&s.WorkDate<=x.To))throw new RuleException("توجد جداول في هذه الفترة. عدّل اليوم المطلوب من التقرير بدل الكتابة فوقه.");
        var zone=await Zone(ct);var added=new List<WorkSchedule>();
        foreach(var e in selected)for(var d=x.From;d<=x.To;d=d.AddDays(1))
        {
            var rest=(x.WorkDaysMask&(1<<(int)d.DayOfWeek))==0;
            added.Add(new WorkSchedule{EmployeeId=e.Id,WorkDate=d,IsRestDay=rest,Shift=rest?null:shift,TimeZone=zone});
        }
        ValidateWindows(existing.Concat(added));db.WorkSchedules.AddRange(added);
        await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return added.Count;
    }
    public async Task Change(Guid id,ScheduleChange x,CancellationToken ct)
    {
        var reason=AttendanceRules.Note(x.Reason,"سبب تغيير الجدول");
        await using var tx=await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable,ct);
        var s=await db.WorkSchedules.Include(s=>s.Shift).SingleOrDefaultAsync(s=>s.Id==id,ct)??throw new RuleException("الجدول غير موجود.");
        if(s.Version!=x.Version)throw new DbUpdateConcurrencyException();
        if(await db.AttendanceCorrections.AnyAsync(c=>c.ActiveScheduleId==id,ct))throw new RuleException("يوجد تصحيح معلق أو معتمد لهذا اليوم. لا يمكن تغيير جدوله.");
        s.Shift=x.IsRestDay?null:await db.WorkShifts.SingleOrDefaultAsync(z=>z.Id==x.ShiftId,ct)??throw new RuleException("اختر شفتًا موجودًا.");
        s.ShiftId=s.Shift?.Id;s.IsRestDay=x.IsRestDay;
        var lo=s.WorkDate.AddDays(-2);var hi=s.WorkDate.AddDays(2);
        var neighbors=await db.WorkSchedules.Where(z=>z.EmployeeId==s.EmployeeId&&z.Id!=id&&z.WorkDate>=lo&&z.WorkDate<=hi).Include(z=>z.Shift).ToListAsync(ct);
        ValidateWindows(neighbors.Append(s));
        // Store only an action marker in the shared audit; sensitive notes stay in the workflow.
        s.LastChangeReason=reason;await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);
    }
    public async Task<object> Report(ClaimsPrincipal actor,DateOnly from,DateOnly to,Guid? employeeId,string? q,int page,CancellationToken ct)
    {
        Range(from,to);var visible=employees.Visible(actor);
        if(employeeId.HasValue)visible=visible.Where(e=>e.Id==employeeId.Value);
        if(!string.IsNullOrWhiteSpace(q)){var text=Rules.Text(q,160,"البحث");visible=visible.Where(e=>e.FullName.Contains(text)||e.Number.Contains(text));}
        var query=db.WorkSchedules.AsNoTracking().Where(s=>s.WorkDate>=from&&s.WorkDate<=to&&visible.Select(e=>e.Id).Contains(s.EmployeeId));
        var total=await query.CountAsync(ct);
        var schedules=await query.Include(s=>s.Employee).Include(s=>s.Shift).OrderByDescending(s=>s.WorkDate).ThenBy(s=>s.Employee.Number).Skip((Math.Clamp(page,1,100000)-1)*20).Take(20).ToListAsync(ct);
        if(schedules.Count==0)return new{total,items=Array.Empty<AttendanceRow>(),calculatedAtUtc=Now};
        var ids=schedules.Select(s=>s.EmployeeId).Distinct().ToArray();var min=from.ToDateTime(TimeOnly.MinValue).AddDays(-2);var max=to.ToDateTime(TimeOnly.MinValue).AddDays(3);
        var raw=await db.AttendancePunches.AsNoTracking().Where(p=>ids.Contains(p.EmployeeId)&&p.OccurredAtUtc>=min&&p.OccurredAtUtc<max).ToListAsync(ct);
        var holidays=(await db.AttendanceHolidays.Where(h=>h.Date>=from&&h.Date<=to).Select(h=>h.Date).ToListAsync(ct)).ToHashSet();
        var scheduleIds=schedules.Select(s=>s.Id).ToArray();
        var corrections=await db.AttendanceCorrections.AsNoTracking().Where(c=>scheduleIds.Contains(c.ScheduleId)&&c.Status=="Approved").ToDictionaryAsync(c=>c.ScheduleId,ct);
        var neighbors=await db.WorkSchedules.AsNoTracking().Where(s=>ids.Contains(s.EmployeeId)&&s.WorkDate>=from.AddDays(-2)&&s.WorkDate<=to.AddDays(2)&&!s.IsRestDay).Include(s=>s.Shift).ToListAsync(ct);
        var now=Now;
        var rows=schedules.Select(s=>{
            var w=AttendanceRules.Window(s);
            var events=raw.Where(p=>p.EmployeeId==s.EmployeeId&&p.OccurredAtUtc>=w.Open&&p.OccurredAtUtc<=w.Close);
            if(s.IsRestDay)events=events.Where(p=>!neighbors.Where(n=>n.EmployeeId==s.EmployeeId).Any(n=>{var nw=AttendanceRules.Window(n);return p.OccurredAtUtc>=nw.Open&&p.OccurredAtUtc<=nw.Close;}));
            return new AttendanceRow(s.Id,s.Version,s.EmployeeId,s.Employee.Number,s.Employee.FullName,s.WorkDate,s.Shift?.Name??"راحة أسبوعية",s.TimeZone,s.IsRestDay,
                s.IsRestDay?null:w.Start,s.IsRestDay?null:w.End,AttendanceRules.Calculate(s,events,now,holidays.Contains(s.WorkDate),corrections.GetValueOrDefault(s.Id)));
        }).ToArray();
        return new{total,items=rows,calculatedAtUtc=now};
    }
    public async Task<AttendanceCorrection> Request(ClaimsPrincipal actor,CorrectionInput x,CancellationToken ct)
    {
        var uid=Access.UserId(actor);
        await using var tx=await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable,ct);
        var schedule=await db.WorkSchedules.Include(s=>s.Shift).Include(s=>s.Employee).SingleOrDefaultAsync(s=>s.Id==x.ScheduleId,ct)??throw new RuleException("الجدول غير موجود.");
        if(!Access.IsHr(actor)&&schedule.Employee.UserId!=uid)throw new RuleException("يمكنك طلب تصحيح حضورك فقط.");
        if(schedule.IsRestDay)throw new RuleException("التصحيح متاح لأيام العمل المجدولة فقط.");
        if(await db.AttendanceCorrections.AnyAsync(c=>c.ActiveScheduleId==schedule.Id,ct))throw new RuleException("يوجد طلب معلق أو تصحيح معتمد لهذا اليوم.");
        var first=AttendanceRules.ParseLocal(x.FirstInLocal,schedule.TimeZone);var last=AttendanceRules.ParseLocal(x.LastOutLocal,schedule.TimeZone);var window=AttendanceRules.Window(schedule);
        if(first>=last||first<window.Open||last>window.Close||last>Now||Now<window.End)
            throw new RuleException("يجب انتهاء الشفت، وأن يقع الدخول والخروج ضمن نافذته وفي الماضي.");
        var correction=new AttendanceCorrection{ScheduleId=schedule.Id,ScheduleVersion=schedule.Version,ActiveScheduleId=schedule.Id,FirstInUtc=first,LastOutUtc=last,
            Reason=AttendanceRules.Note(x.Reason,"سبب التصحيح"),RequestedBy=uid,RequestedAtUtc=Now};
        db.AttendanceCorrections.Add(correction);await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return correction;
    }
    public async Task Decide(ClaimsPrincipal actor,Guid id,CorrectionDecision x,CancellationToken ct)
    {
        await using var tx=await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable,ct);
        var c=await db.AttendanceCorrections.Include(c=>c.Schedule).ThenInclude(s=>s.Employee).SingleOrDefaultAsync(c=>c.Id==id,ct)??throw new RuleException("الطلب غير موجود.");
        if(c.Version!=x.Version||c.Status!="Pending")throw new DbUpdateConcurrencyException();
        var uid=Access.UserId(actor);
        if(x.Decision=="Cancelled")
        {
            if(c.RequestedBy!=uid)throw new RuleException("سحب الطلب متاح لمقدمه فقط.");
        }
        else
        {
            if(x.Decision is not ("Approved" or "Rejected"))throw new RuleException("القرار غير صالح.");
            if(!Access.IsHr(actor)&&!actor.IsInRole("Manager"))throw new RuleException("لا تملك صلاحية الاعتماد.");
            if(c.RequestedBy==uid||c.Schedule.Employee.UserId==uid)throw new RuleException("لا يمكنك اعتماد طلب قدمته أو طلب يخص حضورك.");
            if(!await employees.Visible(actor).AnyAsync(e=>e.Id==c.Schedule.EmployeeId,ct))throw new RuleException("الموظف خارج نطاق صلاحياتك.");
            if(c.Schedule.Version!=c.ScheduleVersion)throw new RuleException("تغير جدول اليوم؛ أعد تقديم الطلب بعد مراجعته.");
        }
        c.Status=x.Decision;c.ReviewNote=AttendanceRules.Note(x.Note,"ملاحظة القرار",x.Decision!="Rejected");c.ReviewedBy=uid;c.ReviewedAtUtc=Now;
        if(x.Decision!="Approved")c.ActiveScheduleId=null;
        await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);
    }
    public async Task<object> Corrections(ClaimsPrincipal actor,int page,CancellationToken ct)
    {
        var visible=employees.Visible(actor).Select(e=>e.Id);var uid=Access.UserId(actor);
        var query=db.AttendanceCorrections.AsNoTracking().Where(c=>visible.Contains(c.Schedule.EmployeeId));
        var total=await query.CountAsync(ct);
        var items=await query.OrderByDescending(c=>c.RequestedAtUtc).ThenBy(c=>c.Id).Skip((Math.Clamp(page,1,100000)-1)*20).Take(20)
            .Select(c=>new{c.Id,c.Version,c.ScheduleId,c.Schedule.EmployeeId,c.Schedule.Employee.Number,c.Schedule.Employee.FullName,c.Schedule.WorkDate,c.Schedule.TimeZone,
                c.FirstInUtc,c.LastOutUtc,c.Reason,c.Status,c.RequestedAtUtc,c.ReviewNote,c.ReviewedAtUtc,
                canCancel=c.Status=="Pending"&&c.RequestedBy==uid,
                canReview=c.Status=="Pending"&&c.RequestedBy!=uid&&c.Schedule.Employee.UserId!=uid&&(Access.IsHr(actor)||actor.IsInRole("Manager"))}).ToListAsync(ct);
        return new{total,items};
    }
    public async Task<AttendancePunch> Portal(ClaimsPrincipal actor,PortalPunchInput x,CancellationToken ct)
    {
        if(x.Kind is not("In" or "Out")||x.RequestId==Guid.Empty)throw new RuleException("نوع الحركة أو معرفها غير صالح.");
        if(!await db.AttendancePolicies.AnyAsync(p=>p.PortalEnabled,ct))throw new RuleException("تسجيل الحضور من البوابة غير مفعل لدى المنشأة.");
        await using var tx=await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable,ct);
        var own=await db.Employees.SingleOrDefaultAsync(e=>e.UserId==Access.UserId(actor)&&e.Status=="Active",ct)??throw new RuleException("اربط الحساب بموظف نشط أولًا.");
        var retry=await db.AttendancePunches.SingleOrDefaultAsync(p=>p.Id==x.RequestId,ct);
        if(retry!=null){if(retry.EmployeeId==own.Id&&retry.Kind==x.Kind&&retry.Source=="Portal")return retry;throw new RuleException("معرف الحركة مستخدم.");}
        var today=await Today(ct);var candidates=await db.WorkSchedules.Where(s=>s.EmployeeId==own.Id&&s.WorkDate>=today.AddDays(-2)&&s.WorkDate<=today.AddDays(1)&&!s.IsRestDay).Include(s=>s.Shift).ToListAsync(ct);
        var now=Now;var schedule=candidates.SingleOrDefault(s=>{var w=AttendanceRules.Window(s);return now>=w.Open&&now<=w.Close;})??throw new RuleException("لا يوجد شفت حالي يسمح بالتسجيل في هذا الوقت.");
        if(await db.AttendanceHolidays.AnyAsync(h=>h.Date==schedule.WorkDate,ct))throw new RuleException("اليوم عطلة. لا تسمح البوابة بتسجيل عمل عطلة دون تكليف مستقل.");
        var window=AttendanceRules.Window(schedule);
        var last=await db.AttendancePunches.Where(p=>p.EmployeeId==own.Id&&p.OccurredAtUtc>=window.Open&&p.OccurredAtUtc<=window.Close).OrderByDescending(p=>p.OccurredAtUtc).FirstOrDefaultAsync(ct);
        if((last is null&&x.Kind!="In")||last?.Kind==x.Kind)throw new RuleException("يجب تسجيل الدخول والخروج بالتتابع.");
        if(last!=null&&(now-last.OccurredAtUtc).TotalSeconds<30)throw new RuleException("انتظر 30 ثانية بين الحركات.");
        var punch=new AttendancePunch{Id=x.RequestId,EmployeeId=own.Id,Kind=x.Kind,Source="Portal",OccurredAtUtc=now,RecordedAtUtc=now};
        db.AttendancePunches.Add(punch);await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return punch;
    }
}
