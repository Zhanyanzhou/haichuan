[CmdletBinding()]
param(
  [ValidatePattern("^[0-9]{8}-[0-9]{2}$")]
  [string]$QaRunId = "20260901-05",

  [ValidateSet("Migrate", "SchemaPush")]
  [string]$DatabaseBootstrap = "Migrate"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$qaPrefix = "hc-store-closure-$QaRunId"
$networkName = "$qaPrefix-net"
$volumeName = "$qaPrefix-mysql-data"
$mysqlContainer = "$qaPrefix-mysql"
$migrationContainer = "$qaPrefix-migrate"
$bootstrapContainer = "$qaPrefix-bootstrap"
$serverContainer = "$qaPrefix-server"
$clientContainer = "$qaPrefix-client"
$serverBuildImage = "$qaPrefix-server-build:local"
$serverImage = "$qaPrefix-server:local"
$clientImage = "$qaPrefix-client:local"
$mysqlImage = "mysql:8.0@sha256:7dcddc01f13bab2f15cde676d44d01f61fc9f99fe7785e86196dfc07d358ae2b"
$playwrightOutputDirectory = [IO.Path]::GetFullPath(
  (Join-Path $PSScriptRoot "..\acceptance-artifacts\$qaPrefix-real-closure")
)

function Assert-ExternalSuccess([string]$label) {
  if ($LASTEXITCODE -ne 0) {
    throw "$label 失败，退出码 $LASTEXITCODE"
  }
}

function Test-DockerObject([ValidateSet("container", "network", "volume", "image")][string]$kind, [string]$name) {
  & docker $kind inspect $name *> $null
  return $LASTEXITCODE -eq 0
}

function Assert-ResourceAbsent([ValidateSet("container", "network", "volume", "image")][string]$kind, [string]$name) {
  if (Test-DockerObject $kind $name) {
    throw "拒绝复用已有 Docker $kind：$name"
  }
}

function New-RandomHex([int]$bytes) {
  return [Convert]::ToHexString(
    [Security.Cryptography.RandomNumberGenerator]::GetBytes($bytes)
  ).ToLowerInvariant()
}

function Wait-MySqlReady([string]$name, [int]$timeoutSeconds = 180) {
  $deadline = [DateTime]::UtcNow.AddSeconds($timeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    $probe = & docker exec $name sh -c 'if mysqladmin ping --protocol=tcp -h 127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" --silent >/dev/null 2>&1; then printf READY; else printf WAIT; fi'
    if ($probe -eq "READY") {
      Write-Output "$name mysqladmin=ready"
      return
    }
    Start-Sleep -Seconds 2
  }
  & docker logs --tail 120 $name
  throw "$name 未在 ${timeoutSeconds}s 内通过 mysqladmin ping"
}

function Wait-Http([string]$url, [string]$label, [int]$timeoutSeconds = 180) {
  $deadline = [DateTime]::UtcNow.AddSeconds($timeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    try {
      # 生产 Nginx 只在 TLS 代理已经声明 https 时提供页面；隔离 QA 没有额外启动
      # TLS 终止层，因此显式模拟代理头，避免把预期的 308 误判为服务未就绪。
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 -Headers @{ "X-Forwarded-Proto" = "https" }
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
        Write-Output "$label status=$($response.StatusCode)"
        return
      }
    } catch {
      # 服务启动期间的连接拒绝和 5xx 由下一轮探测继续观察。
    }
    Start-Sleep -Seconds 2
  }
  throw "$label 未在 ${timeoutSeconds}s 内就绪：$url"
}

function Remove-ExactContainer([string]$name) {
  if (Test-DockerObject "container" $name) {
    & docker rm -f $name | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Warning "未能删除容器 $name" }
  }
}

function Remove-ExactImage([string]$name) {
  if (Test-DockerObject "image" $name) {
    & docker image rm $name | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Warning "未能删除镜像 $name" }
  }
}

foreach ($port in 3101, 5175) {
  if (@(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue).Count -ne 0) {
    throw "端口 $port 已被占用，拒绝覆盖现有服务"
  }
}

