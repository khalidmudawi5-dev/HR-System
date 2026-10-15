# نشر Windows والنسخ والاستعادة

هذه تعليمات تجهيز أولية، لم تُختبر على Windows/SQL Server في هذه البيئة بعد. لا تمثل اعتمادًا للإنتاج.

1. ابنِ حزمة Release عبر `scripts/build.ps1 -PublishTo C:\HRPlatform\release`. لا تنشر BrowserHost أو اختبارات أو بياناته أو User Secrets.
2. استخدم IIS مع ASP.NET Core Hosting Bundle 10 المتوافق، أو خدمة Windows خلف reverse proxy محلي موثوق. HTTPS بشهادة موثوقة إلزامي. لا تفتح SQL للإنترنت.
3. خصص حساب خدمة ومجلدًا مطلقًا للمرفقات وآخر لمفاتيح Data Protection، خارج wwwroot. اضبط ACL بحيث يقرأ ويكتب حساب الخدمة والمشغل المخول فقط. اضبط Storage__Root وDataProtection__Path. التطبيق يشفر المفاتيح بـDPAPI لحساب الخدمة على Windows افتراضيًا عند تخصيص المسار. للاستعادة على جهاز أو حساب آخر، اضبط DataProtection__CertificateThumbprint على شهادة لها مفتاح خاص محفوظ ومحمِي بنسخة احتياطية؛ DPAPI يرتبط ببيئة الحساب والجهاز. على غير Windows يتطلب الإنتاج شهادة لتشفير المفاتيح، ويرفض البدء دونها.
4. اضبط ConnectionStrings__Hr وDatabase__ExpectedName وProduct__Name وAllowedHosts من إعداد تشغيل آمن. لا تستخدم User Secrets كمخزن إنتاج. يمنع طباعة السلاسل وكلمات المرور.
5. طبّق migrations بعملية مشغل مستقلة ومحدودة، ثم شغّل التطبيق بحساب SQL أقل صلاحية. التشغيل العادي لا يغير المخطط. تحقق من الصحة وتسجيل الدخول ومنع الوصول ومن تحميل المرفقات بعد إعادة التشغيل.
6. لا تثق في رؤوس forwarded headers عشوائيًا. الإعداد الحالي لا يقبلها؛ اضبط الوكيل الموثوق صراحةً قبل استخدام TLS termination خارج IIS.

## النسخ الاحتياطي

ضع جدولًا وفق سياسة المنشأة يشمل: نسخة SQL كاملة مع CHECKSUM، ونسخ السجل حسب recovery model وRPO، والمرفقات الخاصة، ومفاتيح Data Protection وإعدادات التشغيل. احفظ النسخ مشفرة بمكان منفصل وبصلاحيات وتاريخ احتفاظ واضح. نسخ الشيفرة وحدها لا ينسخ بيانات الموظفين.

مثال SQL يراجعه مشغل قاعدة البيانات بعد استبدال الأسماء والمسارات المعتمدة:

```sql
BACKUP DATABASE [HRPlatform_Dev]
 TO DISK = N'D:\HRBackups\HRPlatform_Dev_full.bak'
 WITH CHECKSUM, COMPRESSION;
RESTORE VERIFYONLY FROM DISK = N'D:\HRBackups\HRPlatform_Dev_full.bak' WITH CHECKSUM;
RESTORE FILELISTONLY FROM DISK = N'D:\HRBackups\HRPlatform_Dev_full.bak';
```

VERIFYONLY لا يثبت الاستعادة. اختبر RESTORE فعليًا إلى اسم جديد مستقل متفق عليه مثل HRPlatform_RestoreTest مع MOVE لكل ملف إلى مسار جديد، وبلا WITH REPLACE. لا تفترض أسماء الملفات المنطقية؛ استخدم FILELISTONLY. امنع أي كتابة إلى قواعد موجودة.

بعد الاستعادة: استخدم اتصال الاختبار الجديد، قارن سجلات المنشأة والموظفين والتدقيق، افتح المرفقات من نسخة منفصلة، وسجل الدخول واختبر الأدوار. سجل وقت الاستعادة ونتيجة DBCC CHECKDB والاختبارات في validation.md. لم يتم تنفيذ هذه التجربة بعد لغياب الوصول إلى SQL Server.

## بوابات الإطلاق

مراجعة أمن مستقلة، نسخ/استعادة مجربة، حسابات خدمة ومفاتيح محمية، اختبار SQL Server/Windows، تحقق سعودي موثق قبل الحسابات، وتحميل مقاس قبل ادعاء 1,000 موظف. لا تكامل بنك أو حماية أجور أو جهاز فعلي في هذه المرحلة.
