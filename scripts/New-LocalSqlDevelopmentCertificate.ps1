#Requires -Version 5.1
<#
.SYNOPSIS
Prepares a trusted certificate for a SQL Server instance on this development computer.
.DESCRIPTION
Without -Install, prints a read-only plan. Installation creates a non-exportable private
key, trusts the public certificate on this computer and grants the SQL service read access
to that new key. It does not bind the certificate, restart services or access a database.
Bind it explicitly in SQL Server Configuration Manager during an approved restart window.
Not a production certificate provisioning mechanism.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [ValidatePattern('^[A-Za-z0-9_]+$')]
    [string]$InstanceName = 'MSSQLSERVER',
    [switch]$Install
)
$ErrorActionPreference = 'Stop'
$machineName = $env:COMPUTERNAME
if ([string]::IsNullOrWhiteSpace($machineName)) { throw 'Run this script on the Windows SQL Server computer.' }
$instanceNames = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL'
$instanceProperty = $instanceNames.PSObject.Properties[$InstanceName]
if ($null -eq $instanceProperty) { throw "SQL instance $InstanceName was not found on this computer." }
$instanceId = [string]$instanceProperty.Value
$registryPath = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\$instanceId\MSSQLServer\SuperSocketNetLib"
$configuredCertificate = (Get-ItemProperty $registryPath).Certificate
$serviceName = if ($InstanceName -eq 'MSSQLSERVER') { 'MSSQLSERVER' } else { 'MSSQL$' + $InstanceName }
$service = Get-CimInstance Win32_Service -Filter "Name='$serviceName'"
if ($null -eq $service) { throw 'SQL service was not found.' }
$dependencies = @((Get-Service $serviceName).DependentServices | Where-Object { $_.Status -eq 'Running' } | Select-Object -ExpandProperty Name)
$fqdn = [System.Net.Dns]::GetHostEntry('').HostName
$dnsNames = @($machineName, $fqdn, 'localhost') | Sort-Object -Unique
$certificateFolder = Join-Path $env:ProgramData "HRPlatform\LocalSqlTls\$InstanceName"
$recordPath = Join-Path $certificateFolder 'certificate.json'

