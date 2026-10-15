using System.Data;
using System.Security.Claims;
using System.Threading.RateLimiting;
using HR.Api;
using HR.Application;
using HR.Infrastructure;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

var builder=WebApplication.CreateBuilder(args);
builder.Configuration.AddJsonFile("appsettings.Local.json",optional:true,reloadOnChange:false);
var privateStorage=Path.GetFullPath(builder.Configuration["Storage:Root"] ?? "../../.local/attachments",builder.Environment.ContentRootPath);
var publicRoot=Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath,"wwwroot"));
if(privateStorage.Equals(publicRoot,StringComparison.OrdinalIgnoreCase) || privateStorage.StartsWith(publicRoot+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))
    throw new InvalidOperationException("Private attachments must be stored outside wwwroot.");
builder.Configuration["Storage:Root"]=privateStorage;
builder.Services.AddHttpContextAccessor();
builder.Services.ConfigureHttpJsonOptions(o=>o.SerializerOptions.NumberHandling=System.Text.Json.Serialization.JsonNumberHandling.AllowReadingFromString);
builder.Services.AddDbContext<HrDbContext>(o=>o.UseSqlServer(builder.Configuration.GetConnectionString("Hr")));
builder.Services.AddScoped<EmployeeService>(); builder.Services.AddScoped<ExcelEmployees>();
builder.Services.AddIdentity<ApplicationUser,IdentityRole>(o=>{
    o.Password.RequiredLength=12; o.Password.RequireNonAlphanumeric=true;
    o.Lockout.MaxFailedAccessAttempts=5; o.Lockout.DefaultLockoutTimeSpan=TimeSpan.FromMinutes(15);
    o.User.RequireUniqueEmail=true;
}).AddEntityFrameworkStores<HrDbContext>().AddDefaultTokenProviders();
builder.Services.Configure<SecurityStampValidatorOptions>(o=>o.ValidationInterval=TimeSpan.Zero);
builder.Services.ConfigureApplicationCookie(o=>{
    o.Cookie.Name="HRPlatform.Session"; o.Cookie.HttpOnly=true; o.Cookie.SameSite=SameSiteMode.Strict;
    o.Cookie.SecurePolicy=builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment("Testing") ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    o.ExpireTimeSpan=TimeSpan.FromMinutes(30); o.SlidingExpiration=false;
    o.Events.OnRedirectToLogin=c=>{c.Response.StatusCode=401; return Task.CompletedTask;};
    o.Events.OnRedirectToAccessDenied=c=>{c.Response.StatusCode=403; return Task.CompletedTask;};
});
builder.Services.AddAntiforgery(o=>{o.HeaderName="X-CSRF-TOKEN";o.Cookie.SameSite=SameSiteMode.Strict;
    o.Cookie.SecurePolicy=builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment("Testing") ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;});
builder.Services.AddAuthorization(o=>{
    o.AddPolicy("HR",p=>p.RequireRole("Administrator","HR"));
    o.AddPolicy("Payroll",p=>p.RequireRole("Administrator","Payroll"));
    o.AddPolicy("Admin",p=>p.RequireRole("Administrator"));
});
builder.Services.AddRateLimiter(o=>{
    o.RejectionStatusCode=429;
    o.AddPolicy("login",c=>RateLimitPartition.GetFixedWindowLimiter(c.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _=>new FixedWindowRateLimiterOptions{PermitLimit=10,Window=TimeSpan.FromMinutes(1),QueueLimit=0}));
});
builder.WebHost.ConfigureKestrel(o=>o.Limits.MaxRequestBodySize=6*1024*1024);
if(builder.Configuration["DataProtection:Path"] is {Length:>0} keyPath)
{
    var protection=builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(Path.GetFullPath(keyPath,builder.Environment.ContentRootPath))).SetApplicationName("HRPlatform");
    if(builder.Configuration["DataProtection:CertificateThumbprint"] is {Length:>0} thumbprint) protection.ProtectKeysWithCertificate(thumbprint);
    else if(OperatingSystem.IsWindows()) protection.ProtectKeysWithDpapi();
    else if(!builder.Environment.IsDevelopment() && !builder.Environment.IsEnvironment("Testing"))
        throw new InvalidOperationException("Production requires an encryption certificate for Data Protection keys on this platform.");
}
else if(!builder.Environment.IsDevelopment() && !builder.Environment.IsEnvironment("Testing"))
    throw new InvalidOperationException("Configure a private DataProtection:Path for production.");
