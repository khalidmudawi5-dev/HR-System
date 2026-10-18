// Run after browser-smoke.cjs against a fresh synthetic HR.BrowserHost, never customer SQL.
const { chromium } = require("../web/node_modules/playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:5081",
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const checks = [],
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (/Content Security Policy|violates the following/.test(m.text()))
      errors.push(m.text());
  });
  const output = path.resolve(__dirname, "../.local/browser");
  const resultPath=path.join(output,"attendance-results.json");
  if(fs.existsSync(resultPath))fs.unlinkSync(resultPath);
  async function login(user) {
    await page.goto("/");
    await page.locator(".shell,.login-page").first().waitFor();
    if (await page.locator(".shell").count()) {
      if (
        await page
          .getByRole("button", { name: "فتح القائمة", exact: true })
          .isVisible()
      )
        await page
          .getByRole("button", { name: "فتح القائمة", exact: true })
          .click();
      await page
        .getByRole("button", { name: "تسجيل الخروج", exact: true })
        .click();
    }
    await page
      .getByRole("textbox", { name: "البريد الإلكتروني", exact: true })
      .fill(user + "@test.local");
    await page
      .getByLabel("كلمة المرور", { exact: true })
      .fill("Test!Only2026x");
    await page
      .getByRole("button", { name: "دخول إلى حسابك", exact: true })
      .click();
    await page.locator(".shell").waitFor();
  }
  async function nav(label) {
    if (
      await page
        .getByRole("button", { name: "فتح القائمة", exact: true })
        .isVisible()
    )
      await page
        .getByRole("button", { name: "فتح القائمة", exact: true })
        .click();
    await page
      .getByRole("navigation", { name: "صفحات النظام" })
      .getByRole("button", { name: label, exact: true })
      .click();
  }
  async function period() {
    await page.getByLabel("من تاريخ").fill("2026-10-15");
    await page.getByLabel("إلى تاريخ").fill("2026-10-15");
    await page.locator(".attendance-table tbody tr").first().waitFor();
  }
  try {
    await login("admin");
    await nav("الجداول وسياسة الحضور");
    await page.getByText("إضافة تعريف شفت", { exact: true }).click();
    await page
      .getByRole("textbox", { name: "اسم الشفت", exact: true })
      .fill("شفت متصفح ليلي");
    await page
      .getByRole("textbox", { name: "بداية الشفت", exact: true })
      .fill("22:00");
    await page
      .getByRole("textbox", { name: "نهاية الشفت", exact: true })
      .fill("06:00");
    await page.getByLabel("ينتهي في اليوم التالي").check();
    await page
      .getByRole("button", { name: "حفظ تعريف الشفت", exact: true })
      .click();
    await page
      .locator(".shift-catalog")
      .getByText("شفت متصفح ليلي", { exact: true })
      .waitFor();
    await page
      .getByRole("combobox", { name: "الشفت المطلوب", exact: true })
      .selectOption({ label: "شفت متصفح ليلي" });
    await page.getByLabel("بداية فترة الجدول").fill("2026-11-02");
    await page.getByLabel("نهاية فترة الجدول").fill("2026-11-03");
    await page.getByLabel("بحث الموظفين للجدول").fill("EMP002");
    await page
      .locator(".employee-checks label")
      .filter({ hasText: "EMP002" })
      .getByRole("checkbox")
      .check();
    await page
      .getByRole("button", { name: "إنشاء الجداول", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "تم إنشاء 2 يومًا مجدولًا." })
      .waitFor();
    checks.push(
      "Create a night shift and assign an actual employee roster through UI",
    );
    page.once("dialog", (d) => d.accept());
    await page.getByLabel("السماح بالتسجيل من البوابة").click();
    await page
      .getByRole("status")
      .filter({ hasText: "تم حفظ إعداد الحضور." })
      .waitFor();
    await page.screenshot({
      path: path.join(output, "attendance-setup-desktop.png"),
      fullPage: true,
    });
    await nav("استيراد حركات الحضور");
    await page
      .getByLabel("ملف حركات الحضور")
      .setInputFiles(path.join(output, "attendance-fixture.xlsx"));
    await page
      .getByRole("button", { name: "معاينة الحركات", exact: true })
      .click();
    await page.getByText("مكررة — ستتجاهل", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "حفظ الحركات", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "تم حفظ 1 حركة، وتجاهل 1 حركة مكررة." })
      .waitFor();
    await page
      .getByLabel("ملف حركات الحضور")
      .setInputFiles(path.join(output, "attendance-fixture.xlsx"));
    await page
      .getByRole("button", { name: "معاينة الحركات", exact: true })
      .click();
    await page.locator("tbody tr").nth(1).waitFor();
    assert.equal(
      await page.getByText("مكررة — ستتجاهل", { exact: true }).count(),
      2,
    );
    await page
      .getByRole("button", { name: "حفظ الحركات", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "تم حفظ 0 حركة، وتجاهل 2 حركة مكررة." })
      .waitFor();
    checks.push(
      "Excel preview, atomic commit and repeated import with no duplicate movements",
    );
    await nav("الحضور والانصراف");
    await period();
    const bob = page
      .locator(".attendance-table tbody tr")
      .filter({ hasText: "بدر" });
    await bob.getByText("مكتمل", { exact: true }).waitFor();
    assert.equal(await page.locator(".attendance-table tbody tr").count(), 3);
    await page.screenshot({
      path: path.join(output, "attendance-report-desktop.png"),
      fullPage: true,
    });
    checks.push(
      "Scoped attendance report recalculates from imported raw punches",
    );
    await login("alice");
    await nav("حضوري");
    await period();
    assert.equal(await page.locator(".attendance-table tbody tr").count(), 1);
    assert.equal(
      await page
        .getByRole("button", { name: "تعديل الجدول", exact: true })
        .count(),
      0,
    );
    await page.getByRole("button", { name: "طلب تصحيح", exact: true }).click();
    assert.equal(
      await page.getByLabel("الدخول الصحيح").inputValue(),
      "2026-10-15T08:00",
    );
    await page
      .getByRole("textbox", { name: "سبب التصحيح", exact: true })
      .fill("نسيان تسجيل الخروج — اختبار متصفح");
    await page
      .getByRole("button", { name: "إرسال للمراجعة", exact: true })
      .click();
    await page.getByText("بانتظار الاعتماد", { exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "اعتماد التصحيح", exact: true })
        .count(),
      0,
    );
    checks.push(
      "Employee own attendance, correct Riyadh times and correction submission without self-approval",
    );
    await login("manager");
    await nav("الحضور والانصراف");
    await page
      .getByRole("navigation", { name: "أقسام الحضور" })
      .getByRole("button", { name: "طلبات التصحيح", exact: true })
      .click();
    await page
      .getByRole("button", { name: "اعتماد التصحيح", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "ملاحظة القرار", exact: true })
      .fill("اعتماد بعد المراجعة");
    await page
      .getByRole("button", { name: "تأكيد القرار", exact: true })
      .click();
    await page.getByText("معتمد", { exact: true }).waitFor();
    await page.screenshot({
      path: path.join(output, "attendance-approval-desktop.png"),
      fullPage: true,
    });
    await page
      .getByRole("navigation", { name: "أقسام الحضور" })
      .getByRole("button", { name: "سجل الحضور", exact: true })
      .click();
    await period();
    const alice = page
      .locator(".attendance-table tbody tr")
      .filter({ hasText: "أمل" });
    await alice.getByText("مكتمل", { exact: true }).waitFor();
    await alice
      .getByText("1 حركة أصلية · مصحح باعتماد", { exact: true })
      .waitFor();
    assert.equal(
      await page
        .locator(".attendance-table tbody tr")
        .filter({ hasText: "بدر" })
        .count(),
      0,
    );
    checks.push(
      "Direct manager approval updates derived attendance while original punches remain unchanged",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(output, "attendance-report-mobile.png"),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await login("alice");
    await nav("حضوري");
    await page.getByRole("button", { name: "تسجيل دخول", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "تم تسجيل الحركة بوقت الخادم." })
      .waitFor();
    await page.screenshot({
      path: path.join(output, "attendance-portal-mobile.png"),
      fullPage: true,
    });
    const own = await (
      await page.request.get(
        "/api/attendance/punches?from=2026-10-18&to=2026-10-18",
      )
    ).json();
    assert.equal(own.total, 1);
    assert.equal(own.items[0].kind, "In");
    assert.match(own.items[0].occurredAtUtc, /2026-10-18T20:00:00/);
    assert.equal(own.items[0].source, "Portal");
    checks.push(
      "Mobile employee portal uses the fixed server clock and preserves own-data scope",
    );
    await page.reload();
    await page.getByRole("navigation", { name: "أقسام الحضور" }).waitFor();
    assert.equal(new URL(page.url()).hash, "#attendance");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    checks.push(
      "Attendance route persistence, mobile layout and no JavaScript or CSP errors",
    );
    fs.writeFileSync(
      path.join(output, "attendance-results.json"),
      JSON.stringify({ passed: checks, errors }, null, 2),
    );
    console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
  } catch (e) {
    await page.screenshot({
      path: path.join(output, "attendance-failure.png"),
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
