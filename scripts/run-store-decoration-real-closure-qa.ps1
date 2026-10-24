[CmdletBinding()]
param(
  [ValidatePattern("^[0-9]{8}-[0-9]{2}$")]
  [string]$QaRunId = "20260901-05",

  [ValidateSet("Migrate", "SchemaPush")]
  [string]$DatabaseBootstrap = "Migrate"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$nodeVersion = (& node --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v22\.(\d+)\.(\d+)$') {
  throw "真实闭环 runner 要求 Node.js 22.12+，当前版本：$nodeVersion"
}
if ([int]$Matches[1] -lt 12) {
  throw "真实闭环 runner 要求 Node.js 22.12+，当前版本：$nodeVersion"
}
Write-Output "node_version=$nodeVersion"

$chromeExecutablePath = @(
  [Microsoft.Win32.Registry]::GetValue(
    "HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
    "",
    $null
  ),
  [Microsoft.Win32.Registry]::GetValue(
    "HKEY_LOCAL_MACHINE\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
    "",
    $null
  ),
  [Microsoft.Win32.Registry]::GetValue(
    "HKEY_LOCAL_MACHINE\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
    "",
    $null
  )
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $chromeExecutablePath) {
  throw "真实闭环 runner 未找到已安装的 Google Chrome"
}
$chromeFile = Get-Item -LiteralPath $chromeExecutablePath
if ($chromeFile.VersionInfo.ProductName -ne "Google Chrome") {
  throw "真实闭环 runner 要求 Google Chrome，实际产品：$($chromeFile.VersionInfo.ProductName)"
}
$chromeVersion = $chromeFile.VersionInfo.ProductVersion
Write-Output "chrome_version=$chromeVersion"
Write-Output "chrome_executable=$chromeExecutablePath"

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
$bootstrapClientImage = "$qaPrefix-client-bootstrap:local"
$clientImage = "$qaPrefix-client:local"
$edgeContainer = "$qaPrefix-edge"
# 与 client/Dockerfile 第 46 行的 nginx 基础镜像同摘要；边缘代理只做反向代理，
# 复用同一镜像可避免引入新的工具供应链条目。
$edgeImage = "nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10"
# 浏览器与服务端 CORS 绑定的来源始终是回环 5175；5175 由边缘代理持有，
# 隔离 React/Nginx 回源改挂 5195，只用于失败时的直连排查。
$edgeProxyHostPort = 5175
$clientOriginHostPort = 5195
$mysqlImage = "mysql:8.0@sha256:7dcddc01f13bab2f15cde676d44d01f61fc9f99fe7785e86196dfc07d358ae2b"
$playwrightOutputDirectory = [IO.Path]::GetFullPath(
  (Join-Path $PSScriptRoot "..\acceptance-artifacts\$qaPrefix-real-closure")
)
# 边缘代理配置写在验收产物目录下；它必须在 $playwrightOutputDirectory 之后求值。
$edgeConfPath = Join-Path $playwrightOutputDirectory "qa-edge-proxy.conf"
$phase1OutputDirectory = Join-Path $playwrightOutputDirectory "phase-1"
$phase2OutputDirectory = Join-Path $playwrightOutputDirectory "phase-2"
$phase1Cases = @(
  [ordered]@{
    key = "template-publication"
    grep = "\[phase1\] 真实网站完成 1920×240"
  },
  # 英文退役之后，"真实双语页面中文发布 / 英文 V1 / V2" 三条用例已改为
  # test.skip（D.35 历史用例，只保留反序列化），继续 grep 它们会让 Playwright
  # 因"无匹配用例"直接非零退出。这里换成同批真实存在、且覆盖退役语种失败关闭
  # 契约的用例：它断言 locale=en 的写入按 CONTENT_LOCALE_RETIRED 拒绝、公开读取
  # 按 CONTENT_LOCALE_UNAVAILABLE 拒绝，同时历史英文内容仍可被后台读取。
  [ordered]@{
    key = "retired-locale-fail-closed"
    grep = "\[phase1\] 英文退役后公开读取与新增写入均失败关闭"
  },
  # 六画幅真实往返（含"随内容增长"自动高度画布）。这条不是上面任何用例的附属项：
  # 自动高度画布是 P0（画布塌成 0px、整块内容看不见）在真实链路里的唯一路径，
  # 放在最后一条，前面用例通过后它失败时失败原因不会被误读成发布链路问题。
  [ordered]@{
    key = "acceptance-canvas-set"
    grep = "真实网站从零创建并往返加载六种画布模板"
  },
  # 七块首发母版（M1～M7）的真实闭环：保存草稿、发布不可变版本、插入页面、
  # 页面发布、公开 Renderer 读回。此前这条链路只有内存与 Mock 覆盖。
  # 放在六画幅用例之后：它依赖同一套发布与媒体授权链路，单独失败时不会被误读成
  # 发布链路本身的问题。
  [ordered]@{
    key = "launch-masters"
    grep = "七块首发母版经真实保存、发布、页面插入后由公开 Renderer 读回"
  }
)
$handoffPath = Join-Path $playwrightOutputDirectory "phase-handoff.json"
$clientBuildContext = Join-Path $playwrightOutputDirectory ".client-build-context"
$seoInputPath = Join-Path $playwrightOutputDirectory "public-seo-snapshot-input.json"
$seoSnapshotPath = Join-Path $clientBuildContext ".release-seo\public-seo-snapshot.json"
$seoRoutesPath = Join-Path $clientBuildContext ".release-seo\public-seo-routes.conf"
$seoPolicyPath = Join-Path $clientBuildContext ".release-seo\public-seo-policy.conf"
$seoOriginRedirectPath = Join-Path $clientBuildContext ".release-seo\public-origin-redirect.conf"
$seoOriginHostPath = Join-Path $clientBuildContext ".release-seo\public-origin-host.conf"
$seoOrigin = "https://qa-isolated.example.invalid"

function Assert-ExternalSuccess([string]$label) {
  if ($LASTEXITCODE -ne 0) {
    throw "$label 失败，退出码 $LASTEXITCODE"
  }
}

function Test-DockerObject([ValidateSet("container", "network", "volume", "image")][string]$kind, [string]$name) {
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    # Windows PowerShell 5 会把 Docker 对“不存在”的正常 stderr 提升为错误记录；
    # 这里只读取存在性，按进程退出码判断，不能让负向探测提前终止 runner。
    $ErrorActionPreference = "Continue"
    & docker $kind inspect $name 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
}

function Assert-ResourceAbsent([ValidateSet("container", "network", "volume", "image")][string]$kind, [string]$name) {
  if (Test-DockerObject $kind $name) {
    throw "拒绝复用已有 Docker $kind：$name"
  }
}

function New-RandomHex([int]$bytes) {
  $buffer = New-Object byte[] $bytes
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($buffer)
  } finally {
    $generator.Dispose()
  }
  return (($buffer | ForEach-Object { $_.ToString("x2") }) -join "")
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

function Get-Sha256([string]$path) {
  return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
}

# client/nginx.conf 的 8081 回源只服务 SEO snapshot 绑定的规范主机名
# （$hc_public_origin_host_allowed 守卫，违反即 421），而浏览器必须停在回环来源：
# 服务端非生产 CORS 只放行回环来源，上传摘要又依赖安全上下文的 crypto.subtle。
# 生产拓扑里这两件事由终止 TLS 的边缘代理同时满足——本 harness 一直缺这一跳，
# 回源只看到 Host: 127.0.0.1 而被 421 拒绝。此处补上：改写 Host 为规范名、
# 覆盖 X-Real-IP，并像生产里终止 TLS 的边缘一样声明 X-Forwarded-Proto=https，
# 回源到容器本身仍是明文 HTTP。
# 配置文本显式以 UTF-8 无 BOM 写盘，避免 Windows PowerShell 默认编码损坏中文注释。
function Write-EdgeProxyConf([string]$path) {
  $template = @'
map $http_upgrade $hc_qa_edge_connection {
  default upgrade;
  ""      close;
}

server {
  listen 8080;
  server_name _;

  # 与回源 client/nginx.conf 的 110m 对齐并留余量；上传体不能在这一跳被 413 拒绝。
  client_max_body_size 120m;

  location / {
    proxy_pass http://__CLIENT_ORIGIN__:8081;
    proxy_http_version 1.1;
    # 回源只认规范主机名，来访者自带的一切转发头都在此覆盖。
    proxy_set_header Host qa-isolated.example.invalid;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Forwarded "";
    proxy_set_header X-Forwarded-Host "";
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $hc_qa_edge_connection;
    # 页面发布与商品目录 SSE 必须实时到达，不能被代理缓冲滞留；上传体大，超时给足。
    proxy_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }
}
'@
  [IO.File]::WriteAllText(
    $path,
    $template.Replace("__CLIENT_ORIGIN__", $clientContainer),
    [Text.UTF8Encoding]::new($false)
  )
}

# 回源容器每次重建都会换 IP，而上游按容器名在启动时解析一次，
# 因此边缘代理必须与回源一起重建，不能只创建一次。
function Start-EdgeProxy([string]$rootLabel) {
  Remove-ExactContainer $edgeContainer
  Write-EdgeProxyConf $edgeConfPath
  & docker create `
    --name $edgeContainer `
    --network $networkName `
    --restart no `
    --label "io.haichuan.qa-scope=$qaPrefix" `
    -p "127.0.0.1:${edgeProxyHostPort}:8080" `
    $edgeImage
  Assert-ExternalSuccess "创建隔离 QA 边缘代理"
  & docker cp $edgeConfPath "$($edgeContainer):/etc/nginx/conf.d/default.conf"
  Assert-ExternalSuccess "写入隔离 QA 边缘代理配置"
  & docker start $edgeContainer | Out-Null
  Assert-ExternalSuccess "启动隔离 QA 边缘代理"
  Start-Sleep -Seconds 1
  $edgeRunning = (& docker inspect -f "{{.State.Running}}" $edgeContainer | Select-Object -First 1)
  if ($edgeRunning -ne "true") {
    # 配置写错时 Nginx 会立刻退出；提前暴露，避免等到 Wait-Http 超时才发现。
    & docker logs --tail 40 $edgeContainer
    throw "隔离 QA 边缘代理启动后立即退出，见上方日志"
  }
  Wait-Http "http://127.0.0.1:$edgeProxyHostPort/" $rootLabel
}

foreach ($port in 3101, $edgeProxyHostPort, $clientOriginHostPort) {
  $listenerCount = @(
    [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
      Where-Object { $_.Port -eq $port }
  ).Count
  if ($listenerCount -ne 0) {
    throw "端口 $port 已被占用，拒绝覆盖现有服务"
  }
}

foreach ($name in @($mysqlContainer, $migrationContainer, $bootstrapContainer, $serverContainer, $clientContainer, $edgeContainer)) {
  Assert-ResourceAbsent "container" $name
}
Assert-ResourceAbsent "network" $networkName
Assert-ResourceAbsent "volume" $volumeName
foreach ($name in @($serverBuildImage, $serverImage, $bootstrapClientImage, $clientImage)) {
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
$databaseName = "haichuan_store_qa"
$databaseUrl = "mysql://jewelry_user:$mysqlPassword@mysql:3306/$databaseName"
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
$appliedMigrations = ""
$expectedMigrations = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot "..\server\prisma\migrations") -Directory).Count
$remaining = @()
$phase1ExitCode = $null
$phase1Results = @()
$phase2ExitCode = $null
$restartCompleted = $false
$publicSeoPromotionCompleted = $false
$seoSnapshotHash = ""
$seoPrerenderManifestSha256 = ""
$seoSnapshotArtifactDigest = ""

try {
  Write-Output "qa_scope=$qaPrefix"
  Write-Output "existing jewelry-* containers are not targeted"
  New-Item -ItemType Directory -Path $playwrightOutputDirectory -Force | Out-Null

  $seoInput = [ordered]@{
    schemaVersion = 1
    # sourceStage 是"产出这份快照的环境"的来源声明，发布链路会拿它做交叉校验
    # （release-images.yml 的 PUBLIC_SEO_SOURCE_STAGE_MISMATCH、服务端
    # environmentId = public-seo-${sourceStage}）。隔离 QA 跑在 .invalid 域名上，
    # 不是生产环境，标 production 就是一次假的来源声明；标 preproduction 才是
    # 与事实相符的标签。contentReady 缺省为 true，因此下面必须至少有一条
    # published + indexable + human-reviewed 的真实路由。
    sourceStage = "preproduction"
    origin = $seoOrigin
    sourceSnapshotHashBefore = (("1" * 64) -join "")
    sourceSnapshotHashAfter = (("1" * 64) -join "")
    routes = @([ordered]@{
      path = "/about"
      canonicalPath = "/about"
      locale = "zh-CN"
      kind = "page"
      alternateKey = "page:about"
      published = $true
      indexable = $true
      contentSource = "human-reviewed"
      contentHashBefore = (("2" * 64) -join "")
      contentHashAfter = (("2" * 64) -join "")
      lastModified = "2026-09-13"
      siteName = "Haichuan isolated QA"
      title = "About Haichuan isolated QA"
      description = "Task-scoped immutable SEO input contract verification."
      shareImage = "https://qa-isolated.example.invalid/seo-share.jpg"
      renderedBodyHtml = "<main><h1>About Haichuan</h1><p>Task-scoped frozen QA content.</p></main>"
    })
  }
  [IO.File]::WriteAllText(
    $seoInputPath,
    ($seoInput | ConvertTo-Json -Depth 8),
    [Text.UTF8Encoding]::new($false)
  )
  New-Item -ItemType Directory -Path (Split-Path -Parent $seoSnapshotPath) -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $clientBuildContext ".release-seo\tools") -Force | Out-Null
  & node scripts/export-public-seo-snapshot.mjs --input $seoInputPath --output $seoSnapshotPath
  Assert-ExternalSuccess "生成隔离 QA 的不可变 SEO snapshot"

  $previousApiBase = $env:VITE_API_BASE_URL
  $previousSiteOrigin = $env:VITE_PUBLIC_SITE_ORIGIN
  $previousAnalytics = $env:VITE_ANALYTICS_ENABLED
  try {
    $env:VITE_API_BASE_URL = "/api"
    $env:VITE_PUBLIC_SITE_ORIGIN = $seoOrigin
    $env:VITE_ANALYTICS_ENABLED = "false"
    Push-Location client
    try {
      & npm run build
      Assert-ExternalSuccess "构建当前 React 客户端"
    } finally {
      Pop-Location
    }
  } finally {
    if ($null -eq $previousApiBase) { Remove-Item Env:VITE_API_BASE_URL -ErrorAction SilentlyContinue } else { $env:VITE_API_BASE_URL = $previousApiBase }
    if ($null -eq $previousSiteOrigin) { Remove-Item Env:VITE_PUBLIC_SITE_ORIGIN -ErrorAction SilentlyContinue } else { $env:VITE_PUBLIC_SITE_ORIGIN = $previousSiteOrigin }
    if ($null -eq $previousAnalytics) { Remove-Item Env:VITE_ANALYTICS_ENABLED -ErrorAction SilentlyContinue } else { $env:VITE_ANALYTICS_ENABLED = $previousAnalytics }
  }

  Copy-Item -LiteralPath "client\Dockerfile", "client\nginx.conf", "client\nginx-main.conf" -Destination $clientBuildContext
  Copy-Item -LiteralPath "client\dist" -Destination $clientBuildContext -Recurse
  Copy-Item -LiteralPath "scripts\export-public-seo-snapshot.mjs", "scripts\generate-public-seo-artifacts.mjs", "scripts\prerender-public-routes.mjs" `
    -Destination (Join-Path $clientBuildContext ".release-seo\tools")
  & node scripts/prerender-public-routes.mjs `
    --snapshot $seoSnapshotPath `
    --base-html (Join-Path $clientBuildContext "dist\index.html") `
    --out-dir (Join-Path $clientBuildContext "dist")
  Assert-ExternalSuccess "按冻结 snapshot 生成隔离 QA 预渲染清单"
  & node scripts/generate-public-seo-artifacts.mjs `
    --strict `
    --origin $seoOrigin `
    --manifest $seoSnapshotPath `
    --prerender-manifest (Join-Path $clientBuildContext "dist\prerendered-routes.json") `
    --out-dir (Join-Path $clientBuildContext "dist") `
    --nginx-map $seoRoutesPath `
    --nginx-policy $seoPolicyPath `
    --nginx-origin-redirect $seoOriginRedirectPath `
    --nginx-origin-host $seoOriginHostPath
  Assert-ExternalSuccess "生成隔离 QA SEO 与 Nginx 冻结制品"
  $seoSnapshotHash = (Get-Content -LiteralPath $seoSnapshotPath -Raw -Encoding utf8 | ConvertFrom-Json).snapshotHash
  $seoPrerenderManifestSha256 = Get-Sha256 (Join-Path $clientBuildContext "dist\prerendered-routes.json")
  $seoSnapshotArtifactDigest = "sha256:$(Get-Sha256 $seoSnapshotPath)"

  # client/Dockerfile 的 verify 与 stage-1 两层都把 PUBLIC_SEO_CONTENT_READY 与
  # PUBLIC_SEO_SOURCE_KIND 当必填门禁断言（第 27-28、62-63 行），release-images.yml
  # 从 seo-source 步骤取这两个值：无制品时 safe-fallback + contentReady=false。
  # 隔离 QA 不能走 safe-fallback：generate-public-seo-artifacts.mjs 在
  # contentReady=false 时会把 /、/products、/catalog 等全部公开路径改成
  # try_files /preproduction-not-ready.html，而 phase1 用例要在引导镜像上真实访问
  # /products 并断言已发布内容可见，整页替换会把它们全部挡住。
  # 两份快照都是 contentReady=true（引导快照至少一条 reviewed 路由，提升快照来自
  # 隔离环境真实发布的中文 /products），而合同里 contentReady=true 只与
  # approved-snapshot 配对——verify-release-images.mjs 对 safe-fallback 强制
  # contentReady=false 且 sourceArtifactId=0。本仓没有 CI 制品 id，被哈希冻结、
  # 按 digest 引用的快照文件本身就是这次构建引用的那份快照。
  & docker build `
    --tag $bootstrapClientImage `
    --label "io.haichuan.qa-scope=$qaPrefix" `
    --build-arg "VITE_API_BASE_URL=/api" `
    --build-arg "VITE_PUBLIC_SITE_ORIGIN=$seoOrigin" `
    --build-arg "VITE_ANALYTICS_ENABLED=false" `
    --build-arg "BUILD_REVISION=$buildRevision" `
    --build-arg "BUILD_SOURCE=$buildSource" `
    --build-arg "MIGRATION_BUNDLE_SHA256=$migrationBundleSha256" `
    --build-arg "PUBLIC_SEO_SNAPSHOT_HASH=$seoSnapshotHash" `
    --build-arg "PUBLIC_SEO_PRERENDER_MANIFEST_SHA256=$seoPrerenderManifestSha256" `
    --build-arg "PUBLIC_SEO_SNAPSHOT_ARTIFACT_DIGEST=$seoSnapshotArtifactDigest" `
    --build-arg "PUBLIC_SEO_CONTENT_READY=true" `
    --build-arg "PUBLIC_SEO_SOURCE_KIND=approved-snapshot" `
    $clientBuildContext
  Assert-ExternalSuccess "构建发布前 Node 22 client 镜像"

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
    -e "MYSQL_DATABASE=$databaseName" `
    -e "MYSQL_USER=jewelry_user" `
    -e "MYSQL_PASSWORD=$mysqlPassword" `
    -v "${volumeName}:/var/lib/mysql" `
    $mysqlImage `
    --default-authentication-plugin=mysql_native_password `
    --log-bin-trust-function-creators=1 `
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

    $appliedMigrations = (& docker exec `
      -e "MYSQL_PWD=$mysqlRootPassword" `
      $mysqlContainer `
      mysql --batch --skip-column-names -uroot $databaseName `
      --execute "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;").Trim()
    Assert-ExternalSuccess "读取隔离库 migration 计数"
    if ([int]$appliedMigrations -ne $expectedMigrations) {
      throw "隔离库 migration 计数不匹配：expected=$expectedMigrations actual=$appliedMigrations"
    }
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
    -e "BOOTSTRAP_ADMIN_TARGET_CLASS=synthetic-test" `
    -e "BOOTSTRAP_ADMIN_ENVIRONMENT_ID=synthetic-$qaPrefix" `
    -e "BOOTSTRAP_ADMIN_EXPECTED_DATABASE=$databaseName" `
    -e "BOOTSTRAP_ADMIN_APPROVAL_REFERENCE=synthetic-test-$QaRunId" `
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
    -p "127.0.0.1:${clientOriginHostPort}:8081" `
    $bootstrapClientImage
  Assert-ExternalSuccess "启动隔离 React/Nginx"
  Start-EdgeProxy "web_root"
  Wait-Http "http://127.0.0.1:$edgeProxyHostPort/api/ready" "web_proxy_ready"

  $env:PAGE_BUILDER_REAL_QA = "true"
  $env:PAGE_BUILDER_REAL_API_BASE_URL = "http://127.0.0.1:3101/api"
  $env:PLAYWRIGHT_BASE_URL = "http://127.0.0.1:5175"
  $env:PLAYWRIGHT_FORWARDED_PROTO = "https"
  $env:PLAYWRIGHT_BROWSER_CHANNEL = "chrome"
  $env:PLAYWRIGHT_BROWSER_EXECUTABLE_PATH = $chromeExecutablePath
  $env:PAGE_BUILDER_QA_USERNAME = $qaUsername
  $env:PAGE_BUILDER_QA_PASSWORD = $qaPassword
  $env:PAGE_BUILDER_QA_RUN_ID = $QaRunId
  $env:PAGE_BUILDER_QA_DATABASE_BOOTSTRAP = $DatabaseBootstrap
  $env:PAGE_BUILDER_QA_APPLIED_MIGRATIONS = [string]$appliedMigrations
  $env:PAGE_BUILDER_QA_HANDOFF_PATH = $handoffPath

  Push-Location client
  try {
    $env:PAGE_BUILDER_QA_PHASE = "phase1"
    foreach ($phase1Case in $phase1Cases) {
      $caseOutputDirectory = Join-Path $phase1OutputDirectory $phase1Case.key
      & npx playwright test tests/page-builder-real-closure.spec.ts `
        --workers=1 `
        --reporter=line `
        --grep $phase1Case.grep `
        --output $caseOutputDirectory
      $caseExitCode = $LASTEXITCODE
      $phase1Results += [ordered]@{
        key = $phase1Case.key
        grep = $phase1Case.grep
        exitCode = $caseExitCode
        output = $caseOutputDirectory
      }
      if ($caseExitCode -ne 0) {
        $phase1ExitCode = $caseExitCode
        throw "运行真实店铺装修 phase1/$($phase1Case.key) 失败，退出码 $caseExitCode"
      }
    }
    $phase1ExitCode = 0
  } finally {
    Pop-Location
  }

  if (-not (Test-Path -LiteralPath $handoffPath)) {
    throw "phase1 未生成重启交接清单：$handoffPath"
  }

  # 数据库发布不会修改已部署客户端的不可变路由表。这里用 phase1 真实发布出来的
  # 内容事实生成一份新快照和新客户端镜像，显式模拟受控的 snapshot export ->
  # release image -> digest rollout 激活链路。
  $handoff = Get-Content -LiteralPath $handoffPath -Raw -Encoding utf8 | ConvertFrom-Json
  if ($handoff.qaRunId -ne $QaRunId -or $handoff.pageKey -ne "products") {
    throw "phase1 发布快照交接事实无效"
  }
  # 旧版本这里读 $handoff.bilingualPublication：该字段只由已 test.skip 的历史双语
  # 用例写入（D.35 后新 QA 不再写入），所以那段校验永远不可能通过；它指向的
  # /about + /en/about 也随英文退役而失效。改为直接向隔离 API 读取 phase1 真实
  # 发布的 /products 公开文档——读到的是运行期事实，比读交接清单里的自述更强。
  # 全局 TransformInterceptor（server/src/main.ts）把所有响应包成
  # { code, data, message, timestamp, requestId }；公开文档在 .data 上，直接读
  # 信封的 status 恒为 $null，会让下面每个子句都恒真——必须先拆信封。
  $publishedEnvelope = Invoke-RestMethod -UseBasicParsing -Method Get `
    -Uri "http://127.0.0.1:3101/api/page-modules/document/published?pageKey=products&locale=zh-CN"
  $publishedDocument = $publishedEnvelope.data
  if ($null -eq $publishedDocument) {
    throw "隔离 API 未返回 /products 公开文档（envelope.code=$($publishedEnvelope.code)）：该 pageKey 未登记或该 locale 尚未发布"
  }
  # 逐子句收集，避免五种不同原因塌成同一句报错。
  $publishedProblems = [System.Collections.Generic.List[string]]::new()
  if ([string]$publishedDocument.status -ne "PUBLISHED") {
    $publishedProblems.Add("status=$([string]$publishedDocument.status) invalidReason=$([string]$publishedDocument.invalidReason)")
  }
  if ([string]$publishedDocument.contentHash -notmatch "^[0-9a-f]{64}$") {
    $publishedProblems.Add("contentHash=$([string]$publishedDocument.contentHash)")
  }
  if ([string]$publishedDocument.publishedAt -notmatch "^\d{4}-\d{2}-\d{2}T") {
    $publishedProblems.Add("publishedAt=$([string]$publishedDocument.publishedAt)")
  }
  if ([string]::IsNullOrWhiteSpace([string]$publishedDocument.metadata.seoTitle)) {
    $publishedProblems.Add("metadata.seoTitle=<空>")
  }
  if ([string]::IsNullOrWhiteSpace([string]$publishedDocument.metadata.seoDescription)) {
    $publishedProblems.Add("metadata.seoDescription=<空>")
  }
  if ($publishedProblems.Count -gt 0) {
    throw "无法从隔离 API 读到 phase1 真实发布的中文 /products 公开文档：$($publishedProblems -join '；')"
  }
  $sourceSnapshotHash = Get-Sha256 $handoffPath
  $productsTitle = [string]$publishedDocument.metadata.seoTitle
  $productsDescription = [string]$publishedDocument.metadata.seoDescription
  $productsTitleHtml = [Net.WebUtility]::HtmlEncode($productsTitle)
  $productsDescriptionHtml = [Net.WebUtility]::HtmlEncode($productsDescription)
  # 路由形状逐字段对齐生产投影 server/src/cli/public-seo-snapshot-source.ts：
  # products -> /products、kind=page、alternateKey=page:products，lastModified 取
  # 该 revision 的 publishedAt；renderedBodyHtml 在生产侧同样是生成的语义体
  # （semanticBody），不是整页 SSR。所有事实字段都来自上面读到的运行期发布结果。
  $promotedSeoInput = [ordered]@{
    schemaVersion = 1
    sourceStage = "preproduction"
    origin = $seoOrigin
    sourceSnapshotHashBefore = $sourceSnapshotHash
    sourceSnapshotHashAfter = $sourceSnapshotHash
    routes = @(
      [ordered]@{
        path = "/products"
        canonicalPath = "/products"
        locale = "zh-CN"
        kind = "page"
        alternateKey = "page:products"
        published = $true
        indexable = $true
        contentSource = "human-reviewed"
        contentHashBefore = [string]$publishedDocument.contentHash
        contentHashAfter = [string]$publishedDocument.contentHash
        lastModified = ([string]$publishedDocument.publishedAt).Substring(0, 10)
        siteName = "Haichuan isolated QA"
        title = $productsTitle
        description = $productsDescription
        shareImage = "https://qa-isolated.example.invalid/seo-share.jpg"
        renderedBodyHtml = "<main data-public-seo-projection=`"true`"><h1>$productsTitleHtml</h1><p>$productsDescriptionHtml</p></main>"
      }
    )
  }
  [IO.File]::WriteAllText(
    $seoInputPath,
    ($promotedSeoInput | ConvertTo-Json -Depth 8),
    [Text.UTF8Encoding]::new($false)
  )
  & node scripts/export-public-seo-snapshot.mjs --input $seoInputPath --output $seoSnapshotPath
  Assert-ExternalSuccess "冻结真实发布后的隔离 QA SEO snapshot"
  & node scripts/prerender-public-routes.mjs `
    --snapshot $seoSnapshotPath `
    --base-html (Join-Path $clientBuildContext "dist\index.html") `
    --out-dir (Join-Path $clientBuildContext "dist")
  Assert-ExternalSuccess "按真实发布 snapshot 生成预渲染清单"
  & node scripts/generate-public-seo-artifacts.mjs `
    --strict `
    --origin $seoOrigin `
    --manifest $seoSnapshotPath `
    --prerender-manifest (Join-Path $clientBuildContext "dist\prerendered-routes.json") `
    --out-dir (Join-Path $clientBuildContext "dist") `
    --nginx-map $seoRoutesPath `
    --nginx-policy $seoPolicyPath `
    --nginx-origin-redirect $seoOriginRedirectPath `
    --nginx-origin-host $seoOriginHostPath
  Assert-ExternalSuccess "生成真实发布后的 SEO 与 Nginx 冻结制品"
  $seoSnapshotHash = (Get-Content -LiteralPath $seoSnapshotPath -Raw -Encoding utf8 | ConvertFrom-Json).snapshotHash
  $seoPrerenderManifestSha256 = Get-Sha256 (Join-Path $clientBuildContext "dist\prerendered-routes.json")
  $seoSnapshotArtifactDigest = "sha256:$(Get-Sha256 $seoSnapshotPath)"

  # 与引导镜像同一组来源声明（理由见上面引导构建处的注释）：这份快照的路由来自
  # 隔离环境真实发布的中文 /products，contentReady 与 kind 的取值必须与镜像内
  # .release-seo/public-seo-snapshot.json 的 contentReady 保持一致。
  & docker build `
    --tag $clientImage `
    --label "io.haichuan.qa-scope=$qaPrefix" `
    --build-arg "VITE_API_BASE_URL=/api" `
    --build-arg "VITE_PUBLIC_SITE_ORIGIN=$seoOrigin" `
    --build-arg "VITE_ANALYTICS_ENABLED=false" `
    --build-arg "BUILD_REVISION=$buildRevision" `
    --build-arg "BUILD_SOURCE=$buildSource" `
    --build-arg "MIGRATION_BUNDLE_SHA256=$migrationBundleSha256" `
    --build-arg "PUBLIC_SEO_SNAPSHOT_HASH=$seoSnapshotHash" `
    --build-arg "PUBLIC_SEO_PRERENDER_MANIFEST_SHA256=$seoPrerenderManifestSha256" `
    --build-arg "PUBLIC_SEO_SNAPSHOT_ARTIFACT_DIGEST=$seoSnapshotArtifactDigest" `
    --build-arg "PUBLIC_SEO_CONTENT_READY=true" `
    --build-arg "PUBLIC_SEO_SOURCE_KIND=approved-snapshot" `
    $clientBuildContext
  Assert-ExternalSuccess "构建真实发布后的 Node 22 client 镜像"
  $publicSeoPromotionCompleted = $true

  & docker restart $mysqlContainer | Out-Null
  Assert-ExternalSuccess "重启隔离 MySQL"
  Wait-MySqlReady $mysqlContainer
  & docker restart $serverContainer | Out-Null
  Assert-ExternalSuccess "重启隔离 NestJS"
  Wait-Http "http://127.0.0.1:3101/api/health" "post_restart_api_health"
  Wait-Http "http://127.0.0.1:3101/api/ready" "post_restart_api_ready"
  Remove-ExactContainer $clientContainer
  & docker run -d `
    --name $clientContainer `
    --network $networkName `
    --restart no `
    --label "io.haichuan.qa-scope=$qaPrefix" `
    -p "127.0.0.1:${clientOriginHostPort}:8081" `
    $clientImage
  Assert-ExternalSuccess "以真实发布快照镜像替换隔离 React/Nginx"
  Start-EdgeProxy "post_restart_web_root"
  Wait-Http "http://127.0.0.1:$edgeProxyHostPort/api/ready" "post_restart_web_proxy_ready"
  $restartCompleted = $true

  Push-Location client
  try {
    $env:PAGE_BUILDER_QA_PHASE = "phase2"
    & npx playwright test tests/page-builder-real-closure.spec.ts `
      --workers=1 `
      --reporter=line `
      --grep "\[phase2\]" `
      --output $phase2OutputDirectory
    $phase2ExitCode = $LASTEXITCODE
    if ($phase2ExitCode -ne 0) {
      throw "运行真实店铺装修 phase2 失败，退出码 $phase2ExitCode"
    }
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
  foreach ($name in @($serverContainer, $clientContainer, $edgeContainer, $mysqlContainer)) {
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
  Remove-Item Env:PLAYWRIGHT_BROWSER_EXECUTABLE_PATH -ErrorAction SilentlyContinue
  Remove-Item Env:PAGE_BUILDER_QA_USERNAME -ErrorAction SilentlyContinue
  Remove-Item Env:PAGE_BUILDER_QA_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:PAGE_BUILDER_QA_RUN_ID -ErrorAction SilentlyContinue
  Remove-Item Env:PAGE_BUILDER_QA_DATABASE_BOOTSTRAP -ErrorAction SilentlyContinue
  Remove-Item Env:PAGE_BUILDER_QA_APPLIED_MIGRATIONS -ErrorAction SilentlyContinue
  Remove-Item Env:PAGE_BUILDER_QA_PHASE -ErrorAction SilentlyContinue
  Remove-Item Env:PAGE_BUILDER_QA_HANDOFF_PATH -ErrorAction SilentlyContinue

  foreach ($name in @($clientContainer, $edgeContainer, $serverContainer, $bootstrapContainer, $migrationContainer, $mysqlContainer)) {
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
  foreach ($name in @($clientImage, $bootstrapClientImage, $serverImage, $serverBuildImage)) {
    Remove-ExactImage $name
  }
  if (Test-Path -LiteralPath $clientBuildContext) {
    Remove-Item -LiteralPath $clientBuildContext -Recurse -Force
  }
  if (Test-Path -LiteralPath $seoInputPath) {
    Remove-Item -LiteralPath $seoInputPath -Force
  }

  $remaining = @()
  foreach ($name in @($mysqlContainer, $migrationContainer, $bootstrapContainer, $serverContainer, $clientContainer, $edgeContainer)) {
    if (Test-DockerObject "container" $name) { $remaining += "container:$name" }
  }
  if (Test-DockerObject "volume" $volumeName) { $remaining += "volume:$volumeName" }
  if (Test-DockerObject "network" $networkName) { $remaining += "network:$networkName" }
  foreach ($name in @($clientImage, $bootstrapClientImage, $serverImage, $serverBuildImage)) {
    if (Test-DockerObject "image" $name) { $remaining += "image:$name" }
  }
  Write-Output "cleanup_remaining=$($remaining.Count)"
  if ($remaining.Count -gt 0) {
    Write-Output ($remaining -join ",")
    $failed = $true
    if (-not $failureMessage) { $failureMessage = "一次性资源清理不完整" }
  }
}

if (Test-Path -LiteralPath $playwrightOutputDirectory) {
  $manifest = [ordered]@{
    qaRunId = $QaRunId
    result = if ($failed) { "FAIL" } else { "PASS" }
    phases = [ordered]@{
      phase1 = [ordered]@{
        grep = "\[phase1\]"
        testCount = $phase1Cases.Count
        exitCode = $phase1ExitCode
        cases = $phase1Results
      }
      restartCompleted = $restartCompleted
      publicSeoPromotionCompleted = $publicSeoPromotionCompleted
      phase2 = [ordered]@{ grep = "\[phase2\]"; exitCode = $phase2ExitCode }
    }
    project = "admin-chromium"
    nodeVersion = $nodeVersion
    browserChannel = "chrome"
    browserExecutable = $chromeExecutablePath
    browserVersion = $chromeVersion
    databaseBootstrap = $DatabaseBootstrap
    expectedMigrations = $expectedMigrations
    appliedMigrations = if ($appliedMigrations) { [int]$appliedMigrations } else { $null }
    publicSeo = [ordered]@{
      origin = $seoOrigin
      snapshotHash = $seoSnapshotHash
      prerenderManifestSha256 = $seoPrerenderManifestSha256
      sourceArtifactDigest = $seoSnapshotArtifactDigest
    }
    cleanupRemaining = $remaining.Count
    playwrightOutput = $playwrightOutputDirectory
  }
  [IO.File]::WriteAllText(
    (Join-Path $playwrightOutputDirectory "real-closure-manifest.json"),
    ($manifest | ConvertTo-Json -Depth 8),
    [Text.UTF8Encoding]::new($false)
  )
}

if ($failed) {
  Write-Error $failureMessage
  exit 1
}

exit 0
