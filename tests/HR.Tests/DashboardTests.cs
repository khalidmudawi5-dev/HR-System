using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using HR.Domain;
using HR.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HR.Tests;

public class DashboardTests : IClassFixture<DashboardApp>
{
    private readonly DashboardApp app;
    public DashboardTests(DashboardApp app) => this.app=app;

    private static async Task<JsonElement> Read(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    private async Task<HttpClient> Login(string role)
    {
        var client=app.Client();
        var token=(await Read(await client.GetAsync("/api/auth/csrf"))).GetProperty("token").GetString();
        using var request=new HttpRequestMessage(HttpMethod.Post,"/api/auth/login");
        request.Headers.Add("X-CSRF-TOKEN",token);
        request.Content=JsonContent.Create(new {email=role+"@test.local",password=TestApp.Password});
        (await client.SendAsync(request)).EnsureSuccessStatusCode();
        return client;
    }

    [Fact] public async Task Dashboard_requires_authentication()
    {
        using var client=app.Client();
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/api/dashboard")).StatusCode);
    }

    [Theory]
    [InlineData("admin","organization",5,true,true)]
    [InlineData("hr","organization",5,true,false)]
    [InlineData("manager","team",2,false,false)]
    [InlineData("alice","self",1,false,false)]
    public async Task Dashboard_counts_and_details_follow_actor_scope(string user,string scope,int total,bool structure,bool setup)
    {
        using var client=await Login(user);
        var response=await client.GetAsync("/api/dashboard");
        Assert.True(response.Headers.CacheControl!.NoStore);
        var dashboard=await Read(response);
        Assert.Equal(scope,dashboard.GetProperty("scope").GetString());
        Assert.Equal(total,dashboard.GetProperty("employees").GetProperty("total").GetInt32());
        Assert.Equal(structure,dashboard.GetProperty("structure").ValueKind!=JsonValueKind.Null);
        Assert.Equal(setup,dashboard.GetProperty("setup").ValueKind!=JsonValueKind.Null);
        Assert.DoesNotContain("salary",dashboard.ToString(),StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(TestApp.Password,dashboard.ToString());
        if(!structure) Assert.Empty(dashboard.GetProperty("branches").EnumerateArray());
        if(!setup) Assert.Empty(dashboard.GetProperty("activity").EnumerateArray());
        if(user is "alice" or "manager") Assert.DoesNotContain("بدر",dashboard.ToString());
        if(user=="alice") Assert.DoesNotContain("المدير",dashboard.GetProperty("recentEmployees").ToString());
        if(setup) Assert.All(dashboard.GetProperty("activity").EnumerateArray(),a=>Assert.False(string.IsNullOrWhiteSpace(a.GetProperty("actorName").GetString())));
    }

    [Fact] public async Task Payroll_dashboard_does_not_disclose_employee_directory_or_admin_activity()
    {
        using var client=await Login("payroll");
        var dashboard=await Read(await client.GetAsync("/api/dashboard"));
        Assert.Equal("financial",dashboard.GetProperty("scope").GetString());
        Assert.Equal(JsonValueKind.Null,dashboard.GetProperty("employees").ValueKind);
        Assert.Equal(JsonValueKind.Null,dashboard.GetProperty("setup").ValueKind);
        Assert.Empty(dashboard.GetProperty("recentEmployees").EnumerateArray());
        Assert.Empty(dashboard.GetProperty("activity").EnumerateArray());
    }

    [Fact] public async Task Month_summary_uses_organization_day_and_excludes_future_joiners()
    {
        using var client=await Login("hr");
        var dashboard=await Read(await client.GetAsync("/api/dashboard"));
        // 30 Sep 22:00 UTC is 1 Oct in Riyadh. The 2 Oct joiner is still in the future.
        Assert.Equal("2026-10-01",dashboard.GetProperty("businessDate").GetString());
        Assert.Equal(1,dashboard.GetProperty("employees").GetProperty("joinedThisMonth").GetInt32());
        Assert.Equal(5,dashboard.GetProperty("employees").GetProperty("active").GetInt32());
        Assert.Equal(5,dashboard.GetProperty("branches")[0].GetProperty("employees").GetInt32());
    }

    [Fact] public async Task Directory_filters_keep_scope_and_expose_names_without_account_or_financial_data()
    {
        using var scope=app.Services.CreateScope();
        var db=scope.ServiceProvider.GetRequiredService<HrDbContext>();
        var department=await db.Departments.SingleAsync();
        using var manager=await Login("manager");
        var list=await Read(await manager.GetAsync($"/api/employees?branchId={department.BranchId}&departmentId={department.Id}&sort=name"));
        Assert.Equal(2,list.GetProperty("total").GetInt32());
        var rows=list.GetProperty("items").EnumerateArray().ToArray();
        Assert.All(rows,row=>{
            Assert.Equal("الرياض",row.GetProperty("branch").GetString());
            Assert.Equal("التشغيل",row.GetProperty("department").GetString());
            Assert.Equal("أخصائي",row.GetProperty("jobTitle").GetString());
        });
        Assert.False(rows.Single(r=>r.GetProperty("id").GetGuid()==app.Alice).GetProperty("canReadAttachments").GetBoolean());
        Assert.True(rows.Single(r=>r.GetProperty("id").GetGuid()==app.Manager).GetProperty("canReadAttachments").GetBoolean());
        Assert.DoesNotContain("userId",list.ToString(),StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("salary",list.ToString(),StringComparison.OrdinalIgnoreCase);
        var empty=await Read(await manager.GetAsync($"/api/employees?branchId={Guid.NewGuid()}"));
        Assert.Equal(0,empty.GetProperty("total").GetInt32());
        var single=await Read(await manager.GetAsync($"/api/employees/{app.Alice}"));
        Assert.Equal("المدير",single.GetProperty("managerName").GetString());
        Assert.False(single.GetProperty("canReadAttachments").GetBoolean());
    }
}

public class DashboardApp : TestApp
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.ConfigureTestServices(services=>services.AddSingleton<TimeProvider>(new FixedClock()));
    }

    public override async Task InitializeAsync()
    {
        await base.InitializeAsync();
        using var scope=Services.CreateScope();
        var db=scope.ServiceProvider.GetRequiredService<HrDbContext>();
        db.Organizations.Add(new Organization{Name="منشأة الاختبار",TimeZone="Asia/Riyadh"});
        foreach(var day in new[]{1,2}) db.Employees.Add(new Employee{Number="OCT00"+day,FullName="منضم أكتوبر "+day,JoinDate=new(2026,10,day),JobPositionId=Job});
        await db.SaveChangesAsync();
    }

    private sealed class FixedClock : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(2026,9,30,22,0,0,TimeSpan.Zero);
    }
}