var app=builder.Build();
if(args.Contains("--migrate") || args.Contains("--bootstrap"))
{
    await OperatorCommands.Run(app.Services,builder.Configuration,args); return;
}
app.Use(async(ctx,next)=>{
    ctx.Response.Headers.XContentTypeOptions="nosniff";
    ctx.Response.Headers["Referrer-Policy"]="same-origin";
    ctx.Response.Headers.ContentSecurityPolicy="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
    if(ctx.Request.Path.StartsWithSegments("/api"))
    {
        ctx.Response.Headers.CacheControl="no-cache, no-store";
        ctx.Response.Headers.Pragma="no-cache";
    }
    try { await next(); }
    catch(Exception e) when(e is RuleException or DbUpdateException or InvalidDataException or FormatException)
    {
        ctx.Response.StatusCode=e is DbUpdateException ? 409 : 400;
        await ctx.Response.WriteAsJsonAsync(new{message=e is RuleException ? e.Message : e is DbUpdateException ? "تعارض في البيانات؛ حدّث الصفحة وتحقق من التكرار والارتباطات." : "صيغة الملف أو البيانات غير صحيحة."});
    }
    catch(Exception e)
    {
        app.Logger.LogError("Request failed: {Type}; trace {Trace}",e.GetType().Name,ctx.TraceIdentifier);
        ctx.Response.StatusCode=500;
        await ctx.Response.WriteAsJsonAsync(new{message="تعذر إكمال العملية. تحقق من إعدادات الخدمة.",trace=ctx.TraceIdentifier});
    }
});
if(!app.Environment.IsDevelopment() && !app.Environment.IsEnvironment("Testing")) { app.UseHsts(); app.UseHttpsRedirection(); }
app.UseAuthentication(); app.UseAuthorization(); app.UseRateLimiter();
app.Use(async(ctx,next)=>{
    if(ctx.Request.Path.StartsWithSegments("/api") && !HttpMethods.IsGet(ctx.Request.Method) && !HttpMethods.IsHead(ctx.Request.Method) && !HttpMethods.IsOptions(ctx.Request.Method))
    {
        try { await ctx.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(ctx); }
        catch(AntiforgeryValidationException) {ctx.Response.StatusCode=400;await ctx.Response.WriteAsJsonAsync(new{message="رمز حماية الجلسة غير صالح؛ حدّث الصفحة."});return;}
    }
    await next();
});
app.MapGet("/api/meta",(IConfiguration c)=>new{name=c["Product:Name"] ?? "HR Platform",phase=1});
app.MapGet("/api/manifest",(IConfiguration c)=>Results.Json(new{
    id="/",name=c["Product:Name"] ?? "HR Platform",short_name=c["Product:Name"] ?? "HR Platform",
    start_url="/",scope="/",display="standalone",lang="ar",dir="rtl",background_color="#f5f6f3",theme_color="#123f3c",
    icons=new[]{new{src="/icon-192.png",sizes="192x192",type="image/png",purpose="any"},new{src="/icon-512.png",sizes="512x512",type="image/png",purpose="any"}}
},contentType:"application/manifest+json"));
app.MapGet("/api/auth/csrf",(HttpContext c,IAntiforgery a)=>new{token=a.GetAndStoreTokens(c).RequestToken});
app.MapPost("/api/auth/login",async(LoginInput x,UserManager<ApplicationUser> users,SignInManager<ApplicationUser> sign)=>{
    if(string.IsNullOrWhiteSpace(x.Email) || x.Email.Length>254 || string.IsNullOrEmpty(x.Password) || x.Password.Length>256)
        return Results.Json(new{message="بيانات الدخول غير صحيحة."},statusCode:401);
    var user=await users.FindByEmailAsync(x.Email ?? "");
    if(user is null || !user.IsActive) return Results.Json(new{message="بيانات الدخول غير صحيحة."},statusCode:401);
    var result=await sign.PasswordSignInAsync(user,x.Password,false,true);
    return result.Succeeded ? Results.Ok() : Results.Json(new{message="بيانات الدخول غير صحيحة أو الحساب مقفل مؤقتًا."},statusCode:401);
}).RequireRateLimiting("login");
app.MapPost("/api/auth/logout",async(SignInManager<ApplicationUser> sign)=>{await sign.SignOutAsync(); return Results.Ok();}).RequireAuthorization();
app.MapGet("/api/auth/me",(ClaimsPrincipal u)=>new{id=Access.UserId(u),email=u.Identity!.Name,roles=u.FindAll(ClaimTypes.Role).Select(x=>x.Value)}).RequireAuthorization();
app.MapGet("/api/health",async(HrDbContext db)=>{
    try { return await db.Database.CanConnectAsync() ? Results.Ok(new{database="reachable"}) : Results.Json(new{database="unavailable"},statusCode:503); }
    catch { return Results.Json(new{database="unconfigured"},statusCode:503); }
});
app.MapFoundation(); app.MapEmployees(); app.MapIdentityAdmin();
app.UseDefaultFiles(); app.UseStaticFiles();
app.MapFallback("/api/{**path}",()=>Results.NotFound());
app.MapFallbackToFile("index.html");
await app.RunAsync();
public partial class Program;