[pscustomobject]@{
    Computer = $machineName
    Instance = $InstanceName
    ServiceAccount = $service.StartName
    CurrentCertificate = $configuredCertificate
    RunningDependentServices = ($dependencies -join ', ')
    DnsNames = ($dnsNames -join ', ')
    Plan = 'Create local development certificate; trust public certificate locally; grant SQL read access to new key. Binding and restart remain manual.'
}
if (-not $Install) { Write-Host 'Read-only plan. Nothing changed. Installation requires -Install from elevated PowerShell.'; return }

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Open PowerShell as Administrator to install the certificate.' }
if (-not $PSCmdlet.ShouldProcess("$machineName local certificate stores", 'Install local SQL development certificate and grant service key access')) { return }
if (Test-Path $recordPath) {
    $record = Get-Content $recordPath -Raw | ConvertFrom-Json
    $existing = Get-Item ("Cert:\LocalMachine\My\" + $record.Thumbprint) -ErrorAction SilentlyContinue
    $trusted = Test-Path ("Cert:\LocalMachine\Root\" + $record.Thumbprint)
    if ($null -ne $existing -and $existing.HasPrivateKey -and $existing.NotAfter -gt (Get-Date).AddDays(7) -and $trusted) {
        Write-Host 'Previously prepared certificate retained. No new certificate created.'
        $existing | Select-Object Subject, FriendlyName, Thumbprint, NotAfter
        return
    }
    throw "A previous preparation record exists at $recordPath. Review that certificate before replacement."
}
if (-not [string]::IsNullOrWhiteSpace($configuredCertificate)) { throw 'An explicit SQL certificate already exists. Review its chain instead of replacing it with this development helper.' }

$certificate = $null
$publicFile = $null
try {
    $certificateParams = @{
        Type = 'SSLServerAuthentication'
        Subject = "CN=$machineName"
        DnsName = $dnsNames
        FriendlyName = "HR Platform local SQL development ($InstanceName)"
        KeyAlgorithm = 'RSA'
        KeyLength = 2048
        HashAlgorithm = 'SHA256'
        TextExtension = '2.5.29.37={text}1.3.6.1.5.5.7.3.1'
        NotAfter = (Get-Date).AddMonths(12)
        KeySpec = 'KeyExchange'
        KeyExportPolicy = 'NonExportable'
        Provider = 'Microsoft RSA SChannel Cryptographic Provider'
        CertStoreLocation = 'Cert:\LocalMachine\My'
    }
    $certificate = New-SelfSignedCertificate @certificateParams
    # The modern RSA extension may expose a legacy CSP key as RSACng on .NET Framework.
    # This certificate deliberately uses the SChannel CSP required by SQL Server, so read
    # its persisted CAPI metadata through PrivateKey instead of guessing from that wrapper.
    $privateKey = $certificate.PrivateKey
    try {
        if ($privateKey -isnot [System.Security.Cryptography.RSACryptoServiceProvider]) {
            throw 'Cannot read the expected SChannel CSP metadata from the new certificate.'
        }
        $keyInfo = $privateKey.CspKeyContainerInfo
        if (-not $keyInfo.MachineKeyStore -or $keyInfo.ProviderName -ne $certificateParams.Provider -or $keyInfo.KeyNumber -ne [System.Security.Cryptography.KeyNumber]::Exchange) {
            throw ('Unexpected key metadata: Provider={0}; MachineKeyStore={1}; KeyNumber={2}' -f $keyInfo.ProviderName, $keyInfo.MachineKeyStore, $keyInfo.KeyNumber)
        }
        $keyFile = Join-Path $env:ProgramData ('Microsoft\Crypto\RSA\MachineKeys\' + $keyInfo.UniqueKeyContainerName)
        if (-not (Test-Path -LiteralPath $keyFile -PathType Leaf)) { throw 'The persisted machine private-key file was not found. No ACL changed.' }
        $keyAcl = Get-Acl $keyFile
        $access = New-Object Security.AccessControl.FileSystemAccessRule($service.StartName, 'Read', 'Allow')
        $keyAcl.AddAccessRule($access)
        Set-Acl -Path $keyFile -AclObject $keyAcl
    } finally { if ($null -ne $privateKey) { $privateKey.Dispose() } }
    New-Item -ItemType Directory -Path $certificateFolder -Force | Out-Null
    $publicFile = Join-Path $certificateFolder ($certificate.Thumbprint + '.cer')
    Export-Certificate -Cert $certificate -FilePath $publicFile | Out-Null
    Import-Certificate -FilePath $publicFile -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null
    [pscustomobject]@{ Thumbprint = $certificate.Thumbprint; Instance = $InstanceName; CreatedAt = (Get-Date).ToUniversalTime().ToString('o') } |
        ConvertTo-Json | Set-Content -Path $recordPath -Encoding UTF8
} catch {
    if ($null -ne $certificate) {
        Remove-Item ("Cert:\LocalMachine\Root\" + $certificate.Thumbprint) -ErrorAction SilentlyContinue
        Remove-Item ("Cert:\LocalMachine\My\" + $certificate.Thumbprint) -DeleteKey -ErrorAction SilentlyContinue
    }
    if ($null -ne $publicFile -and (Test-Path $publicFile)) { Remove-Item $publicFile }
    if (Test-Path $recordPath) { Remove-Item $recordPath }
    throw
}
$certificate | Select-Object Subject, FriendlyName, Thumbprint, NotAfter
Write-Host "Public certificate and preparation record: $certificateFolder"
Write-Host 'Next: select this certificate in SQL Server Configuration Manager. Restart the SQL service only during an approved window.'
