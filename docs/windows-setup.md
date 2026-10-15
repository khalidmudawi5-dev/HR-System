# التشغيل الأول على Windows

## المتطلبات

- .NET SDK 10.0.402 من Microsoft، Node.js 24 LTS، SQL Server 2022، وGit.
- خادم SQL متاح محليًا أو عبر شبكة خاصة؛ لا تفتح المنفذ للعامة.
- اختيار اسم قاعدة جديدة مستقلة يبدأ بـ `HRPlatform_`، مثل `HRPlatform_Dev`، بموافقة مالك الخادم. لا تستخدم قاعدة مشروع آخر، ولا قاعدة النظام.
- حساب مشغل يمكنه إنشاء القاعدة وتطبيق المخطط. استخدم لاحقًا حساب تشغيل أقل صلاحية لا يملك إنشاء قواعد أو تعديل مخطط.

## البناء

من جذر المستودع:

```powershell
powershell -File scripts/build.ps1
```

يتحقق السكربت من الحزم المقفلة، ويشغل اختبارات الخادم والواجهة ويبني الواجهة وينسخها إلى wwwroot المولد. لتطوير React استخدم `npm run dev` من web؛ يمرر Vite طلبات API إلى منفذ 5080. لا تستخدم خادم Vite للإنتاج.

## الاتصال الآمن

لا توجد قيم اتصال فعلية في المستودع. اضبط User Secrets محليًا دون لصق كلمات مرور في Git أو المحادثة. مثال غير سري لمصادقة Windows:

```powershell
dotnet user-secrets set "ConnectionStrings:Hr" "Server=YOUR_MACHINE\YOUR_INSTANCE;Database=HRPlatform_Dev;Integrated Security=True;Encrypt=True;TrustServerCertificate=False" --project src/HR.Api
dotnet user-secrets set "Database:ExpectedName" "HRPlatform_Dev" --project src/HR.Api
$env:ASPNETCORE_ENVIRONMENT="Development"
```

استبدل اسم الخادم والقاعدة بعد التأكد منهما. شهادة SQL موثوقة مطلوبة عند Encrypt=True؛ ثبّت شهادة صحيحة أو سلطة الثقة المناسبة بدل تعطيل التحقق. للمصادقة SQL خزّن السلسلة عبر مدير أسرار أو متغير `ConnectionStrings__Hr`؛ لا تضع كلمة المرور في مثال محفوظ أو سجل أو وسيطة عامة.

إذا ظهر خطأ أن سلسلة شهادة SQL صادرة عن جهة غير موثوقة، راجع [شهادة التطوير المحلي](local-sql-certificate.md). الإجراء الافتراضي تشخيص فقط؛ تثبيت وربط شهادة للخدمة المشتركة وإعادة تشغيلها يتطلب موافقة مالك الجهاز على الأثر على اتصالات البرامج الأخرى.

## إنشاء القاعدة والترحيل

```powershell
dotnet run --project src/HR.Api -- --migrate
```

هذا أمر صريح فقط؛ التشغيل العادي لا ينشئ أو يغير المخطط. يطابق اسم القاعدة المسموح مع Initial Catalog ويمنع اعتماد قاعدة موجودة بلا سجل ترحيلات مطابق. لا تشغّل scripts/schema.sql يدويًا لتجاوز هذه الحماية. إن وجدت قاعدة فارغة مسبقًا، اختر اسم قاعدة جديدة؛ لا تحذفها تلقائيًا.

## إنشاء مدير النظام مرة واحدة

اضبط `Bootstrap:Email` و`Bootstrap:Password` في User Secrets محليًا (كلمة قوية 12 حرفًا على الأقل: كبير وصغير ورقم ورمز)، ثم:

```powershell
dotnet run --project src/HR.Api -- --bootstrap
dotnet user-secrets remove "Bootstrap:Password" --project src/HR.Api
dotnet user-secrets remove "Bootstrap:Email" --project src/HR.Api
```

الأمر يتوقف إذا كان مدير موجودًا. لا حسابات إنتاج افتراضية. أنشئ الحسابات من بوابة الإدارة واربط كل حساب موظف بملفه. استخدم صفحة أمان الحساب لتغيير كلمة المرور؛ تبطل الجلسات القديمة.

## التشغيل والتحقق

```powershell
dotnet dev-certs https --trust
dotnet run --project src/HR.Api -- --urls "https://localhost:7080;http://localhost:5080"
```

للتطوير فقط يمكن استخدام HTTP محليًا. افتح عنوان HTTPS محليًا على جهازك، ثم سجل الدخول وأنشئ المنشأة والفروع والأقسام والوظائف وأضف موظفًا. اختبر الحسابات الأقل صلاحية. طلب GET إلى `/api/health` يجب أن يعيد 200، ثم نفذ تدفق موظف فعلي؛ نجاح الاتصال وحده لا يثبت المخطط أو الصلاحيات.

الاسم المركزي في `Product:Name` (أو Product__Name)، والمنطقة الزمنية في إعداد المنشأة. لا يغيّر الاسم التجاري أسماء الجداول أو مفاتيح التشفير. المرفقات خارج wwwroot؛ اضبط Storage__Root على مسار مطلق خاص بالتطبيق. راجع deployment.md قبل أي نشر.

## تحديث النسخة الحالية

إذا كان التطبيق يعمل ولديك قاعدة وحساب مدير، اتبع [تحديث الواجهة](ui-refresh.md) لحفظ إعداداتك وملفاتك. هذا التحديث لا يحتاج إعادة تشغيل أوامر الترحيل أو إنشاء الحسابات.
