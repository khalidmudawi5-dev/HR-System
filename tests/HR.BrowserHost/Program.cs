using HR.Tests;
using Xunit;

// Explicit isolated synthetic-data host for browser tests. Never uses customer SQL Server.
var host=new TestApp();
host.UseKestrel(5081);
await host.InitializeAsync();
Console.WriteLine("Synthetic browser-test server listening on port 5081. Test accounts only; no customer database.");
var stop=new TaskCompletionSource();
Console.CancelKeyPress+=(_,e)=>{e.Cancel=true;stop.TrySetResult();};
try{await stop.Task;}finally{await ((IAsyncLifetime)host).DisposeAsync();}
