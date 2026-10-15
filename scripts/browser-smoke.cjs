// Requires the isolated HR.BrowserHost, never a production instance.
const {chromium}=require('../web/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
 const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox']});
 const errors=[];const results=[];const output=path.resolve(__dirname,'../.local/browser');fs.mkdirSync(output,{recursive:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:5081');await page.getByLabel('البريد الإلكتروني').fill('admin@test.local');await page.getByLabel('كلمة المرور',{exact:true}).fill('Test!Only2026x');await page.getByRole('button',{name:'دخول إلى حسابك'}).click();
  await page.getByRole('button',{name:'تسجيل الخروج'}).waitFor();results.push('Cookie login and authenticated home');
  await page.getByRole('button',{name:'المنشأة والهيكل',exact:true}).click();await page.getByLabel('اسم المنشأة').fill('منشأة الاختبار');await page.getByRole('button',{name:'حفظ إعداد المنشأة'}).click();await page.getByRole('status').filter({hasText:'تم الحفظ.'}).waitFor();results.push('Organization saved through API');
  await page.getByRole('button',{name:'الموظفون',exact:true}).click();await page.getByRole('button',{name:'+ إضافة موظف'}).click();
  await page.getByLabel('الرقم الوظيفي',{exact:true}).fill('BROWSER001');await page.getByLabel('الاسم الكامل').fill('موظف اختبار المتصفح');await page.getByLabel('الوظيفة',{exact:true}).selectOption({label:'أخصائي — التشغيل'});await page.getByRole('button',{name:'حفظ الموظف',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});await page.getByLabel('بحث الموظفين').fill('BROWSER001');await page.getByText('موظف اختبار المتصفح',{exact:true}).waitFor();results.push('Create employee, persist and search on server');
  await page.getByLabel('بحث الموظفين').fill('');await page.getByText('أمل',{exact:true}).waitFor();await page.screenshot({path:path.join(output,'employees-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'No horizontal mobile overflow');await page.screenshot({path:path.join(output,'employees-mobile.png'),fullPage:true});results.push('Arabic RTL desktop and mobile layouts');
  await page.reload();await page.getByRole('button',{name:'الموظفون',exact:true}).click();await page.getByText('موظف اختبار المتصفح',{exact:true}).waitFor();results.push('Data survives reload');
  const manifest=await (await page.request.get('http://127.0.0.1:5081/api/manifest')).json();assert.equal(manifest.display,'standalone');assert.equal(manifest.icons.length,2);
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();await page.waitForLoadState('networkidle');
  const cached=await page.evaluate(async()=>{const all=[];for(const name of await caches.keys())for(const r of await(await caches.open(name)).keys())all.push(new URL(r.url).pathname);return all;});assert.deepEqual(cached,['/offline.html']);results.push('PWA cache contains only offline notice, no authenticated data');
  await page.getByRole('button',{name:'تسجيل الخروج'}).click();await page.getByRole('button',{name:'دخول إلى حسابك'}).waitFor();
  await page.getByLabel('البريد الإلكتروني').fill('alice@test.local');await page.getByLabel('كلمة المرور',{exact:true}).fill('Test!Only2026x');await page.getByRole('button',{name:'دخول إلى حسابك'}).click();await page.getByRole('button',{name:'ملفي',exact:true}).click();
  await page.getByText('أمل',{exact:true}).waitFor();assert.equal(await page.getByText('بدر',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'البيانات المالية',exact:true}).count(),0);
  const list=await(await page.request.get('http://127.0.0.1:5081/api/employees')).json();assert.equal(list.total,1);results.push('Employee sees own record and lacks privileged navigation');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({passed:results,errors},null,2));console.log(JSON.stringify({passed:results.length,checks:results},null,2));
 }catch(e){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});console.error('Browser errors:',errors);throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
