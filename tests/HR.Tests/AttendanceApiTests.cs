using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ClosedXML.Excel;
using HR.Application;
using HR.Domain;
using HR.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace HR.Tests;
public class AttendanceApiTests : IClassFixture<AttendanceApp>
{
    private readonly AttendanceApp app;private static int dateCounter;
    public AttendanceApiTests(AttendanceApp app)=>this.app=app;
    private static async Task<JsonElement> Read(HttpResponseMessage r){r.EnsureSuccessStatusCode();return JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement;}
    private async Task<HttpClient> Login(string name){var c=app.Client();(await Send(c,"/api/auth/login",HttpMethod.Post,new{email=name+"@test.local",password=TestApp.Password})).EnsureSuccessStatusCode();return c;}
    private static async Task<HttpResponseMessage> Send(HttpClient c,string path,HttpMethod method,object? body=null,HttpContent? content=null)
    {
        var token=(await Read(await c.GetAsync("/api/auth/csrf"))).GetProperty("token").GetString();using var request=new HttpRequestMessage(method,path);request.Headers.Add("X-CSRF-TOKEN",token);request.Content=content??(body is null?null:JsonContent.Create(body));return await c.SendAsync(request);
    }
    private async Task<WorkSchedule> Day(Guid? employee=null)
    {
        using var scope=app.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<HrDbContext>();
        var s=new WorkSchedule{EmployeeId=employee??app.Alice,WorkDate=new(2026,9,Interlocked.Increment(ref dateCounter)),ShiftId=app.DayShift,TimeZone="Asia/Riyadh"};db.WorkSchedules.Add(s);await db.SaveChangesAsync();return s;
    }
    private static object Request(WorkSchedule s)=>new{scheduleId=s.Id,firstInLocal=$"{s.WorkDate:yyyy-MM-dd}T08:00",lastOutLocal=$"{s.WorkDate:yyyy-MM-dd}T16:00",reason="نسيان تسجيل الخروج"};
    private static byte[] Workbook(params(string number,string at,string kind)[] entries)
    {
        using var book=new XLWorkbook();var sheet=book.AddWorksheet("Punches");for(var i=0;i<3;i++)sheet.Cell(1,i+1).Value=AttendanceImport.Headers[i];
        for(var row=0;row<entries.Length;row++){sheet.Cell(row+2,1).Value=entries[row].number;sheet.Cell(row+2,2).Value=entries[row].at;sheet.Cell(row+2,3).Value=entries[row].kind;}
        using var output=new MemoryStream();book.SaveAs(output);return output.ToArray();
    }
    private static MultipartFormDataContent File(byte[] bytes){var form=new MultipartFormDataContent();form.Add(new ByteArrayContent(bytes),"file","punches.xlsx");return form;}
    [Theory][InlineData("alice",1)][InlineData("manager",2)][InlineData("hr",3)]
    public async Task Report_and_raw_punches_obey_employee_scope(string role,int expected)
    {
        using var c=await Login(role);var report=await Read(await c.GetAsync("/api/attendance/report?from=2026-10-15&to=2026-10-15"));Assert.Equal(expected,report.GetProperty("total").GetInt32());
        if(role!="hr")Assert.DoesNotContain("بدر",report.ToString());
        var punches=await Read(await c.GetAsync("/api/attendance/punches?from=2026-10-15&to=2026-10-15"));Assert.Equal(expected,punches.GetProperty("total").GetInt32());
        var other=await Read(await c.GetAsync($"/api/attendance/report?from=2026-10-15&to=2026-10-15&employeeId={app.Bob}"));Assert.Equal(role=="hr"?1:0,other.GetProperty("total").GetInt32());
    }
    [Fact] public async Task Anonymous_payroll_and_employee_setup_mutations_are_denied()
    {
        using var anon=app.Client();Assert.Equal(HttpStatusCode.Unauthorized,(await anon.GetAsync("/api/attendance/context")).StatusCode);
        using var payroll=await Login("payroll");Assert.Equal(HttpStatusCode.Forbidden,(await payroll.GetAsync("/api/attendance/report")).StatusCode);
        using var alice=await Login("alice");Assert.Equal(HttpStatusCode.Forbidden,(await alice.GetAsync("/api/attendance/setup")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await Send(alice,"/api/attendance/shifts",HttpMethod.Post,new{})).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await alice.GetAsync("/api/attendance/import/template")).StatusCode);
    }
    [Fact] public async Task Schedule_assignment_is_atomic_and_rejects_overlapping_capture_windows()
    {
        using var c=await Login("hr");var first=new DateOnly(2026,11,1);
        (await Send(c,"/api/attendance/schedules",HttpMethod.Post,new{employeeIds=new[]{app.Alice,app.Bob},from=first,to=first.AddDays(6),shiftId=app.DayShift,workDaysMask=31})).EnsureSuccessStatusCode();
        var fail=await Send(c,"/api/attendance/schedules",HttpMethod.Post,new{employeeIds=new[]{app.Alice,app.Manager},from=first,to=first,shiftId=app.DayShift,workDaysMask=127});Assert.Equal(HttpStatusCode.BadRequest,fail.StatusCode);
        using var scope=app.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<HrDbContext>();Assert.False(await db.WorkSchedules.AnyAsync(s=>s.EmployeeId==app.Manager&&s.WorkDate==first));
        var rest=await db.WorkSchedules.SingleAsync(s=>s.EmployeeId==app.Alice&&s.WorkDate==first.AddDays(5));Assert.True(rest.IsRestDay);Assert.Null(rest.ShiftId);
        var night=new DateOnly(2026,11,20);
        (await Send(c,"/api/attendance/schedules",HttpMethod.Post,new{employeeIds=new[]{app.Manager},from=night,to=night,shiftId=app.NightShift,workDaysMask=127})).EnsureSuccessStatusCode();
        var early=await Read(await Send(c,"/api/attendance/shifts",HttpMethod.Post,new ShiftInput("مبكر متداخل",360,840,false)));
        Assert.Equal(HttpStatusCode.BadRequest,(await Send(c,"/api/attendance/schedules",HttpMethod.Post,new{employeeIds=new[]{app.Manager},from=night.AddDays(1),to=night.AddDays(1),shiftId=early.GetProperty("id").GetGuid(),workDaysMask=127})).StatusCode);
    }
    [Fact] public async Task Excel_commit_is_idempotent_and_any_invalid_row_prevents_all_inserts()
    {
        using var c=await Login("hr");var bytes=Workbook(("EMP001","2026-08-03T08:00:00+03:00","In"),("EMP001","2026-08-03T08:00:00+03:00","In"),("EMP001","2026-08-03T16:00:00+03:00","Out"));
        var first=await Read(await Send(c,"/api/attendance/import/commit",HttpMethod.Post,content:File(bytes)));Assert.Equal(2,first.GetProperty("inserted").GetInt32());Assert.Equal(1,first.GetProperty("duplicates").GetInt32());
        var second=await Read(await Send(c,"/api/attendance/import/commit",HttpMethod.Post,content:File(bytes)));Assert.Equal(0,second.GetProperty("inserted").GetInt32());Assert.Equal(3,second.GetProperty("duplicates").GetInt32());
        var invalid=Workbook(("EMP001","2026-08-04T08:00:00+03:00","In"),("MISSING","2026-08-04T08:00:00+03:00","In"));
        Assert.Equal(HttpStatusCode.BadRequest,(await Send(c,"/api/attendance/import/commit",HttpMethod.Post,content:File(invalid))).StatusCode);
        using var scope=app.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<HrDbContext>();Assert.False(await db.AttendancePunches.AnyAsync(p=>p.OccurredAtUtc==new DateTime(2026,8,4,5,0,0)));
        var noOffset=Workbook(("EMP001","2026-08-04T08:00:00","In"));var preview=await Read(await Send(c,"/api/attendance/import/preview",HttpMethod.Post,content:File(noOffset)));Assert.NotEqual(JsonValueKind.Null,preview[0].GetProperty("error").ValueKind);
    }
    [Fact] public async Task Import_rejects_formulas_before_evaluating_them()
    {
        using var c=await Login("hr");
        using var book=new XLWorkbook(new MemoryStream(Workbook(("EMP001","2026-08-01T08:00:00+03:00","In"))));
        book.Worksheet(1).Cell(2,1).FormulaA1="1/0";using var output=new MemoryStream();book.SaveAs(output);
        var rows=await Read(await Send(c,"/api/attendance/import/preview",HttpMethod.Post,content:File(output.ToArray())));
        Assert.Contains("الصيغ",rows[0].GetProperty("error").GetString());
    }
    [Fact] public async Task Raw_punches_and_shift_templates_are_immutable_even_for_synchronous_save()
    {
        using var scope=app.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<HrDbContext>();var punch=await db.AttendancePunches.OrderBy(p=>p.Id).FirstAsync();punch.Kind=punch.Kind=="In"?"Out":"In";
        Assert.Throws<InvalidOperationException>(()=>db.SaveChanges());await Assert.ThrowsAsync<InvalidOperationException>(()=>db.SaveChangesAsync());await Assert.ThrowsAsync<InvalidOperationException>(()=>db.SaveChangesAsync(true));db.ChangeTracker.Clear();
        var shift=await db.WorkShifts.OrderBy(p=>p.Id).FirstAsync();shift.Name="تغيير الأصل";await Assert.ThrowsAsync<InvalidOperationException>(()=>db.SaveChangesAsync());
    }
    [Fact] public async Task Employee_request_manager_approval_changes_report_without_changing_raw_punches()
    {
        var s=await Day();using var employee=await Login("alice");using var manager=await Login("manager");
        var request=await Read(await Send(employee,"/api/attendance/corrections",HttpMethod.Post,Request(s)));var id=request.GetProperty("id").GetGuid();var version=request.GetProperty("version").GetGuid();
        Assert.Equal(HttpStatusCode.BadRequest,(await Send(employee,$"/api/attendance/corrections/{id}",HttpMethod.Put,new{decision="Approved",note="",version})).StatusCode);
        (await Send(manager,$"/api/attendance/corrections/{id}",HttpMethod.Put,new{decision="Approved",note="تمت المراجعة",version})).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict,(await Send(manager,$"/api/attendance/corrections/{id}",HttpMethod.Put,new{decision="Approved",note="",version})).StatusCode);
        var report=await Read(await employee.GetAsync($"/api/attendance/report?from={s.WorkDate:yyyy-MM-dd}&to={s.WorkDate:yyyy-MM-dd}"));var result=report.GetProperty("items")[0].GetProperty("result");Assert.True(result.GetProperty("corrected").GetBoolean());Assert.Equal(480,result.GetProperty("workedMinutes").GetInt32());Assert.Equal(0,result.GetProperty("rawCount").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest,(await Send(employee,"/api/attendance/corrections",HttpMethod.Post,Request(s))).StatusCode);
    }
    [Fact] public async Task Self_approval_and_outside_team_review_are_rejected_and_cancel_releases_day()
    {
        using var hr=await Login("hr");using var manager=await Login("manager");using var bob=await Login("bob");
        var self=await Day(app.Manager);var request=await Read(await Send(manager,"/api/attendance/corrections",HttpMethod.Post,Request(self)));var id=request.GetProperty("id").GetGuid();var version=request.GetProperty("version").GetGuid();
        Assert.Equal(HttpStatusCode.BadRequest,(await Send(manager,$"/api/attendance/corrections/{id}",HttpMethod.Put,new{decision="Approved",note="",version})).StatusCode);
        (await Send(manager,$"/api/attendance/corrections/{id}",HttpMethod.Put,new{decision="Cancelled",note="",version})).EnsureSuccessStatusCode();
        (await Send(manager,"/api/attendance/corrections",HttpMethod.Post,Request(self))).EnsureSuccessStatusCode();
        var day=await Day(app.Bob);var other=await Read(await Send(bob,"/api/attendance/corrections",HttpMethod.Post,Request(day)));
        Assert.Equal(HttpStatusCode.BadRequest,(await Send(manager,$"/api/attendance/corrections/{other.GetProperty("id").GetGuid()}",HttpMethod.Put,new{decision="Approved",note="",version=other.GetProperty("version").GetGuid()})).StatusCode);
        var submitted=await Day();var ownRequest=await Read(await Send(hr,"/api/attendance/corrections",HttpMethod.Post,Request(submitted)));
        Assert.Equal(HttpStatusCode.BadRequest,(await Send(hr,$"/api/attendance/corrections/{ownRequest.GetProperty("id").GetGuid()}",HttpMethod.Put,new{decision="Approved",note="",version=ownRequest.GetProperty("version").GetGuid()})).StatusCode);
    }
    [Fact] public async Task Rescheduling_requires_version_reason_and_no_reserved_correction()
    {
        var s=await Day();using var hr=await Login("hr");
        (await Send(hr,$"/api/attendance/schedules/{s.Id}",HttpMethod.Put,new{shiftId=app.NightShift,isRestDay=false,version=s.Version,reason="تغيير دوام اليوم"})).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict,(await Send(hr,$"/api/attendance/schedules/{s.Id}",HttpMethod.Put,new{shiftId=app.DayShift,isRestDay=false,version=s.Version,reason="نسخة قديمة"})).StatusCode);
        var reserved=await Day();using var employee=await Login("alice");(await Send(employee,"/api/attendance/corrections",HttpMethod.Post,Request(reserved))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.BadRequest,(await Send(hr,$"/api/attendance/schedules/{reserved.Id}",HttpMethod.Put,new{shiftId=app.NightShift,isRestDay=false,version=reserved.Version,reason="مرفوض"})).StatusCode);
    }
    [Fact] public async Task Competing_reviewers_cannot_approve_the_same_version_twice()
    {
        var day=await Day();using var employee=await Login("alice");using var hr=await Login("hr");using var manager=await Login("manager");
        var request=await Read(await Send(employee,"/api/attendance/corrections",HttpMethod.Post,Request(day)));
        var path=$"/api/attendance/corrections/{request.GetProperty("id").GetGuid()}";var command=new{decision="Approved",note="مراجعة",version=request.GetProperty("version").GetGuid()};
        var responses=await Task.WhenAll(Send(hr,path,HttpMethod.Put,command),Send(manager,path,HttpMethod.Put,command));
        Assert.Single(responses,r=>r.StatusCode==HttpStatusCode.OK);Assert.Single(responses,r=>r.StatusCode==HttpStatusCode.Conflict);
    }
    [Fact] public async Task Exact_checkout_at_shift_end_is_included_when_capture_after_is_zero()
    {
        var day=await Day();
        using(var scope=app.Services.CreateScope()){
            var db=scope.ServiceProvider.GetRequiredService<HrDbContext>();var shift=AttendanceRules.Shift(new("نافذة صفرية "+day.Id,480,960,false,0,0,0,0,0,0));db.WorkShifts.Add(shift);
            var schedule=await db.WorkSchedules.SingleAsync(s=>s.Id==day.Id);schedule.Shift=shift;
            foreach(var kind in new[]{"In","Out"})db.AttendancePunches.Add(new AttendancePunch{EmployeeId=app.Alice,Kind=kind,OccurredAtUtc=AttendanceRules.ParseLocal($"{day.WorkDate:yyyy-MM-dd}T{(kind=="In"?"08:00":"16:00")}","Asia/Riyadh"),RecordedAtUtc=app.Clock.GetUtcNow().UtcDateTime});
            await db.SaveChangesAsync();
        }
        using var c=await Login("alice");var report=await Read(await c.GetAsync($"/api/attendance/report?from={day.WorkDate:yyyy-MM-dd}&to={day.WorkDate:yyyy-MM-dd}"));var result=report.GetProperty("items")[0].GetProperty("result");
        Assert.Equal(2,result.GetProperty("rawCount").GetInt32());Assert.Equal("Present",result.GetProperty("status").GetString());Assert.Equal(480,result.GetProperty("workedMinutes").GetInt32());
    }
    [Fact] public async Task Portal_uses_server_clock_idempotency_and_policy_and_disallows_client_time()
    {
        using var employee=await Login("alice");using var admin=await Login("admin");using var hr=await Login("hr");var id=Guid.NewGuid();
        Assert.Equal(HttpStatusCode.BadRequest,(await Send(employee,"/api/attendance/punch",HttpMethod.Post,new{kind="In",requestId=id})).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await Send(hr,"/api/attendance/policy",HttpMethod.Put,new{portalEnabled=true})).StatusCode);
        var policy=await Read(await Send(admin,"/api/attendance/policy",HttpMethod.Put,new{portalEnabled=true}));
        try{
            var punch=await Read(await Send(employee,"/api/attendance/punch",HttpMethod.Post,new{kind="In",requestId=id,occurredAtUtc="2001-01-01T00:00:00Z",employeeId=app.Bob}));
            Assert.Equal(app.Clock.GetUtcNow().UtcDateTime,punch.GetProperty("occurredAtUtc").GetDateTime());
            var retry=await Read(await Send(employee,"/api/attendance/punch",HttpMethod.Post,new{kind="In",requestId=id}));Assert.Equal(id,retry.GetProperty("id").GetGuid());
            Assert.Equal(HttpStatusCode.BadRequest,(await Send(employee,"/api/attendance/punch",HttpMethod.Post,new{kind="In",requestId=Guid.NewGuid()})).StatusCode);
            app.Clock.Advance(TimeSpan.FromMinutes(1));(await Send(employee,"/api/attendance/punch",HttpMethod.Post,new{kind="Out",requestId=Guid.NewGuid()})).EnsureSuccessStatusCode();
        }finally{app.Clock.Reset();(await Send(admin,"/api/attendance/policy",HttpMethod.Put,new{portalEnabled=false,version=policy.GetProperty("version").GetGuid()})).EnsureSuccessStatusCode();}
    }
}
public class AttendanceApp : TestApp
{
    public Guid DayShift {get;private set;}public Guid NightShift{get;private set;}public TestClock Clock{get;}=new();
    protected override void ConfigureWebHost(IWebHostBuilder builder){base.ConfigureWebHost(builder);builder.ConfigureTestServices(s=>s.AddSingleton<TimeProvider>(Clock));}
    public override async Task InitializeAsync()
    {
        await base.InitializeAsync();using var scope=Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<HrDbContext>();
        var day=AttendanceRules.Shift(new("صباحي",480,960,false));var night=AttendanceRules.Shift(new("ليلي",1320,360,true));db.WorkShifts.AddRange(day,night);DayShift=day.Id;NightShift=night.Id;
        foreach(var employee in new[]{Alice,Bob,Manager}){db.WorkSchedules.Add(new WorkSchedule{EmployeeId=employee,WorkDate=new(2026,10,15),Shift=day});db.AttendancePunches.Add(new AttendancePunch{EmployeeId=employee,Kind="In",OccurredAtUtc=new(2026,10,15,5,0,0,DateTimeKind.Utc),RecordedAtUtc=Clock.GetUtcNow().UtcDateTime});}
        db.WorkSchedules.Add(new WorkSchedule{EmployeeId=Alice,WorkDate=new(2026,10,18),Shift=night});await db.SaveChangesAsync();
    }
}
public class TestClock : TimeProvider
{
    private readonly DateTimeOffset initial=new(2026,10,18,20,0,0,TimeSpan.Zero);private TimeSpan extra;
    public override DateTimeOffset GetUtcNow()=>initial+extra;
    public void Advance(TimeSpan value)=>extra+=value;public void Reset()=>extra=TimeSpan.Zero;
}
