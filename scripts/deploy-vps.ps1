# One-command deploy to the VPS (27.254.173.60) over SSH key auth.
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-vps.ps1
# Builds locally, uploads a tarball (NOT .env / tenants.json - those already
# live on the VPS and are never overwritten), reinstalls deps only when
# package-lock.json changed, runs tenant migrations, restarts PM2 "crpayroll".
# Touches only C:\crpayroll and the PM2 process "crpayroll" on the VPS.
$ErrorActionPreference = "Stop"
$key = "$env:USERPROFILE\.ssh\vps_ed25519"
$h = "Administrator@27.254.173.60"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# next build and next dev share .next - stop a running dev server first.
if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
  throw "Port 3000 is in use locally (dev server?). Stop it before deploying - it shares the .next folder with the build."
}

npx next build
if ($LASTEXITCODE -ne 0) { throw "next build failed" }

$pkg = Join-Path $env:TEMP "crpayroll-deploy.tar.gz"
Remove-Item $pkg -ErrorAction SilentlyContinue
$items = @(".next", "src", "prisma", "scripts", "package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "postcss.config.mjs", "server.ts", "instrumentation.ts", "instrumentation-node.ts", "proxy.ts", "prisma7.config.ts", "next-env.d.ts", "tenants.example.json")
if (Test-Path public) { $items += "public" }
tar -czf $pkg --exclude=.next/dev --exclude=.next/cache @items

$oldLock = ssh -i $key -o BatchMode=yes $h "certutil -hashfile C:\crpayroll\package-lock.json SHA256" | Select-Object -Index 1
$newLock = (Get-FileHash package-lock.json -Algorithm SHA256).Hash.ToLower()
$depsChanged = ($oldLock -replace "\s", "") -ne $newLock

scp -i $key -o BatchMode=yes $pkg "${h}:C:/crpayroll/deploy.tar.gz"
ssh -i $key -o BatchMode=yes $h "cd /d C:\crpayroll && rmdir /s /q .next && tar -xzf deploy.tar.gz && del deploy.tar.gz"
if ($depsChanged) { ssh -i $key -o BatchMode=yes $h "cd /d C:\crpayroll && npm ci" }
ssh -i $key -o BatchMode=yes $h "cd /d C:\crpayroll && npm run migrate:tenants"
ssh -i $key -o BatchMode=yes $h "cd /d C:\crpayroll && pm2 restart crpayroll --update-env"
Start-Sleep 10
ssh -i $key -o BatchMode=yes $h "curl.exe -s -o NUL -w deployed:/login=%{http_code} --max-time 30 http://localhost:3000/login"
