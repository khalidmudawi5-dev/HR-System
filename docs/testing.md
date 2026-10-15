# Tests

`dotnet test HRPlatform.sln --no-restore` runs xUnit API/infrastructure tests on SQLite. Each factory creates its own synthetic database and private storage, then removes them. Real SQL Server is not contacted. Per-client IPs are injected by test-only middleware to exercise the production login limiter without making the whole suite one client.

`cd web && npm test` runs Vitest/Testing Library UI and request-client tests. These verify command submission, error handling, authorization navigation and import-error gating; they do not replace server authorization tests.

## Browser flow

Build and copy web/dist to src/HR.Api/wwwroot (scripts/build.ps1 on Windows), then:

```powershell
dotnet run --project tests/HR.BrowserHost
```

In another terminal, after installing a compatible Chromium through Playwright (`cd web; npx playwright install chromium`):

```powershell
node scripts/browser-smoke.cjs
```

On the cloud machine a system Chromium is available; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium` for that command. BrowserHost is explicitly test-only, exposes synthetic test accounts and must never be published as the application. Stop it after testing. Its data is disposable and does not touch SQL Server. Run the browser flow against a fresh host; its employee number is deliberately fixed so repeated runs detect duplicate persistence.

The flow checks login, organization save, employee creation/search/reload, mobile layout, employee isolation and PWA cache. Screenshots/results are generated in .local/browser and excluded from Git. No localhost preview links are published by cloud onboarding.

## Required SQL Server acceptance (pending access)

On an approved new HRPlatform_* database: run the guarded migration and bootstrap commands; run organization/employee/import/account flows; check unique constraints and concurrent updates; restart and confirm persistence; backup and restore to a separate approved test database; compare row counts and functional behavior. Record server build, OS, commands, pass/fail and restore evidence in validation.md. Do not interpret SQLite results or a generated SQL script as these checks.

Attendance, leave approvals, payroll, device integration and the 1,000-employee load benchmark belong to later phases and have not executed.