foreach ($name in @($mysqlContainer, $migrationContainer, $bootstrapContainer, $serverContainer, $clientContainer)) {
  Assert-ResourceAbsent "container" $name
}
Assert-ResourceAbsent "network" $networkName
Assert-ResourceAbsent "volume" $volumeName
foreach ($name in @($serverBuildImage, $serverImage, $clientImage)) {
  Assert-ResourceAbsent "image" $name
}
if (Test-Path -LiteralPath $playwrightOutputDirectory) {
  throw "拒绝覆盖已有 Playwright 验收证据：$playwrightOutputDirectory"
}

$mysqlRootPassword = "r" + (New-RandomHex 16)
$mysqlPassword = "m" + (New-RandomHex 16)
$jwtSecret = New-RandomHex 32
$qaUsername = "qa_store_" + (New-RandomHex 4)
$qaPassword = "Qa" + (New-RandomHex 7)
$databaseUrl = "mysql://jewelry_user:$mysqlPassword@mysql:3306/jewelry_db"
$buildRevision = (& git rev-parse HEAD).Trim()
Assert-ExternalSuccess "读取当前 Git revision"
$buildSource = "local-qa://$qaPrefix"
$migrationBundleSha256 = (& node scripts/verify-migration-integrity.mjs --print-bundle-sha).Trim()
Assert-ExternalSuccess "核对 migration bundle"
if ($migrationBundleSha256 -notmatch "^[0-9a-f]{64}$") {
  throw "migration bundle SHA256 格式无效"
}
$failed = $false
$failureMessage = ""

