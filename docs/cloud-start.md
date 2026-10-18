# HR Platform cloud startup

Each cloud task is isolated. Use the existing checkout at /workspace/HR-System; do not create a Git worktree unless the user explicitly requests one. Read AGENTS.md and docs/progress.md. Source scripts/cloud-env.sh to activate the prepared SDK, NuGet packages and npm cache. If dependencies need refreshing, run bash scripts/cloud-setup.sh. It preserves pinned lockfiles and never migrates a database.

Retained artifacts: .NET SDK under /workspace/tooling/dotnet, NuGet/npm caches, restored dependencies, source, generated SQL migration, web/dist and src/HR.Api/wwwroot. Processes do not survive snapshots; restart only the services needed for the task.

The user's SQL Server is on their local Windows computer. The user approved the independent database HRPlatform_Dev on KHALID-OSMAN with Windows Authentication, and reported local migration and login success. There is no usable SQL connection from this cloud machine. Do not invent credentials, expose SQL publicly, create a production substitute database, or describe SQLite tests as SQL Server validation. docs/windows-setup.md contains the real SQL setup steps. Complete SQL acceptance and backup/restore checks still need execution in the authorized Windows environment. Do not ask again for a database name already approved in this session.

For the verified independent development workflow, run from /workspace/HR-System:

1. `source scripts/cloud-env.sh`.
2. `dotnet test HRPlatform.sln --no-restore` and `(cd web && npm test)`.
3. For browser work, `(cd web && npm run build)` then `mkdir -p src/HR.Api/wwwroot && cp -R web/dist/. src/HR.Api/wwwroot/`.
4. Start `dotnet run --no-build --project tests/HR.BrowserHost` in a managed background session, logging its output to an ignored or /tmp file if needed. This binds port 5081 to loopback and creates a fresh disposable SQLite database containing explicitly synthetic test identities, day/night shifts and schedules. Its attendance fixture clock is fixed to 2026-10-18 20:00 UTC; it is never the production clock. Never deploy this host or its accounts. Start only if no owned instance already occupies the port; stop only instances started by the agent.
5. Check `curl --fail http://127.0.0.1:5081/api/health` returns the reachable database status. A port alone is insufficient.
6. Against a freshly started test host, run `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium node scripts/browser-smoke.cjs`, followed by `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium node scripts/attendance-browser-smoke.cjs`. This authenticates with synthetic fixtures, creates an organization and employee, checks persistence, employee isolation, mobile layout and private-data-free PWA cache. A repeat browser run requires a fresh owned test host because its employee number is intentionally fixed. Results and screenshots go to .local/browser. No user-facing loopback preview links.

For an actual SQL-backed runtime, first inspect configured variable names/bindings without printing values and check the approved database target. Never run --migrate or --bootstrap as a normal startup side effect. With authorized SQL setup completed, use `dotnet run --project src/HR.Api -- --urls http://127.0.0.1:5080 --environment Development` and validate health plus an authenticated employee workflow. HTTP here is loopback development only; deployment requires HTTPS. For Vite development use `(cd web && npm run dev)`; its /api proxy targets 5080, not the synthetic 5081 host.

Database migration consistency can be checked offline with `dotnet ef migrations has-pending-model-changes --project src/HR.Infrastructure --startup-project src/HR.Api`. Production packaging is `dotnet publish src/HR.Api -c Release -o .local/publish --no-restore`. Windows deployment, SQL migrations, backup/restore, device and load checks have not been validated by this cloud setup; consult the current progress and validation documents.

The attendance release adds an additive SQL migration. Apply it only with the guarded --migrate operator command against the already approved customer database, never against an unrelated database and never as implicit cloud startup. No customer SQL access is configured here. See docs/attendance.md for Windows upgrade steps.
