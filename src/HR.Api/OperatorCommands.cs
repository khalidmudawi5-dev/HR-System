using System.Data;
using HR.Application;
using HR.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace HR.Api;
public static class OperatorCommands
{
    public static async Task Run(IServiceProvider services,IConfiguration config,string[] args)
    {
        var connection=new SqlConnectionStringBuilder(config.GetConnectionString("Hr") ?? "");
        var expected=config["Database:ExpectedName"];
        if(string.IsNullOrWhiteSpace(expected) || !expected.StartsWith("HRPlatform_",StringComparison.Ordinal) || connection.InitialCatalog!=expected || string.IsNullOrWhiteSpace(connection.DataSource))
            throw new InvalidOperationException("Set the approved independent HRPlatform_* database name and matching SQL Server connection before operator commands.");
        using var scope=services.CreateScope(); var db=scope.ServiceProvider.GetRequiredService<HrDbContext>();
        if(args.Contains("--migrate"))
        {
            // Never adopt an existing unrelated schema, including an empty database without explicit adoption.
            var master=new SqlConnectionStringBuilder(connection.ConnectionString){InitialCatalog="master"};
            await using var sql=new SqlConnection(master.ConnectionString); await sql.OpenAsync();
            await using var exists=sql.CreateCommand(); exists.CommandText="SELECT COUNT(*) FROM sys.databases WHERE name=@name";
            exists.Parameters.AddWithValue("@name",expected);
            if(Convert.ToInt32(await exists.ExecuteScalarAsync())>0)
            {
                await using var target=new SqlConnection(connection.ConnectionString); await target.OpenAsync();
                await using var marker=target.CreateCommand();
                marker.CommandText="SELECT COUNT(*) FROM sys.tables WHERE name='__EFMigrationsHistory' AND schema_id=SCHEMA_ID('dbo')";
                if(Convert.ToInt32(await marker.ExecuteScalarAsync())==0) throw new InvalidOperationException("Refusing to migrate an existing database without this application's migration history. Choose a new database name.");
                var known=db.Database.GetMigrations().ToHashSet();
                var applied=(await db.Database.GetAppliedMigrationsAsync()).ToArray();
                if(applied.Length==0 || applied.Any(x=>!known.Contains(x))) throw new InvalidOperationException("Database migration lineage does not match this application.");
            }
            await db.Database.MigrateAsync(); Console.WriteLine("HR Platform migrations applied.");
        }
        if(args.Contains("--bootstrap"))
        {
            if((await db.Database.GetPendingMigrationsAsync()).Any()) throw new InvalidOperationException("Apply migrations first.");
            var users=scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var roles=scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
            if((await users.GetUsersInRoleAsync("Administrator")).Count>0) throw new InvalidOperationException("Administrator already exists. Bootstrap is one-time only.");
            var email=config["Bootstrap:Email"]; var password=config["Bootstrap:Password"];
            if(string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password)) throw new InvalidOperationException("Set Bootstrap:Email and Bootstrap:Password securely, then remove them after bootstrap.");
            foreach(var role in Access.Roles) if(!await roles.RoleExistsAsync(role))
            {var result=await roles.CreateAsync(new IdentityRole(role));if(!result.Succeeded) throw new InvalidOperationException("Role creation failed.");}
            await using var transaction=await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            if((await users.GetUsersInRoleAsync("Administrator")).Count>0) throw new InvalidOperationException("Administrator already exists.");
            var user=new ApplicationUser{UserName=email,Email=email};
            var created=await users.CreateAsync(user,password);
            if(!created.Succeeded) throw new InvalidOperationException(string.Join("; ",created.Errors.Select(x=>x.Description)));
            var assigned=await users.AddToRoleAsync(user,"Administrator");
            if(!assigned.Succeeded) throw new InvalidOperationException("Administrator role assignment failed.");
            await transaction.CommitAsync(); Console.WriteLine("Administrator created. Remove bootstrap credentials.");
        }
    }
}