try {
  Write-Output "qa_scope=$qaPrefix"
  Write-Output "existing jewelry-* containers are not targeted"

  & docker build --target build --tag $serverBuildImage --label "io.haichuan.qa-scope=$qaPrefix" server
  Assert-ExternalSuccess "构建 Node 22 server migration 镜像"

  & docker build `
    --tag $serverImage `
    --label "io.haichuan.qa-scope=$qaPrefix" `
    --build-arg "BUILD_REVISION=$buildRevision" `
    --build-arg "BUILD_SOURCE=$buildSource" `
    --build-arg "MIGRATION_BUNDLE_SHA256=$migrationBundleSha256" `
    server
  Assert-ExternalSuccess "构建 Node 22 server 运行镜像"

  & docker build `
    --tag $clientImage `
    --label "io.haichuan.qa-scope=$qaPrefix" `
    --build-arg "VITE_API_BASE_URL=/api" `
    --build-arg "VITE_PUBLIC_SITE_ORIGIN=http://127.0.0.1:5175" `
    --build-arg "VITE_ANALYTICS_ENABLED=false" `
    --build-arg "BUILD_REVISION=$buildRevision" `
    --build-arg "BUILD_SOURCE=$buildSource" `
    --build-arg "MIGRATION_BUNDLE_SHA256=$migrationBundleSha256" `
    client
  Assert-ExternalSuccess "构建 Node 22 client 镜像"

  & docker network create --label "io.haichuan.qa-scope=$qaPrefix" $networkName
  Assert-ExternalSuccess "创建隔离网络"

  & docker volume create --label "io.haichuan.qa-scope=$qaPrefix" $volumeName
  Assert-ExternalSuccess "创建隔离 MySQL 卷"

  & docker run -d `
    --name $mysqlContainer `
    --network $networkName `
    --network-alias mysql `
    --restart no `
    --label "io.haichuan.qa-scope=$qaPrefix" `
    -e "MYSQL_ROOT_PASSWORD=$mysqlRootPassword" `
    -e "MYSQL_DATABASE=jewelry_db" `
    -e "MYSQL_USER=jewelry_user" `
    -e "MYSQL_PASSWORD=$mysqlPassword" `
    -v "${volumeName}:/var/lib/mysql" `
    $mysqlImage `
    --default-authentication-plugin=mysql_native_password `
    --character-set-server=utf8mb4 `
    --collation-server=utf8mb4_unicode_ci
  Assert-ExternalSuccess "启动隔离 MySQL"
  Wait-MySqlReady $mysqlContainer

  if ($DatabaseBootstrap -eq "Migrate") {
    & docker run --rm `
      --name $migrationContainer `
      --network $networkName `
      --label "io.haichuan.qa-scope=$qaPrefix" `
      -e "DATABASE_URL=$databaseUrl" `
      $serverBuildImage `
      npx prisma migrate deploy
    Assert-ExternalSuccess "对隔离库执行 prisma migrate deploy"

    & docker run --rm `
      --name $migrationContainer `
      --network $networkName `
      --label "io.haichuan.qa-scope=$qaPrefix" `
      -e "DATABASE_URL=$databaseUrl" `
      $serverBuildImage `
      npx prisma migrate status
    Assert-ExternalSuccess "核对隔离库 migration 状态"

    $appliedMigrations = (& docker exec $mysqlContainer sh -c 'mysql -N -uroot -p"$MYSQL_ROOT_PASSWORD" jewelry_db -e "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;"')
    Assert-ExternalSuccess "读取隔离库 migration 计数"
    Write-Output "database_bootstrap=migrate"
    Write-Output "applied_migrations=$appliedMigrations"
  } else {
    # 仅用于空白、一次性的隔离 QA 数据库。它验证真实 Nest/API/MySQL 写链路，
    # 不替代、掩盖或宣称通过 prisma migrate deploy 的生产迁移门禁。
    & docker run --rm `
      --name $migrationContainer `
      --network $networkName `
      --label "io.haichuan.qa-scope=$qaPrefix" `
      -e "DATABASE_URL=$databaseUrl" `
      $serverBuildImage `
      npx prisma db push --skip-generate --accept-data-loss
    Assert-ExternalSuccess "为一次性隔离 QA 库同步 Prisma schema"
    Write-Output "database_bootstrap=schema-push-non-production"
    Write-Output "migration_gate=NOT_RUN"
  }

  & docker run --rm `
    --name $bootstrapContainer `
    --network $networkName `
    --label "io.haichuan.qa-scope=$qaPrefix" `
    -e "DATABASE_URL=$databaseUrl" `
    -e "BOOTSTRAP_ADMIN_USERNAME=$qaUsername" `
    -e "BOOTSTRAP_ADMIN_PASSWORD=$qaPassword" `
    -e "BOOTSTRAP_ADMIN_REAL_NAME=店铺装修 QA" `
    $serverBuildImage `
    node dist/cli/bootstrap-admin.js
  Assert-ExternalSuccess "创建一次性 SUPER_ADMIN"

  & docker run -d `
    --name $serverContainer `
    --network $networkName `
    --network-alias server `
    --restart no `
    --label "io.haichuan.qa-scope=$qaPrefix" `
    -p "127.0.0.1:3101:3000" `
    -e "NODE_ENV=test" `
    -e "PORT=3000" `
    -e "HOST=0.0.0.0" `
    -e "DATABASE_URL=$databaseUrl" `
    -e "JWT_SECRET=$jwtSecret" `
    -e "CORS_ORIGIN=http://127.0.0.1:5175" `
    -e "SITE_BASE_URL=http://127.0.0.1:5175" `
    -e "RELEASE_PROFILE=lead-generation" `
    -e "CUSTOMER_COMMERCE_ENABLED=false" `
    -e "PARTNER_APPLICATIONS_WRITE_ENABLED=false" `
    -e "ANALYTICS_INGESTION_ENABLED=false" `
    -e "NOTIFICATION_DELIVERY_ENABLED=false" `
    -e "PAYMENT_GATEWAY_TRANSACTIONS_ENABLED=false" `
    -e "PAYMENT_GATEWAY_REFUNDS_ENABLED=false" `
    $serverBuildImage `
    node dist/main.js
  Assert-ExternalSuccess "启动隔离 NestJS"
  Wait-Http "http://127.0.0.1:3101/api/health" "api_health"
  Wait-Http "http://127.0.0.1:3101/api/ready" "api_ready"

  & docker run -d `
    --name $clientContainer `
    --network $networkName `
    --restart no `
    --label "io.haichuan.qa-scope=$qaPrefix" `
    -p "127.0.0.1:5175:8081" `
    $clientImage
  Assert-ExternalSuccess "启动隔离 React/Nginx"
  Wait-Http "http://127.0.0.1:5175/" "web_root"
  Wait-Http "http://127.0.0.1:5175/api/ready" "web_proxy_ready"

  $env:PAGE_BUILDER_REAL_QA = "true"
  $env:PAGE_BUILDER_REAL_API_BASE_URL = "http://127.0.0.1:3101/api"
  $env:PLAYWRIGHT_BASE_URL = "http://127.0.0.1:5175"
  $env:PLAYWRIGHT_FORWARDED_PROTO = "https"
  $env:PLAYWRIGHT_BROWSER_CHANNEL = "chrome"
  $env:PAGE_BUILDER_QA_USERNAME = $qaUsername
  $env:PAGE_BUILDER_QA_PASSWORD = $qaPassword

  Push-Location client
  try {
    & npx playwright test tests/page-builder-real-closure.spec.ts `
      --workers=1 `
      --reporter=line `
      --output $playwrightOutputDirectory
    Assert-ExternalSuccess "运行真实店铺装修 Playwright 闭环"
  } finally {
    Pop-Location
  }

  Write-Output "REAL_CLOSURE_RESULT=PASS"
  Write-Output "playwright_output=$playwrightOutputDirectory"
} catch {
  $failed = $true
  $failureMessage = $_.Exception.Message
  Write-Output "REAL_CLOSURE_RESULT=FAIL"
  Write-Output "failure=$failureMessage"
  foreach ($name in @($serverContainer, $clientContainer, $mysqlContainer)) {
    if (Test-DockerObject "container" $name) {
      Write-Output "--- $name logs ---"
      & docker logs --tail 160 $name
    }
  }
} finally {
  Remove-Item Env:PAGE_BUILDER_REAL_QA -ErrorAction SilentlyContinue
  Remove-Item Env:PAGE_BUILDER_REAL_API_BASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:PLAYWRIGHT_BASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:PLAYWRIGHT_FORWARDED_PROTO -ErrorAction SilentlyContinue
  Remove-Item Env:PLAYWRIGHT_BROWSER_CHANNEL -ErrorAction SilentlyContinue
  Remove-Item Env:PAGE_BUILDER_QA_USERNAME -ErrorAction SilentlyContinue
  Remove-Item Env:PAGE_BUILDER_QA_PASSWORD -ErrorAction SilentlyContinue

  foreach ($name in @($clientContainer, $serverContainer, $bootstrapContainer, $migrationContainer, $mysqlContainer)) {
    Remove-ExactContainer $name
  }
  if (Test-DockerObject "volume" $volumeName) {
    & docker volume rm $volumeName | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Warning "未能删除卷 $volumeName" }
  }
  if (Test-DockerObject "network" $networkName) {
    & docker network rm $networkName | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Warning "未能删除网络 $networkName" }
  }
  foreach ($name in @($clientImage, $serverImage, $serverBuildImage)) {
    Remove-ExactImage $name
  }

  $remaining = @()
  foreach ($name in @($mysqlContainer, $migrationContainer, $bootstrapContainer, $serverContainer, $clientContainer)) {
    if (Test-DockerObject "container" $name) { $remaining += "container:$name" }
  }
  if (Test-DockerObject "volume" $volumeName) { $remaining += "volume:$volumeName" }
  if (Test-DockerObject "network" $networkName) { $remaining += "network:$networkName" }
  foreach ($name in @($clientImage, $serverImage, $serverBuildImage)) {
    if (Test-DockerObject "image" $name) { $remaining += "image:$name" }
  }
  Write-Output "cleanup_remaining=$($remaining.Count)"
  if ($remaining.Count -gt 0) {
    Write-Output ($remaining -join ",")
    $failed = $true
    if (-not $failureMessage) { $failureMessage = "一次性资源清理不完整" }
  }
}

if ($failed) {
  Write-Error $failureMessage
  exit 1
}

exit 0
