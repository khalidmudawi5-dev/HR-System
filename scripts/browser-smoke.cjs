// Uses only the isolated HR.BrowserHost and synthetic fixture accounts.
const { chromium } = require("../web/node_modules/playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
(async () => {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox"],
  });
  const errors = [],
    results = [];
  const output = path.resolve(__dirname, "../.local/browser");
  fs.mkdirSync(output, { recursive: true });
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:5081",
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (/Content Security Policy|violates the following/.test(m.text()))
      errors.push(m.text());
  });
  const login = async (email) => {
    await page
      .getByRole("textbox", { name: "البريد الإلكتروني" })
      .fill(email + "@test.local");
    await page
      .getByLabel("كلمة المرور", { exact: true })
      .fill("Test!Only2026x");
    await page.getByRole("button", { name: "دخول إلى حسابك" }).click();
    await page.locator(".shell").waitFor();
    assert.equal(await page.getByRole("button", {name:"فتح القائمة",includeHidden:true}).getAttribute("aria-expanded"), "false");
  };
  const nav = async (label) => {
    const mobile = await page
      .getByRole("button", { name: "فتح القائمة", exact: true })
      .isVisible();
    if (mobile)
      await page
        .getByRole("button", { name: "فتح القائمة", exact: true })
        .click();
    await page
      .getByRole("navigation", { name: "صفحات النظام" })
      .getByRole("button", { name: label, exact: true })
      .click();
  };
  const noOverflow = async () =>
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
      "No horizontal page overflow",
    );
  try {
    await page.goto("http://127.0.0.1:5081");
    await page.screenshot({
      path: path.join(output, "login-desktop.png"),
      fullPage: true,
    });
    await login("admin");
    await page
      .getByRole("heading", { name: "آخر الموظفين انضمامًا" })
      .waitFor();
    const dashboard = await (await page.request.get("/api/dashboard")).json();
    assert.equal(dashboard.employees.total, 3);
    assert.equal(
      await page
        .locator(".metric-card")
        .first()
        .locator("strong")
        .textContent(),
      "3",
    );
    await page.screenshot({
      path: path.join(output, "dashboard-desktop.png"),
      fullPage: true,
    });
    results.push("Cookie login and real role-scoped dashboard metrics");

    await nav("المنشأة والهيكل");
    await page.getByLabel("اسم المنشأة").fill("منشأة الاختبار");
    await page.getByRole("button", { name: "حفظ إعداد المنشأة" }).click();
    await page.getByRole("status").filter({ hasText: "تم الحفظ." }).waitFor();
    results.push("Organization saved through API");

    await nav("الموظفون");
    await page.getByRole("button", { name: "+ إضافة موظف" }).click();
    await page
      .getByRole("textbox", { name: "الرقم الوظيفي", exact: true })
      .fill("BROWSER001");
    await page
      .getByRole("textbox", { name: "الاسم الكامل", exact: true })
      .fill("موظف اختبار المتصفح");
    await page
      .getByRole("combobox", { name: "الوظيفة", exact: true })
      .selectOption({ label: "أخصائي — التشغيل" });
    await noOverflow();
    await page.screenshot({
      path: path.join(output, "employee-form-desktop.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "حفظ الموظف", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await page
      .getByRole("status")
      .filter({ hasText: "تم حفظ ملف الموظف." })
      .waitFor();
    await page.getByLabel("بحث الموظفين", { exact: true }).fill("BROWSER001");
    await page
      .locator(".desktop-employees")
      .getByText("موظف اختبار المتصفح", { exact: true })
      .waitFor();
    results.push(
      "Create employee, retain save confirmation and search on server",
    );
    await page.getByLabel("الحالة", { exact: true }).selectOption("Inactive");
    await page.getByRole("heading", { name: "لا توجد نتائج مطابقة" }).waitFor();
    await page
      .getByRole("button", { name: "مسح الفلاتر", exact: true })
      .first()
      .click();
    await page
      .locator(".desktop-employees")
      .getByText("أمل", { exact: true })
      .waitFor();
    results.push("Server filters and reset restore results");
    await page.screenshot({
      path: path.join(output, "employees-desktop.png"),
      fullPage: true,
    });

    await page
      .getByRole("button", { name: "فتح ملف أمل", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "الاسم الكامل", exact: true })
      .fill("تعديل غير محفوظ");
    page.once("dialog", (d) => d.dismiss());
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 1);
    assert.equal(
      await page
        .getByRole("textbox", { name: "الاسم الكامل", exact: true })
        .inputValue(),
      "تعديل غير محفوظ",
    );
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "إغلاق ملف الموظف" }).click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await page
      .getByRole("button", { name: "فتح ملف أمل", exact: true })
      .click();
    await page.reload();
    await page
      .getByRole("textbox", { name: "الاسم الكامل", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("textbox", { name: "الاسم الكامل", exact: true })
        .inputValue(),
      "أمل",
    );
    await page.getByRole("button", { name: "إغلاق ملف الموظف" }).click();
    results.push(
      "Profile deep link survives reload; unsaved changes require explicit discard",
    );

    await nav("نظرة عامة");
    await page
      .getByRole("heading", { name: "آخر الموظفين انضمامًا" })
      .waitFor();
    assert.equal(
      await page
        .locator(".metric-card")
        .first()
        .locator("strong")
        .textContent(),
      "4",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow();
    await page.screenshot({
      path: path.join(output, "dashboard-mobile.png"),
      fullPage: true,
    });
    await nav("الموظفون");
    await page
      .locator(".mobile-employees")
      .getByText("أمل", { exact: true })
      .waitFor();
    await noOverflow();
    await page.screenshot({
      path: path.join(output, "employees-mobile.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "فتح ملف أمل على الجوال", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "الاسم الكامل", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("dialog")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
      true,
      "No horizontal profile overflow",
    );
    await page.screenshot({
      path: path.join(output, "employee-profile-mobile.png"),
      fullPage: false,
    });
    await page.getByRole("button", { name: "إغلاق ملف الموظف" }).click();
    await page.reload();
    await page
      .locator(".mobile-employees")
      .getByText("موظف اختبار المتصفح", { exact: true })
      .waitFor();
    assert.equal(new URL(page.url()).hash, "#employees");
    results.push(
      "RTL desktop and 390px mobile navigation, cards, dialog and route persistence",
    );

    const manifest = await (await page.request.get("/api/manifest")).json();
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.icons.length, 2);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.waitForLoadState("networkidle");
    const cached = await page.evaluate(async () => {
      const all = [];
      for (const name of await caches.keys())
        for (const r of await (await caches.open(name)).keys())
          all.push(new URL(r.url).pathname);
      return all;
    });
    assert.deepEqual(cached, ["/offline.html"]);
    results.push("PWA caches only offline notice, no authenticated data");

    await page
      .getByRole("button", { name: "فتح القائمة", exact: true })
      .click();
    await page.getByRole("button", { name: "تسجيل الخروج" }).click();
    await login("alice");
    await page.getByRole("heading", { name: "ملفي في المنشأة" }).waitFor();
    await page.getByRole("button", { name: "عرض الملف والمرفقات" }).click();
    await page.getByRole("dialog", { name: "أمل" }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "حفظ الموظف", exact: true })
        .count(),
      0,
    );
    await page.getByRole("tab", { name: "المرفقات الخاصة" }).click();
    await page.getByText("لا توجد مرفقات.", { exact: true }).waitFor();
    const list = await (await page.request.get("/api/employees")).json();
    assert.equal(list.total, 1);
    assert.equal(list.items[0].fullName, "أمل");
    assert.equal(
      await page
        .getByRole("button", { name: "البيانات المالية", exact: true })
        .count(),
      0,
    );
    await page.getByRole("button", { name: "إغلاق ملف الموظف" }).click();
    await page.goto("http://127.0.0.1:5081/#users");
    await page.getByRole("heading", { name: "ملفي في المنشأة" }).waitFor();
    assert.equal(
      await page.getByRole("heading", { name: "إنشاء حساب" }).count(),
      0,
    );
    results.push(
      "Employee own dashboard, read-only profile and files; privileged route denied",
    );
    await page.setViewportSize({ width: 360, height: 800 });
    await noOverflow();
    await page
      .getByRole("button", { name: "فتح القائمة", exact: true })
      .click();
    await page.getByRole("button", { name: "تسجيل الخروج" }).click();
    await page
      .getByRole("heading", { name: "تسجيل الدخول", exact: true })
      .waitFor();
    await noOverflow();
    await page.screenshot({
      path: path.join(output, "login-mobile.png"),
      fullPage: true,
    });
    results.push("360px login layout");
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(output, "results.json"),
      JSON.stringify({ passed: results, errors }, null, 2),
    );
    console.log(
      JSON.stringify({ passed: results.length, checks: results }, null, 2),
    );
  } catch (e) {
    await page.screenshot({
      path: path.join(output, "failure.png"),
      fullPage: true,
    });
    console.error("Browser errors:", errors);
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
