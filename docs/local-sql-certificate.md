# شهادة SQL للتطوير المحلي على Windows

هذا الإجراء لجهاز تطوير مملوك للمستخدم مع SQL Server محلي. في بيئة العميل الإنتاجية تُستخدم شهادة موثوقة وفق إدارة الشهادات المعتمدة، مع تجديدها ونسخ مفاتيحها بأمان. لا يضاف أي استثناء لتعطيل التحقق من TLS.

## ما تأكد

أفاد المستخدم أن Certificate فارغ في إعداد MSSQLSERVER وأن ForceEncryption=0، والخدمة تعمل بحساب NT Service\MSSQLSERVER. هذا يثبت عدم وجود ربط صريح بشهادة، ولا يثبت وحده أي شهادة اختارها SQL تلقائيًا. رسالة العميل تثبت فشل الثقة بسلسلة شهادة الخادم قبل إنشاء قاعدة المشروع.

أداة scripts/New-LocalSqlDevelopmentCertificate.ps1 تعتمد إعداد شهادة SQL الموثق رسميًا (Server Authentication وRSA/SHA256 وKeyExchange ومزود SChannel). وضعها الافتراضي يعرض خطة قراءة فقط؛ -Install ينشئ شهادة غير قابلة لتصدير المفتاح الخاص في LocalMachine\My، ويضيف الشهادة العامة نفسها إلى LocalMachine\Root على هذا الجهاز، ويمنح حساب خدمة SQL قراءة مفتاح هذه الشهادة فقط. صلاحية الشهادة سنة. تحفظ سجلًا وبصمة وشهادة عامة في ProgramData\HRPlatform\LocalSqlTls، وتعيد استخدام الإعداد السليم عند تكرارها.

الأداة لا تربط الشهادة بالخدمة ولا تعيد تشغيل خدمات أو تصل إلى قاعدة بيانات. إذا فشل تجهيز شهادة جديدة تحاول إزالة شهادتها ومفتاحها فقط. لا تستبدل شهادة SQL مربوطة مسبقًا. راجع تاريخ الانتهاء وجدد بإجراء مستقل قبل انتهائه.

## الإجراء المقترح للمراجعة

1. اعرض الخطة من PowerShell: `& .\scripts\New-LocalSqlDevelopmentCertificate.ps1`، وراجع اسم المثيل وحساب الخدمة والخدمات التابعة العاملة.
2. بعد موافقة مالك الجهاز على تغيير الثقة المحلية وعلى نافذة إعادة تشغيل SQL، افتح PowerShell كمسؤول، ومن مجلد المشروع نفذ `& .\scripts\New-LocalSqlDevelopmentCertificate.ps1 -Install`. احتفظ بالبصمة الناتجة لمطابقتها عند الربط. لا ترسل أو تصدر مفتاحًا خاصًا.
3. افتح SQL Server Configuration Manager 2022 باستخدام `SQLServerManager16.msc`. في SQL Server Network Configuration → Protocols for MSSQLSERVER → Properties → Certificate اختر الشهادة الجديدة وافحص بصمتها؛ FriendlyName في خصائصها يبدأ بـHR Platform local SQL development. اترك Force Encryption بقيمته الحالية؛ العميل نفسه يطلب التشفير.
4. أعد تشغيل SQL Server (MSSQLSERVER) في النافذة المتفق عليها. سيقطع ذلك الاتصالات الحالية لهذا المثيل، وقد يستلزم إيقاف/إعادة تشغيل الخدمات التابعة مثل SQL Server Agent. راجعها في الخطة؛ لا توقف خدمات غير معتمدة.
5. من جلسة المستخدم الأصلية، احتفظ بـEncrypt=True وTrustServerCertificate=False، وأعد أمر `dotnet run --project .\src\HR.Api -- --migrate` مع ASPNETCORE_ENVIRONMENT=Development. يظل الاسم المعتمد للقاعدة HRPlatform_Dev وحارس الترحيل فعالًا.

لا حاجة إلى فتح SQL على الإنترنت. الثقة بهذه الشهادة محلية لهذا الجهاز؛ لا تفترض ثقة الأجهزة الأخرى بها. لا تستخدم أداة dev-certs الخاصة بواجهة ASP.NET كشهادة لخادم SQL.

## التراجع

قبل تغيير الربط، احتفظ بقيمة Certificate الأصلية وبمعلومات الشهادة الجديدة. إذا فشل بدء SQL، أعد اختيار الشهادة السابقة (أو الربط الفارغ الأصلي) عبر Configuration Manager، ثم أعد التشغيل في النافذة المتفق عليها. بعد التأكد أن SQL لا يستخدم الشهادة الجديدة، يمكن للمشغل حذف الشهادة ذات البصمة المحددة فقط من LocalMachine\My وLocalMachine\Root وسجل تجهيزها؛ لا تحذف شهادات أخرى أو تغير ForceEncryption. يتطلب التراجع أيضًا مسؤولًا ونافذة تشغيل مناسبة.

## التحقق والحدود

لم ينفذ تثبيت الشهادة أو ربطها أو إعادة التشغيل على جهاز المستخدم بعد. فحص الصياغة بمحلل PowerShell الرسمي اكتمل دون أخطاء، لكنه لا يثبت صحة تشغيل إدارة شهادات Windows أو صلاحيات المفتاح أو بدء SQL. تحتاج الخطوات موافقة المستخدم ثم تحقق فعلي من الاتصال والترحيل. المتابعة المسجلة: نجحت اختبارات Windows الـ22 واختبارات الواجهة الـ7 وبناء React على جهاز المستخدم، لكن SQL migration توقف عند التحقق من الشهادة.

المصادر الرسمية التي روجعت في 2026-10-15:

- https://learn.microsoft.com/sql/database-engine/configure-windows/configure-sql-server-encryption
- https://learn.microsoft.com/sql/database-engine/configure-windows/certificate-requirements
- https://learn.microsoft.com/sql/database-engine/configure-windows/manage-certificates

تمت مراجعة النصوص الحالية من مستودع MicrosoftDocs/sql-docs الرسمي (الفرع live) عند إعداد هذه التعليمات.
