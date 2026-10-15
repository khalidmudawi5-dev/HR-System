# HR Platform

نظام موارد بشرية عربي للمنشآت السعودية، قيد التطوير. التنفيذ الحالي هو أساس المرحلة الأولى؛ ليس منتجًا مكتملًا أو جاهزًا للبيع.

**التقنيات:** .NET SDK 10.0.402 / ASP.NET Core وEF Core 10.0.13، SQL Server 2022، React 19.3.1، TypeScript 7.0.2، Vite 8.3.4. الإصدارات مثبتة في global.json وملفات الحزم والقفل. Node.js 24 LTS مناسب.

المتوفر: تسجيل دخول Cookies وCSRF، أدوار ونطاق موظف/مدير، هيكل منشأة، ملفات موظفين، بيانات مالية مستقلة، مرفقات خاصة، استيراد Excel بمعاينة وحفظ ذري، تدقيق، واجهة عربية متجاوبة وأساس PWA. الإنجليزية مؤسسة في قاموس تنقل فقط؛ ليست ترجمة كاملة بعد.

ابدأ من [التشغيل على Windows](docs/windows-setup.md)، ثم [نتائج التحقق](docs/validation.md) و[التقدم](docs/progress.md). المتطلبات الكاملة في [requirements.ar.md](docs/requirements.ar.md)، والمراحل في [roadmap.md](docs/roadmap.md).

## البناء والاختبارات

```powershell
dotnet tool restore
dotnet restore HRPlatform.sln --locked-mode
dotnet test HRPlatform.sln --no-restore
cd web
npm ci
npm test
npm run build
```

اختبارات الخادم تستخدم SQLite بقواعد اصطناعية معزولة، ولا تتصل بقاعدة العميل. لا تثبت هذه الاختبارات توافق SQL Server أو الأداء على Windows. تنشأ قاعدة SQL فقط بأمر مشغل صريح مع اسم معتمد.

للواجهة ببيانات اختبار منفصلة، شغل `scripts/build.ps1` ثم `dotnet run --project tests/HR.BrowserHost`. هذا مضيف اختبارات على المنفذ 5081؛ لا تنشره ولا تستخدم حساباته في الإنتاج. مصدر حساباته في tests/HR.Tests/TestApp.cs. راجع docs/testing.md لاختبار المتصفح.

لا توجد خدمات مدفوعة مطلوبة. قاعدة SQL Server وترخيص Windows عند العميل مسؤولية بيئة العميل، ولا توزع هذه التراخيص مع التطبيق. لا يوجد تكامل جهاز ZKTeco فعلي بعد.
