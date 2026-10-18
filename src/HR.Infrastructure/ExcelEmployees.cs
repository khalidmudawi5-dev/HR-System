using System.Globalization;
using System.IO.Compression;
using ClosedXML.Excel;
using HR.Application;
using HR.Domain;
using Microsoft.EntityFrameworkCore;

namespace HR.Infrastructure;

public record ImportRow(int Row, EmployeeInput? Employee, string? Error);
public class ExcelEmployees(HrDbContext db)
{
    public static readonly string[] Headers=["Number","FullName","Email","Phone","JoinDate","JobPositionId"];
    public static byte[] Template()
    {
        using var w=new XLWorkbook(); var s=w.AddWorksheet("Employees");
        for(var i=0;i<Headers.Length;i++) s.Cell(1,i+1).Value=Headers[i];
        s.Row(1).Style.Font.Bold=true; s.Columns().AdjustToContents();
        using var m=new MemoryStream(); w.SaveAs(m); return m.ToArray();
    }
    public async Task<List<ImportRow>> Preview(Stream input,CancellationToken ct)
    {
        using var memory=new MemoryStream(); await input.CopyToAsync(memory,ct);
        if(memory.Length>2*1024*1024) throw new RuleException("ملف Excel أكبر من 2 MB.");
        memory.Position=0;
        using(var zip=new ZipArchive(memory,ZipArchiveMode.Read,true))
            if(zip.Entries.Count>500 || zip.Entries.Sum(x=>x.Length)>20*1024*1024)
                throw new RuleException("المحتوى المضغوط يتجاوز الحد المسموح.");
        memory.Position=0;
        using var w=Open(memory);
        if(w.Worksheets.Count!=1) throw new RuleException("استخدم ورقة القالب الواحدة.");
        var s=w.Worksheet(1); var last=s.LastRowUsed()?.RowNumber() ?? 1;
        if(last>2001 || (s.LastColumnUsed()?.ColumnNumber() ?? 0)!=6) throw new RuleException("الحد 2000 موظف وبنفس أعمدة القالب.");
        if(s.Row(1).Cells(1,6).Any(c=>c.HasFormula)) throw new RuleException("الصيغ غير مسموحة في عناوين القالب.");
        for(var i=0;i<Headers.Length;i++) if(s.Cell(1,i+1).GetString()!=Headers[i]) throw new RuleException("عناوين القالب غير مطابقة.");
        var existing=(await db.Employees.Select(x=>x.Number).ToListAsync(ct)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var jobs=(await db.Jobs.Select(x=>x.Id).ToListAsync(ct)).ToHashSet();
        var result=new List<ImportRow>();
        for(var row=2;row<=last;row++)
        {
            try
            {
                if(s.Row(row).Cells(1,6).Any(c=>c.HasFormula)) throw new RuleException("الصيغ غير مسموحة.");
                var date=s.Cell(row,5).TryGetValue<DateTime>(out var dt) ? DateOnly.FromDateTime(dt) : DateOnly.ParseExact(s.Cell(row,5).GetString(),"yyyy-MM-dd",CultureInfo.InvariantCulture);
                var x=Rules.Employee(new(s.Cell(row,1).GetString(),s.Cell(row,2).GetString(),s.Cell(row,3).GetString(),s.Cell(row,4).GetString(),date,"Active","FixedTerm",Guid.Parse(s.Cell(row,6).GetString()),null,null));
                if(!jobs.Contains(x.JobPositionId)) throw new RuleException("الوظيفة غير موجودة.");
                if(!existing.Add(x.Number)) throw new RuleException("رقم وظيفي مكرر في الملف أو النظام.");
                result.Add(new(row,x,null));
            }
            catch(Exception ex) when(ex is RuleException or FormatException or InvalidCastException)
            { result.Add(new(row,null,ex is RuleException ? ex.Message : "صيغة التاريخ أو معرف الوظيفة غير صحيحة.")); }
        }
        if(result.Count==0) throw new RuleException("الملف لا يحتوي على موظفين.");
        return result;
    }
    public async Task<int> Commit(Stream input,CancellationToken ct)
    {
        var rows=await Preview(input,ct);
        if(rows.Any(x=>x.Error!=null)) throw new RuleException("صحح جميع أخطاء المعاينة قبل الحفظ.");
        foreach(var row in rows) { var e=new Employee(); Rules.Apply(e,row.Employee!); db.Employees.Add(e); }
        await db.SaveChangesAsync(ct); return rows.Count;
    }
    private static XLWorkbook Open(Stream input)
    {
        try{return new XLWorkbook(input);}
        catch(Exception ex) when(ex is not OutOfMemoryException && ex is not OperationCanceledException)
        {throw new RuleException("تعذر قراءة الملف؛ استخدم قالب Excel سليمًا وغير محمي.");}
    }
}
