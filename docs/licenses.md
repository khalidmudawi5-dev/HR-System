# Dependency licenses

Recorded 2026-10-15 from the exact installed package metadata. Full inventories: [NuGet](nuget-licenses.csv), [npm](npm-licenses.json). Lockfiles pin direct and transitive versions. Updates require regenerating inventories and reviewing notices. These records do not replace each package's distribution terms.

| Dependency | License / notes |
|---|---|
| ASP.NET Core, Identity, EF Core 10.0.13 | MIT |
| Microsoft.Data.SqlClient 6.1.7 (transitive; pinned in lockfile) | MIT; native components have Microsoft redistribution terms |
| ClosedXML 0.105.1 and Open XML SDK | MIT |
| React / React DOM 19.3.1 | MIT |
| TypeScript 7.0.2 | Apache-2.0 |
| Vite 8.3.4 / Vitest 5.0.4 / Testing Library | MIT |
| Playwright 1.64.1 | Apache-2.0, development test dependency |
| xUnit 2.9.3 / Microsoft.NET.Test.Sdk | Apache-2.0 / MIT |
| SQL Server 2022 Enterprise | Customer-provided proprietary server license, not bundled |

Native SQL components carry Microsoft software license terms permitting use/distribution under conditions. Their complete texts are retained in docs/licenses/microsoft.data.sqlclient.sni.runtime.txt and docs/licenses/microsoft.identity.client.nativeinterop.txt. Include applicable third-party and redistribution notices in shipping packages. xunit.abstractions 2.0.3 uses a legacy license URL instead of a nuspec expression; its referenced official text was fetched and retained in docs/licenses/xunit.txt (Apache-2.0).

The dependency graph contains permissive MIT/Apache and other recorded permissive npm licenses, plus the two Microsoft native component terms above. No EPPlus, proprietary UI kit, paid API, unknown biometric SDK or ZKTeco SDK was added. Before shipping, review the inventory and include notices for actual shipped assemblies/assets and native runtime components. Test-only packages should not be bundled into the application.

The SDK artifact URL and SHA512 are pinned in scripts/sdk-linux-x64.json using Microsoft's official 10.0 release metadata. Download and checksum verification stay enabled. NuGet integrity hashes and npm integrity hashes remain in their lockfiles. The cryptography package is explicitly pinned to 10.0.13 to resolve vulnerability advisories from an older transitive version.
