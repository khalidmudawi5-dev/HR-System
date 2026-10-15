#!/usr/bin/env bash
set -euo pipefail
cd /workspace/HR-System
source scripts/cloud-env.sh
mkdir -p /workspace/tooling
if [[ ! -x "$DOTNET_ROOT/dotnet" ]] || [[ "$("$DOTNET_ROOT/dotnet" --version)" != "10.0.402" ]]; then
  python3 - <<'PY'
import hashlib,json,pathlib,subprocess,tarfile
artifact=json.load(open('scripts/sdk-linux-x64.json'))
archive=pathlib.Path('/workspace/tooling/dotnet-sdk-10.0.402.tar.gz')
subprocess.run(['curl','--fail','--silent','--show-error','--location',artifact['url'],'--output',str(archive)],check=True)
digest=hashlib.sha512()
with archive.open('rb') as stream:
    for block in iter(lambda:stream.read(1024*1024),b''):digest.update(block)
if digest.hexdigest().lower()!=artifact['hash'].lower():raise SystemExit('SDK SHA512 verification failed')
destination=pathlib.Path('/workspace/tooling/dotnet');destination.mkdir(exist_ok=True)
with tarfile.open(archive) as package:package.extractall(destination,filter='data')
PY
fi
dotnet tool restore
dotnet restore HRPlatform.sln --locked-mode
dotnet build HRPlatform.sln --no-restore -m:2
( cd web && npm ci && npm run build )
mkdir -p src/HR.Api/wwwroot
cp -R web/dist/. src/HR.Api/wwwroot/
