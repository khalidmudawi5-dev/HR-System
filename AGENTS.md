# HR Platform engineering rules

- Read docs/requirements.ar.md and docs/progress.md before changing scope.
- Build a modular monolith: Domain → Application → Infrastructure → API; React is separate.
- One independent SQL Server database per customer. Never migrate another project's database. Require an explicit database name and connection before schema operations.
- Use .NET 10, EF Core SQL Server, Identity, React/TypeScript/Vite. Do not replace SQL Server with a different production database.
- Authorize every server operation and scope employee data. Never trust client roles or IDs.
- Cookies must be HttpOnly; protect mutations with antiforgery. Never cache private API responses in a service worker or store auth tokens in localStorage.
- Never commit credentials, attachments, build outputs, or real employee data. No default production passwords.
- Money uses decimal; statutory rules require official dated sources before production use.
- Keep docs/progress.md honest about passed, failed, blocked and unrun checks. Simulator and test database results do not prove physical-device or SQL Server integration.
- Each cloud task is isolated. Use the existing checkout; do not create Git worktrees unless the user requests one.
- Use frozen dependency installs after lockfiles exist. Keep dependency licenses in docs/licenses.md.
