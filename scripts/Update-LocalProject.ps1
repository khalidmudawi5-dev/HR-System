<#
.SYNOPSIS
Update a ZIP-based development checkout from a verified, pinned repository archive.
.DESCRIPTION
Stops on failure. Backs up overwritten source files and records newly added files.
Preserves local configuration, secrets, keys, attachments and databases. Does not
run migrations, bootstrap accounts, modify certificates or restart SQL services.
Stop the application before using -Apply. Without -Apply, only inspect the plan.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{40}$')][string]$Revision,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ArchiveSha256,
    [string]$TargetPath = (Get-Location).Path,
    [string]$ArchivePath,
    [switch]$Apply,
    [switch]$Build
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($Build -and -not $Apply) { throw '-Build requires -Apply.' }
$target = [IO.Path]::GetFullPath($TargetPath).TrimEnd([IO.Path]::DirectorySeparatorChar)
if (-not [IO.File]::Exists([IO.Path]::Combine($target,'HRPlatform.sln')) -or
    -not [IO.File]::Exists([IO.Path]::Combine($target,'src','HR.Api','HR.Api.csproj'))) {
    throw 'Target must be an existing HR Platform source checkout.'
}
if ([IO.Directory]::Exists([IO.Path]::Combine($target,'.git')) -or [IO.File]::Exists([IO.Path]::Combine($target,'.git'))) {
    throw 'This helper is for ZIP checkouts. Use Git to update a Git checkout.'
}
function Assert-NoLink([string]$Path) {
    $current = $Path
    while ($current -and $current.StartsWith($target,[StringComparison]::OrdinalIgnoreCase)) {
        if ([IO.File]::Exists($current) -or [IO.Directory]::Exists($current)) {
            if (([IO.File]::GetAttributes($current) -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Refusing to follow a link or junction: $current"
            }
        }
        if ($current -eq $target) { break }
        $current = [IO.Path]::GetDirectoryName($current)
    }
}
Assert-NoLink $target
$work = [IO.Path]::Combine([IO.Path]::GetTempPath(),'hr-update-'+[Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($work)
$archive = [IO.Path]::Combine($work,'source.zip')
$backup = $null
try {
    if ($ArchivePath) { [IO.File]::Copy([IO.Path]::GetFullPath($ArchivePath),$archive) }
    else {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $download = New-Object Net.WebClient
        try { $download.DownloadFile("https://codeload.github.com/khalidmudawi5-dev/HR-System/zip/$Revision",$archive) }
        finally { $download.Dispose() }
    }
    $sha = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($archive)
    try { $actual = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','') }
    finally { $stream.Dispose(); $sha.Dispose() }
    if ($actual -ine $ArchiveSha256) { throw 'Archive SHA256 mismatch. Nothing was changed.' }
    # Add-Type resolves the .NET Framework assembly from the Windows GAC;
    # Assembly.Load with a simple name does not reliably do that in Windows PowerShell 5.1.
    Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction Stop
    $zip = [IO.Compression.ZipFile]::OpenRead($archive)
    $items = New-Object 'System.Collections.Generic.List[object]'
    $prefix = 'HR-System-'+$Revision+'/'
    $allowedRoots = @('src','web','tests','scripts','docs')
    $allowedFiles = @('HRPlatform.sln','Directory.Build.props','global.json','dotnet-tools.json','README.md','AGENTS.md','LICENSE','.gitignore')
    try {
        foreach ($entry in $zip.Entries) {
            $name = $entry.FullName
            if (-not $name.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected archive root.' }
            $relative = $name.Substring($prefix.Length)
            if (-not $relative -or $relative.EndsWith('/')) { continue }
            $parts = $relative.Split('/')
            if ($parts -contains '..' -or $parts -contains '.' -or $relative.Contains('\') -or $relative.Contains(':') -or $relative.StartsWith('/')) {
                throw 'Unsafe archive path.'
            }
            if (($entry.ExternalAttributes -shr 16 -band 0xF000) -eq 0xA000) { throw 'Archive contains a symbolic link.' }
            $leaf = $parts[$parts.Length-1]
            if ($parts.Length -gt 1) {
                if ($allowedRoots -notcontains $parts[0]) { continue }
            } elseif ($allowedFiles -notcontains $leaf) { continue }
            if ($leaf -like 'appsettings*.json' -or $leaf -eq 'launchSettings.json' -or
                $leaf -like '.env*' -or $leaf -match '\.(db|mdf|ldf|bak|pfx|p12|key|user)$' -or
                @($parts | Where-Object { $_ -in @('.local','.git','bin','obj','node_modules','dist','wwwroot','uploads','TestResults') }).Count -gt 0) { continue }
            $destination = [IO.Path]::GetFullPath([IO.Path]::Combine($target,($relative.Replace('/',[IO.Path]::DirectorySeparatorChar))))
            if (-not $destination.StartsWith($target+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Destination escapes checkout.' }
            Assert-NoLink $destination
            $items.Add([pscustomobject]@{Entry=$entry;Relative=$relative;Destination=$destination;Existed=[IO.File]::Exists($destination)})
        }
        if (-not ($items | Where-Object { $_.Relative -eq 'web/src/App.tsx' }) -or
            -not ($items | Where-Object { $_.Relative -eq 'src/HR.Api/Program.cs' })) { throw 'Archive is not a complete HR Platform source package.' }
        Write-Output "Verified revision: $Revision"
        Write-Output "Source files: $($items.Count). Target: $target"
        Write-Output 'Local configuration and private data are excluded. No database commands will run.'
        if (-not $Apply) { Write-Output 'Preview only. Run again with -Apply to install; add -Build to test and build.'; return }
        $backup = [IO.Path]::Combine($target,'.local','updates',([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8)))
        Assert-NoLink $backup
        [void][IO.Directory]::CreateDirectory($backup)
        $manifest = @($items | ForEach-Object { [pscustomobject]@{Path=$_.Relative;Existed=$_.Existed} })
        [IO.File]::WriteAllText([IO.Path]::Combine($backup,'manifest.json'),(ConvertTo-Json -InputObject $manifest -Depth 3))
        # Finish every backup before overwriting any source file.
        foreach ($item in $items) {
            if ($item.Existed) {
                $copy = [IO.Path]::Combine($backup,'source',$item.Relative.Replace('/',[IO.Path]::DirectorySeparatorChar))
                [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($copy))
                [IO.File]::Copy($item.Destination,$copy)
            }
        }
        foreach ($item in $items) {
            Assert-NoLink $item.Destination
            [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($item.Destination))
            $input = $item.Entry.Open()
            try {
                $output = [IO.File]::Create($item.Destination)
                try { $input.CopyTo($output) } finally { $output.Dispose() }
            } finally { $input.Dispose() }
        }
        Write-Output "Source updated. Backup and file manifest: $backup"
    } finally { $zip.Dispose() }
    if ($Build) {
        Push-Location $target
        try {
            & dotnet restore HRPlatform.sln --locked-mode
            if ($LASTEXITCODE -ne 0) { throw 'dotnet restore failed.' }
            & dotnet test HRPlatform.sln --no-restore
            if ($LASTEXITCODE -ne 0) { throw 'dotnet tests failed.' }
            & npm.cmd --prefix web ci
            if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
            & npm.cmd --prefix web test
            if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed.' }
            & npm.cmd --prefix web run build
            if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
            $public = [IO.Path]::Combine($target,'src','HR.Api','wwwroot')
            Assert-NoLink $public
            [void][IO.Directory]::CreateDirectory($public)
            $dist = [IO.Path]::Combine($target,'web','dist')
            foreach ($file in [IO.Directory]::GetFiles($dist,'*',[IO.SearchOption]::AllDirectories)) {
                $destination = [IO.Path]::Combine($public,$file.Substring($dist.Length+1))
                Assert-NoLink $destination
                [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination))
                [IO.File]::Copy($file,$destination,$true)
            }
            Write-Output 'HR Platform update built and tested successfully.'
        } finally { Pop-Location }
    }
} catch {
    if ($backup) { Write-Warning "Update stopped. Source backup: $backup. Keep the application stopped until resolved." }
    throw
} finally { if ([IO.Directory]::Exists($work)) { [IO.Directory]::Delete($work,$true) } }
