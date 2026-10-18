using System.Globalization;
using System.IO.Compression;
using System.Text.RegularExpressions;
using ClosedXML.Excel;
using HR.Application;
using HR.Domain;
using Microsoft.EntityFrameworkCore;

namespace HR.Infrastructure;
public record PunchImportRow(int Row,string Number,string? FullName,Guid? EmployeeId,DateTime? OccurredAtUtc,string Kind,bool Duplicate,string? Error);
public class AttendanceImport(HrDbContext db,TimeProvider clock)
{
    public static readonly string[] Headers=["EmployeeNumber","Timestamp","Kind"];
    public static byte[] Template()
    {
        using var book=new XLWorkbook();var sheet=book.AddWorksheet("Punches");
        for(var i=0;i<Headers.Length;i++)sheet.Cell(1,i+1).Value=Headers[i];
        sheet.Row(1).Style.Font.Bold=true;sheet.Columns().Width=30;
        using var output=new MemoryStream();book.SaveAs(output);return output.ToArray();
    }
    public async Task<List<PunchImportRow>> Preview(Stream input,CancellationToken ct)
    {
        using var memory=new MemoryStream();await input.CopyToAsync(memory,ct);
        if(memory.Length>2*1024*1024)throw new RuleException("الملف أكبر من 2 MB.");
        memory.Position=0;
        using(var zip=new ZipArchive(memory,ZipArchiveMode.Read,true))
            if(zip.Entries.Count>500||zip.Entries.Sum(e=>e.Length)>20*1024*1024)throw new RuleException("محتوى الملف المضغوط يتجاوز الحد.");
        memory.Position=0;using var book=Open(memory);
        if(book.Worksheets.Count!=1)throw new RuleException("استخدم ورقة القالب الواحدة.");
        var sheet=book.Worksheet(1);var last=sheet.LastRowUsed()?.RowNumber()??1;
        if(last<2||last>2001||(sheet.LastColumnUsed()?.ColumnNumber()??0)!=3)throw new RuleException("المسموح من 1 إلى 2000 حركة وبأعمدة القالب الثلاثة.");
        if(sheet.Row(1).Cells(1,3).Any(c=>c.HasFormula))throw new RuleException("الصيغ غير مسموحة في عناوين القالب.");
        for(var i=0;i<Headers.Length;i++)if(sheet.Cell(1,i+1).GetString()!=Headers[i])throw new RuleException("عناوين القالب غير مطابقة.");
        var employees=(await db.Employees.AsNoTracking().Select(e=>new{e.Id,e.Number,e.FullName}).ToListAsync(ct)).ToDictionary(e=>e.Number,StringComparer.OrdinalIgnoreCase);
        var rows=new List<PunchImportRow>();var seen=new HashSet<(Guid,DateTime,string)>();
        for(var row=2;row<=last;row++)
        {
            var number="";var kind="";
            try
            {
                if(sheet.Row(row).Cells(1,3).Any(c=>c.HasFormula))throw new RuleException("الصيغ غير مسموحة.");
                number=sheet.Cell(row,1).GetString().Trim().ToUpperInvariant();kind=sheet.Cell(row,3).GetString().Trim();
                if(!employees.TryGetValue(number,out var employee))throw new RuleException("الرقم الوظيفي غير موجود.");
                if(kind is not("In" or "Out"))throw new RuleException("نوع الحركة In للدخول أو Out للخروج.");
                var stamp=sheet.Cell(row,2).GetString().Trim();
                if(!Regex.IsMatch(stamp,@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,7})?(Z|[+-]\d{2}:\d{2})$",RegexOptions.CultureInvariant,TimeSpan.FromSeconds(1))||
                    !DateTimeOffset.TryParse(stamp,CultureInfo.InvariantCulture,DateTimeStyles.None,out var parsed))throw new RuleException("التوقيت بصيغة ISO ويجب أن يتضمن Z أو فرق المنطقة مثل +03:00.");
                var at=parsed.UtcDateTime;
                if(at.Year<2000||at>clock.GetUtcNow().UtcDateTime.AddMinutes(5))throw new RuleException("التوقيت خارج النطاق أو في المستقبل.");
                rows.Add(new(row,number,employee.FullName,employee.Id,at,kind,!seen.Add((employee.Id,at,kind)),null));
            }
            catch(RuleException ex){rows.Add(new(row,number,null,null,null,kind,false,ex.Message));}
        }
        var valid=rows.Where(r=>r.Error==null).ToArray();
        if(valid.Length>0)
        {
            var lo=valid.Min(r=>r.OccurredAtUtc!.Value);var hi=valid.Max(r=>r.OccurredAtUtc!.Value);var ids=valid.Select(r=>r.EmployeeId!.Value).Distinct().ToArray();
            var stamps=valid.Select(r=>r.OccurredAtUtc!.Value).Distinct().ToArray();
            var existing=(await db.AttendancePunches.Where(p=>ids.Contains(p.EmployeeId)&&stamps.Contains(p.OccurredAtUtc)&&p.OccurredAtUtc>=lo&&p.OccurredAtUtc<=hi)
                .Select(p=>new{p.EmployeeId,p.OccurredAtUtc,p.Kind}).ToListAsync(ct)).Select(p=>(p.EmployeeId,p.OccurredAtUtc,p.Kind)).ToHashSet();
            rows=rows.Select(r=>r.Error==null&&existing.Contains((r.EmployeeId!.Value,r.OccurredAtUtc!.Value,r.Kind))?r with{Duplicate=true}:r).ToList();
        }
        return rows;
    }
    public async Task<object> Commit(Stream input,CancellationToken ct)
    {
        await using var tx=await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable,ct);
        var rows=await Preview(input,ct);
        if(rows.Any(r=>r.Error!=null))throw new RuleException("صحح جميع أخطاء المعاينة. لم تحفظ أي حركة.");
        var unique=rows.Where(r=>!r.Duplicate).ToArray();var now=clock.GetUtcNow().UtcDateTime;
        foreach(var row in unique)db.AttendancePunches.Add(new AttendancePunch{EmployeeId=row.EmployeeId!.Value,OccurredAtUtc=row.OccurredAtUtc!.Value,Kind=row.Kind,Source="Excel",RecordedAtUtc=now});
        await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return new{inserted=unique.Length,duplicates=rows.Count-unique.Length};
    }
    private static XLWorkbook Open(Stream input)
    {
        try{return new XLWorkbook(input);}catch(Exception ex)when(ex is not OutOfMemoryException&&ex is not OperationCanceledException){throw new RuleException("تعذر قراءة ملف Excel؛ استخدم قالبًا سليمًا وغير محمي.");}
    }
}
