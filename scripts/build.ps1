param([string]$PublishTo = "")
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
function Invoke-Checked([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE" }
}
Invoke-Checked "dotnet" @("tool", "restore")
Invoke-Checked "dotnet" @("restore", "HRPlatform.sln", "--locked-mode")
Invoke-Checked "dotnet" @("test", "HRPlatform.sln", "--no-restore")
Push-Location "web"
try {
    Invoke-Checked "npm.cmd" @("ci")
    Invoke-Checked "npm.cmd" @("test")
    Invoke-Checked "npm.cmd" @("run", "build")
} finally { Pop-Location }
New-Item -ItemType Directory -Force "src/HR.Api/wwwroot" | Out-Null
Copy-Item -Recurse -Force "web/dist/*" "src/HR.Api/wwwroot/"
if ($PublishTo) { Invoke-Checked "dotnet" @("publish", "src/HR.Api", "-c", "Release", "-o", $PublishTo, "--no-restore") }
