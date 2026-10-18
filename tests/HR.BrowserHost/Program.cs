using HR.Tests;
using HR.Infrastructure;
using ClosedXML.Excel;
using Xunit;

// Explicit isolated synthetic-data host for browser tests. Never uses customer SQL Server.
var host=new AttendanceApp();
host.UseKestrel(5081);
await host.InitializeAsync();
Directory.CreateDirectory(".local/browser");
using(var book=new XLWorkbook(new MemoryStream(AttendanceImport.Template())))
{
    var sheet=book.Worksheet(1);
    sheet.Cell(2,1).Value="EMP002";sheet.Cell(2,2).Value="2026-10-15T08:00:00+03:00";sheet.Cell(2,3).Value="In";
    sheet.Cell(3,1).Value="EMP002";sheet.Cell(3,2).Value="2026-10-15T16:00:00+03:00";sheet.Cell(3,3).Value="Out";
    book.SaveAs(".local/browser/attendance-fixture.xlsx");
}
Console.WriteLine("Synthetic browser-test server listening on port 5081. Test accounts only; no customer database.");
var stop=new TaskCompletionSource();
Console.CancelKeyPress+=(_,e)=>{e.Cancel=true;stop.TrySetResult();};
try{await stop.Task;}finally{await ((IAsyncLifetime)host).DisposeAsync();}
