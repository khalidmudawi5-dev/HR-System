using HR.Domain;
using HR.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Xunit;

namespace HR.Tests;
public class TestApp : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string Password="Test!Only2026x";
    public Guid Alice {get;}=Guid.NewGuid(); public Guid Bob {get;}=Guid.NewGuid(); public Guid Manager {get;}=Guid.NewGuid(); public Guid Job {get;}=Guid.NewGuid();
    public string Root {get;}=Path.Combine(Path.GetTempPath(),"hr-tests-"+Guid.NewGuid().ToString("N"));
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        var checkout=new DirectoryInfo(AppContext.BaseDirectory);
        while(checkout!=null && !System.IO.File.Exists(Path.Combine(checkout.FullName,"HRPlatform.sln"))) checkout=checkout.Parent;
        if(checkout is null) throw new InvalidOperationException("Run test host from the source checkout.");
        builder.UseContentRoot(Path.Combine(checkout.FullName,"src","HR.Api"));
        Directory.CreateDirectory(Root);
        builder.UseEnvironment("Testing");
        builder.ConfigureLogging(l=>l.SetMinimumLevel(LogLevel.Warning));
        builder.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{
            ["Storage:Root"]=Path.Combine(Root,"files"),["DataProtection:Path"]=Path.Combine(Root,"keys") }));
        builder.ConfigureTestServices(services=>{
            services.AddSingleton<IStartupFilter,ClientIpFilter>();
            services.RemoveAll<DbContextOptions<HrDbContext>>(); services.RemoveAll<IDbContextOptionsConfiguration<HrDbContext>>();
            // Pooled native SQLite handles keep tests.db locked after the host stops on Windows.
            // Disable pooling only for this disposable test database, without clearing other hosts' pools.
            var connection=new SqliteConnectionStringBuilder{DataSource=Path.Combine(Root,"tests.db"),Pooling=false};
            services.AddDbContext<HrDbContext>(o=>o.UseSqlite(connection.ConnectionString));
        });
    }
    public virtual async Task InitializeAsync()
    {
        using var scope=Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<HrDbContext>();await db.Database.EnsureCreatedAsync();
        var roles=scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();var users=scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        foreach(var r in HR.Application.Access.Roles) Assert.True((await roles.CreateAsync(new IdentityRole(r))).Succeeded);
        foreach(var (email,role) in new[]{("admin@test.local","Administrator"),("hr@test.local","HR"),("payroll@test.local","Payroll"),("alice@test.local","Employee"),("bob@test.local","Employee"),("manager@test.local","Manager")})
        {var u=new ApplicationUser{UserName=email,Email=email};Assert.True((await users.CreateAsync(u,Password)).Succeeded);Assert.True((await users.AddToRoleAsync(u,role)).Succeeded);}
        var b=new Branch{Name="الرياض"};var d=new Department{Name="التشغيل",BranchId=b.Id};var j=new JobPosition{Id=Job,Name="أخصائي",DepartmentId=d.Id};
        db.AddRange(b,d,j);
        db.Employees.AddRange(
            new Employee{Id=Manager,Number="EMP000",FullName="المدير",JoinDate=new(2025,1,1),JobPositionId=Job,UserId=(await users.FindByEmailAsync("manager@test.local"))!.Id},
            new Employee{Id=Alice,Number="EMP001",FullName="أمل",JoinDate=new(2025,1,1),JobPositionId=Job,UserId=(await users.FindByEmailAsync("alice@test.local"))!.Id,ManagerId=Manager},
            new Employee{Id=Bob,Number="EMP002",FullName="بدر",JoinDate=new(2025,1,1),JobPositionId=Job,UserId=(await users.FindByEmailAsync("bob@test.local"))!.Id});
        await db.SaveChangesAsync();
    }
    async Task IAsyncLifetime.DisposeAsync(){await DisposeAsync();Directory.Delete(Root,true);}
    private static int nextClient;
    public HttpClient Client(){var c=CreateClient(new WebApplicationFactoryClientOptions{BaseAddress=new Uri("https://localhost"),AllowAutoRedirect=false});c.DefaultRequestHeaders.Add("X-Test-IP",$"192.0.2.{Interlocked.Increment(ref nextClient)%250+1}");return c;}
}
public class ClientIpFilter : IStartupFilter
{
    public Action<Microsoft.AspNetCore.Builder.IApplicationBuilder> Configure(Action<Microsoft.AspNetCore.Builder.IApplicationBuilder> next)=>app=>{
        Microsoft.AspNetCore.Builder.UseExtensions.Use(app,async(context,continuation)=>{context.Connection.RemoteIpAddress=System.Net.IPAddress.Parse(context.Request.Headers["X-Test-IP"].FirstOrDefault()??"192.0.2.1");await continuation();});
        next(app);
    };
}
