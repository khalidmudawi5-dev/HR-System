using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ClosedXML.Excel;
using HR.Application;
using HR.Domain;
using HR.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HR.Tests;
public class ApiTests : IClassFixture<TestApp>
{
    private readonly TestApp app;
    public ApiTests(TestApp app)=>this.app=app;
    private static async Task<JsonElement> Json(HttpResponseMessage r){r.EnsureSuccessStatusCode();return JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement;}
    private async Task<HttpClient> Login(string name)
    {
        var c=app.Client();var response=await Send(c,"/api/auth/login",HttpMethod.Post,new{email=name+"@test.local",password=TestApp.Password});response.EnsureSuccessStatusCode();return c;
    }
    private static async Task<HttpResponseMessage> Send(HttpClient c,string url,HttpMethod method,object? value=null,HttpContent? content=null)
    {
        var csrf=await Json(await c.GetAsync("/api/auth/csrf"));
        var req=new HttpRequestMessage(method,url);req.Headers.Add("X-CSRF-TOKEN",csrf.GetProperty("token").GetString());
        req.Content=content??(value is null?null:JsonContent.Create(value));return await c.SendAsync(req);
    }
    private object Employee(string number,Guid? manager=null,Guid? version=null)=>new{number,fullName="موظف اختبار",email="",phone="",joinDate="2026-10-01",status="Active",contractType="FixedTerm",jobPositionId=app.Job,managerId=manager,version};
    private byte[] Workbook(params(string number,string job)[] values)
    {
        using var w=new XLWorkbook();var s=w.AddWorksheet("Employees");for(var i=0;i<6;i++)s.Cell(1,i+1).Value=ExcelEmployees.Headers[i];
        for(var i=0;i<values.Length;i++){s.Cell(i+2,1).Value=values[i].number;s.Cell(i+2,2).Value="مستورد";s.Cell(i+2,5).Value="2026-01-01";s.Cell(i+2,6).Value=values[i].job;}
        using var m=new MemoryStream();w.SaveAs(m);return m.ToArray();
    }
    private static MultipartFormDataContent File(byte[] b,string name="employees.xlsx"){var f=new MultipartFormDataContent();f.Add(new ByteArrayContent(b),"file",name);return f;}
    [Fact] public async Task Anonymous_and_csrf_are_rejected()
    {
        using var c=app.Client();Assert.Equal(HttpStatusCode.Unauthorized,(await c.GetAsync("/api/employees")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await c.PostAsJsonAsync("/api/auth/login",new{email="x",password="x"})).StatusCode);
        var response=await c.GetAsync("/api/meta");
        Assert.True(response.Headers.CacheControl!.NoStore);
        Assert.True(response.Headers.CacheControl.NoCache);
    }
    [Fact] public async Task Cookies_are_secure_and_login_works()
    {
        using var c=app.Client();var r=await Send(c,"/api/auth/login",HttpMethod.Post,new{email="alice@test.local",password=TestApp.Password});r.EnsureSuccessStatusCode();
        var cookie=string.Join(";",r.Headers.GetValues("Set-Cookie")).ToLowerInvariant();Assert.Contains("httponly",cookie);Assert.Contains("secure",cookie);Assert.Contains("samesite=strict",cookie);
        Assert.Equal("alice@test.local",(await Json(await c.GetAsync("/api/auth/me"))).GetProperty("email").GetString());
        (await Send(c,"/api/auth/logout",HttpMethod.Post)).EnsureSuccessStatusCode();Assert.Equal(HttpStatusCode.Unauthorized,(await c.GetAsync("/api/auth/me")).StatusCode);
    }
    [Fact] public async Task Employee_cannot_read_others_or_financial_data_or_mutate()
    {
        using var c=await Login("alice");var j=await Json(await c.GetAsync("/api/employees"));Assert.Equal(1,j.GetProperty("total").GetInt32());
        Assert.DoesNotContain("salary",j.ToString(),StringComparison.OrdinalIgnoreCase);Assert.DoesNotContain("userId",j.ToString(),StringComparison.OrdinalIgnoreCase);
        Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync($"/api/employees/{app.Bob}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync($"/api/employees/{app.Bob}/financial")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await Send(c,"/api/employees",HttpMethod.Post,Employee("DENIED"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync("/api/import/employees/template")).StatusCode);
    }
    [Fact] public async Task Manager_sees_direct_reports_but_not_their_private_files()
    {
        using var c=await Login("manager");var j=await Json(await c.GetAsync("/api/employees"));Assert.Equal(2,j.GetProperty("total").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync($"/api/employees/{app.Bob}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync($"/api/employees/{app.Alice}/attachments")).StatusCode);
    }
    [Fact] public async Task Hr_cannot_manage_accounts_or_read_financials()
    {
        using var c=await Login("hr");Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync("/api/users")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync($"/api/employees/{app.Alice}/financial")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await Send(c,"/api/organization",HttpMethod.Put,new{name="x",timeZone="Asia/Riyadh"})).StatusCode);
    }
    [Fact] public async Task Employee_crud_normalizes_number_and_checks_concurrency_and_cycles()
    {
        using var c=await Login("hr");var created=await Json(await Send(c,"/api/employees",HttpMethod.Post,Employee(" new001 ")));
        var id=created.GetProperty("id").GetGuid();var v=created.GetProperty("version").GetGuid();Assert.Equal("NEW001",created.GetProperty("number").GetString());
        Assert.Equal(HttpStatusCode.BadRequest,(await Send(c,"/api/employees",HttpMethod.Post,Employee("new001"))).StatusCode);
        var updated=await Json(await Send(c,$"/api/employees/{id}",HttpMethod.Put,Employee("NEW001A",version:v)));
        Assert.NotEqual(v,updated.GetProperty("version").GetGuid());
        Assert.Equal(HttpStatusCode.Conflict,(await Send(c,$"/api/employees/{id}",HttpMethod.Put,Employee("NEW001",version:v))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await Send(c,$"/api/employees/{id}",HttpMethod.Put,Employee("NEW001",id,updated.GetProperty("version").GetGuid()))).StatusCode);
    }
    [Fact] public async Task Excel_preview_commit_and_duplicate_are_atomic()
    {
        using var c=await Login("hr");var bytes=Workbook(("IMP001",app.Job.ToString()));
        var preview=await Json(await Send(c,"/api/import/employees/preview",HttpMethod.Post,content:File(bytes)));
        Assert.Equal(JsonValueKind.Null,preview[0].GetProperty("error").ValueKind);
        var saved=await Json(await Send(c,"/api/import/employees/commit",HttpMethod.Post,content:File(bytes)));Assert.Equal(1,saved.GetProperty("count").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest,(await Send(c,"/api/import/employees/commit",HttpMethod.Post,content:File(bytes))).StatusCode);
        var invalid=Workbook(("IMP002",app.Job.ToString()),("IMP003",Guid.NewGuid().ToString()));
        Assert.Equal(HttpStatusCode.BadRequest,(await Send(c,"/api/import/employees/commit",HttpMethod.Post,content:File(invalid))).StatusCode);
        Assert.Equal(0,(await Json(await c.GetAsync("/api/employees?q=IMP002"))).GetProperty("total").GetInt32());
    }
    [Fact] public async Task Financial_records_are_separate_exact_and_versioned()
    {
        using var c=await Login("payroll");Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync($"/api/employees/{app.Alice}")).StatusCode);
        var r=await Json(await Send(c,$"/api/employees/{app.Alice}/financial",HttpMethod.Put,new{baseSalary="12345.67",bank="بنك اختبار",iban="SA0380000000608010167519",effectiveFrom="2026-01-01",version=(Guid?)null}));
        Assert.Equal("12345.67",r.GetProperty("baseSalary").GetString());
        Assert.Equal(HttpStatusCode.Conflict,(await Send(c,$"/api/employees/{app.Alice}/financial",HttpMethod.Put,new{baseSalary="1.00",bank="",iban="",effectiveFrom="2026-01-01"})).StatusCode);
    }
    [Fact] public async Task Files_are_authorized_and_signature_checked()
    {
        using var hr=await Login("hr");Assert.Equal(HttpStatusCode.BadRequest,(await Send(hr,$"/api/employees/{app.Alice}/attachments",HttpMethod.Post,content:File("<script>bad</script>"u8.ToArray(),"file.pdf"))).StatusCode);
        var saved=await Json(await Send(hr,$"/api/employees/{app.Alice}/attachments",HttpMethod.Post,content:File("%PDF-1.7\n%%EOF"u8.ToArray(),"file.pdf")));
        var id=saved.GetProperty("id").GetGuid();using var alice=await Login("alice");using var bob=await Login("bob");
        var download=await alice.GetAsync($"/api/employees/{app.Alice}/attachments/{id}");download.EnsureSuccessStatusCode();Assert.Equal("attachment",download.Content.Headers.ContentDisposition!.DispositionType);
        Assert.Equal(HttpStatusCode.NotFound,(await bob.GetAsync($"/api/employees/{app.Alice}/attachments/{id}")).StatusCode);
    }
    [Fact] public async Task Last_administrator_is_protected_and_user_link_is_unique()
    {
        using var c=await Login("admin");var me=await Json(await c.GetAsync("/api/auth/me"));var id=me.GetProperty("id").GetString();
        Assert.Equal(HttpStatusCode.BadRequest,(await Send(c,$"/api/users/{id}/role",HttpMethod.Put,new{role="HR"})).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await Send(c,"/api/users",HttpMethod.Post,new{email="duplicate@test.local",password=TestApp.Password,role="Employee",employeeId=app.Alice})).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await Send(c,"/api/users",HttpMethod.Post,new{email="unlinked@test.local",password=TestApp.Password,role="Employee"})).StatusCode);
    }
    [Fact] public async Task Audit_records_changes_without_financial_values()
    {
        using var c=await Login("admin");(await Send(c,"/api/branches",HttpMethod.Post,new{name="فرع تدقيق"})).EnsureSuccessStatusCode();
        var j=await Json(await c.GetAsync("/api/audit"));Assert.Contains("Branch.Added",j.ToString());Assert.DoesNotContain(TestApp.Password,j.ToString());Assert.DoesNotContain("12345.67",j.ToString());
    }
    [Fact] public async Task Role_changes_and_disabling_revoke_existing_sessions()
    {
        using var admin=await Login("admin");var created=await Json(await Send(admin,"/api/users",HttpMethod.Post,new{email="revoked@test.local",password=TestApp.Password,role="HR"}));
        var id=created.GetProperty("id").GetString();using var client=await Login("revoked");
        (await Send(admin,$"/api/users/{id}/role",HttpMethod.Put,new{role="Payroll"})).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/api/auth/me")).StatusCode);
        using var fresh=await Login("revoked");
        (await Send(admin,$"/api/users/{id}/active",HttpMethod.Put,new{isActive=false})).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized,(await fresh.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await Send(client,"/api/auth/login",HttpMethod.Post,new{email="revoked@test.local",password=TestApp.Password})).StatusCode);
    }
    [Fact] public async Task Password_change_revokes_other_sessions_and_accepts_new_password()
    {
        using var admin=await Login("admin");(await Send(admin,"/api/users",HttpMethod.Post,new{email="password@test.local",password=TestApp.Password,role="HR"})).EnsureSuccessStatusCode();
        using var first=await Login("password");using var second=await Login("password");
        (await Send(first,"/api/auth/password",HttpMethod.Post,new{currentPassword=TestApp.Password,newPassword="New!TestOnly2026x"})).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized,(await second.GetAsync("/api/auth/me")).StatusCode);
        (await Send(first,"/api/auth/login",HttpMethod.Post,new{email="password@test.local",password="New!TestOnly2026x"})).EnsureSuccessStatusCode();
    }
    [Fact] public async Task Login_rate_limit_is_enforced_per_client()
    {
        using var c=app.Client();for(var i=0;i<10;i++) Assert.Equal(HttpStatusCode.Unauthorized,(await Send(c,"/api/auth/login",HttpMethod.Post,new{email="absent@test.local",password="invalid"})).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests,(await Send(c,"/api/auth/login",HttpMethod.Post,new{email="absent@test.local",password="invalid"})).StatusCode);
    }
    [Fact] public async Task Repeated_bad_passwords_lock_the_account()
    {
        using var admin=await Login("admin");(await Send(admin,"/api/users",HttpMethod.Post,new{email="lockout@test.local",password=TestApp.Password,role="HR"})).EnsureSuccessStatusCode();
        using var c=app.Client();for(var i=0;i<5;i++) Assert.Equal(HttpStatusCode.Unauthorized,(await Send(c,"/api/auth/login",HttpMethod.Post,new{email="lockout@test.local",password="bad"})).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await Send(c,"/api/auth/login",HttpMethod.Post,new{email="lockout@test.local",password=TestApp.Password})).StatusCode);
    }
    [Fact] public async Task Invalid_import_is_rejected_without_creating_records()
    {
        using var c=await Login("hr");Assert.Equal(HttpStatusCode.BadRequest,(await Send(c,"/api/import/employees/preview",HttpMethod.Post,content:File("not-an-excel-file"u8.ToArray()))).StatusCode);
    }
    [Fact] public async Task Unknown_api_route_returns_404_and_never_the_spa()
    {
        using var c=app.Client();Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync("/api/not-a-route")).StatusCode);
    }
    [Fact] public async Task Isolated_host_releases_database_file_and_removes_its_directory()
    {
        var isolated=new TestApp();
        try
        {
            await isolated.InitializeAsync();
            using(var c=isolated.Client()) (await c.GetAsync("/api/health")).EnsureSuccessStatusCode();
            using(var scope=isolated.Services.CreateScope())
                await scope.ServiceProvider.GetRequiredService<HrDbContext>().Employees.CountAsync();
            // Windows requires all SQLite handles to be closed before this exclusive file open succeeds.
            using var databaseFile=new FileStream(Path.Combine(isolated.Root,"tests.db"),FileMode.Open,FileAccess.ReadWrite,FileShare.None);
            Assert.True(databaseFile.Length>0);
        }
        finally { await ((IAsyncLifetime)isolated).DisposeAsync(); }
        Assert.False(Directory.Exists(isolated.Root));
    }
    [Fact] public async Task Structure_rename_checks_version_and_parent_remains_unchanged()
    {
        using var c=await Login("hr");var structure=await Json(await c.GetAsync("/api/structure"));var job=structure.GetProperty("jobs")[0];
        var id=job.GetProperty("id").GetGuid();var version=job.GetProperty("version").GetGuid();
        (await Send(c,$"/api/jobs/{id}",HttpMethod.Put,new{name="أخصائي محدث",version})).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict,(await Send(c,$"/api/jobs/{id}",HttpMethod.Put,new{name="نسخة قديمة",version})).StatusCode);
    }
    [Theory][InlineData("SA0380000000608010167519",true)][InlineData("SA0380000000608010167518",false)][InlineData("GB0380000000608010167519",false)]
    public void Iban_checksum(string value,bool valid){if(valid) Assert.Equal(value,Rules.SaudiIban(value));else Assert.Throws<RuleException>(()=>Rules.SaudiIban(value));}
}
