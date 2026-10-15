# Self-contained updater checks. Uses only disposable files, never SQL Server.
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
[void][Reflection.Assembly]::Load('System.IO.Compression.FileSystem')
$helper=[IO.Path]::GetFullPath([IO.Path]::Combine($PSScriptRoot,'..','scripts','Update-LocalProject.ps1'))
$root=[IO.Path]::Combine([IO.Path]::GetTempPath(),'hr-updater-test-'+[Guid]::NewGuid().ToString('N'))
$target=[IO.Path]::Combine($root,'checkout')
$revision='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
function Write-Text([string]$Relative,[string]$Text) {
    $file=[IO.Path]::Combine($target,$Relative)
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($file))
    [IO.File]::WriteAllText($file,$Text)
}
function Assert-Text([string]$Relative,[string]$Expected) {
    if ([IO.File]::ReadAllText([IO.Path]::Combine($target,$Relative)) -cne $Expected) { throw "Unexpected content: $Relative" }
}
function Archive([string]$Name,[hashtable]$Files) {
    $file=[IO.Path]::Combine($root,$Name+'.zip')
    $zip=[IO.Compression.ZipFile]::Open($file,[IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($relative in $Files.Keys) {
            $entry=$zip.CreateEntry('HR-System-'+$revision+'/'+$relative)
            $writer=New-Object IO.StreamWriter($entry.Open())
            try { $writer.Write($Files[$relative]) } finally { $writer.Dispose() }
        }
    } finally { $zip.Dispose() }
    return $file
}
function Digest([string]$Path) {
    $hash=[Security.Cryptography.SHA256]::Create();$stream=[IO.File]::OpenRead($Path)
    try { return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','') }
    finally { $stream.Dispose();$hash.Dispose() }
}
function Expect-Rejection([scriptblock]$Action,[string]$Message) {
    $rejected=$false
    try { & $Action | Out-Null } catch { if ($_.Exception.Message -notlike "*$Message*") { throw };$rejected=$true }
    if (-not $rejected) { throw "Expected rejection: $Message" }
}
try {
    Write-Text 'HRPlatform.sln' 'synthetic solution'
    Write-Text 'src/HR.Api/HR.Api.csproj' '<Project />'
    Write-Text 'web/src/App.tsx' 'original source'
    Write-Text 'src/HR.Api/appsettings.json' 'local settings'
    Write-Text '.local/attachments/owned' 'private attachment'
    Write-Text '.env' 'local secret'
    Write-Text 'src/HR.Api/wwwroot/keep' 'existing website'
    Write-Text 'unknown.txt' 'user file'
    $package=Archive 'valid' @{
        'HRPlatform.sln'='new solution';'src/HR.Api/Program.cs'='new API';
        'web/src/App.tsx'='new interface';'web/src/new.ts'='new file';
        'src/HR.Api/appsettings.json'='must not overwrite';
        'src/HR.Api/appsettings.Local.json'='must not create';
        '.local/attachments/owned'='must not overwrite';'.env'='must not overwrite';
        'src/HR.Api/wwwroot/keep'='must not overwrite';'docs/file.db'='must not copy'
    }
    $hash=Digest $package
    & $helper -Revision $revision -ArchiveSha256 $hash -TargetPath $target -ArchivePath $package | Out-Null
    Assert-Text 'web/src/App.tsx' 'original source'
    if ([IO.Directory]::Exists([IO.Path]::Combine($target,'.local','updates'))) { throw 'Preview wrote a backup.' }
    Write-Output 'PASS: preview does not change checkout'
    Expect-Rejection { & $helper -Revision $revision -ArchiveSha256 ('0'*64) -TargetPath $target -ArchivePath $package -Apply } 'SHA256 mismatch'
    Assert-Text 'web/src/App.tsx' 'original source'
    Write-Output 'PASS: checksum failure leaves source unchanged'
    $bad=Archive 'traversal' @{'../escape.txt'='unsafe';'web/src/App.tsx'='unsafe';'src/HR.Api/Program.cs'='unsafe'}
    Expect-Rejection { & $helper -Revision $revision -ArchiveSha256 (Digest $bad) -TargetPath $target -ArchivePath $bad -Apply } 'Unsafe archive path'
    Assert-Text 'web/src/App.tsx' 'original source'
    Write-Output 'PASS: archive traversal rejected before file mutation'
    & $helper -Revision $revision -ArchiveSha256 $hash -TargetPath $target -ArchivePath $package -Apply | Out-Null
    Assert-Text 'web/src/App.tsx' 'new interface'
    Assert-Text 'web/src/new.ts' 'new file'
    Assert-Text 'src/HR.Api/appsettings.json' 'local settings'
    Assert-Text '.local/attachments/owned' 'private attachment'
    Assert-Text '.env' 'local secret'
    Assert-Text 'src/HR.Api/wwwroot/keep' 'existing website'
    Assert-Text 'unknown.txt' 'user file'
    if ([IO.File]::Exists([IO.Path]::Combine($target,'src/HR.Api/appsettings.Local.json')) -or [IO.File]::Exists([IO.Path]::Combine($target,'docs/file.db'))) { throw 'Excluded file was copied.' }
    $backups=[IO.Directory]::GetDirectories([IO.Path]::Combine($target,'.local','updates'))
    if ($backups.Length -ne 1) { throw 'Expected one source backup.' }
    if ([IO.File]::ReadAllText([IO.Path]::Combine($backups[0],'source/web/src/App.tsx')) -cne 'original source') { throw 'Original source not backed up.' }
    $manifest=ConvertFrom-Json ([IO.File]::ReadAllText([IO.Path]::Combine($backups[0],'manifest.json')))
    if (-not ($manifest | Where-Object { $_.Path -eq 'web/src/new.ts' -and -not $_.Existed })) { throw 'New source not recorded.' }
    Write-Output 'PASS: apply backs up source and preserves configuration, secrets, private files and website'
    $incomplete=Archive 'incomplete' @{'docs/nothing.txt'='incomplete'}
    Expect-Rejection { & $helper -Revision $revision -ArchiveSha256 (Digest $incomplete) -TargetPath $target -ArchivePath $incomplete -Apply } 'not a complete'
    Write-Output 'PASS: incomplete package rejected'
    [void][IO.Directory]::CreateDirectory([IO.Path]::Combine($target,'.git'))
    Expect-Rejection { & $helper -Revision $revision -ArchiveSha256 $hash -TargetPath $target -ArchivePath $package -Apply } 'Use Git'
    Write-Output 'PASS: helper refuses a Git checkout'
} finally { if ([IO.Directory]::Exists($root)) { [IO.Directory]::Delete($root,$true) } }
