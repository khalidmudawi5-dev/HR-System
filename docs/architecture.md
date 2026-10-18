# Architecture

Modular monolith, one ASP.NET Core host and one independent database per customer.

- Domain: organization/employee invariants, no EF or HTTP references.
- Application: DTOs, validation and access decisions.
- Infrastructure: EF Core SQL Server, Identity stores, private file storage, transactional audit and Excel parsing.
- API: cookie authentication, antiforgery, rate limiting, authorization and endpoint composition.
- web: React/TypeScript/Vite, same-origin API, Arabic RTL with English dictionary. Production assets served by ASP.NET Core.

Authorization roles: Administrator manages users/configuration; HR manages organization and employees; Payroll reads/writes financial fields; Manager sees direct reports' nonsensitive records; Employee sees own nonsensitive record. Privileged roles have customer-wide scope within this dedicated database. No anonymous registration. Financial data never appears in the normal employee DTO.

Identity security stamp validation, lockout, secure production cookies, CSRF tokens, pagination and request limits. Audit records join the same SaveChanges transaction as entity changes. Optimistic concurrency tokens protect edits. Unique database constraints arbitrate employee number duplication. Bootstrap and migrations are explicit operator commands, never automatic on normal startup.

Attachments are outside the public root and downloaded only through an authorized endpoint. Production requires HTTPS, persistent protected data-protection keys and backup policies. PWA caches only a static offline notice; it does not cache authenticated pages or APIs.

Attendance validation/calculation lives in Application; EF workflows and idempotent Excel import live in Infrastructure. Same-origin endpoints enforce attendance roles separately from Payroll and always reuse the employee visibility scope. Correction decisions and schedule assignment use serializable transactions plus unique keys and version checks. Raw punches and shift definitions reject updates/deletes through both sync and async DbContext save paths. Derived attendance uses server TimeProvider, per-schedule timezone and explicitly configured grace/break rules; no statutory payroll assumptions.
