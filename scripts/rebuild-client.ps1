# scripts/rebuild-client.ps1 — 重建 :80 验收栈的前端
# 用途：client 源码改动后，刷新 80 端口容器栈（镜像内 npm ci + vite build，宿主机无需依赖）。
# 拓扑（DECISIONS A.12）：:80 = 完整容器栈（验收用）；开发态前端在 5173（vite 热载）。
# 安全性：build 失败不会替换容器，旧容器继续服务；up 只换 client 一个服务。
# 用法：在仓库根目录执行  powershell -ExecutionPolicy Bypass -File scripts\rebuild-client.ps1

$ErrorActionPreference = "Stop"

function Get-ClientFingerprint {
  param([string]$Label)
  # index.html 引用的入口 chunk hash —— 与浏览器 DevTools Network 面板可直接对照
  $hash = docker exec jewelry-client sh -c "grep -oE 'index-[A-Za-z0-9_-]+\.js' /usr/share/nginx/html/index.html | head -1"
  if ($LASTEXITCODE -ne 0 -or -not $hash) { return "$Label 指纹获取失败（容器不可用？）" }
  return "$Label $hash"
}

Write-Host "== rebuild-client：重建 :80 验收栈前端 ==" -ForegroundColor Cyan

# 前置检查：docker 与目标容器
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw "Docker 不可用，无法构建" }
$existing = docker ps -a --filter name=jewelry-client --format "{{.Names}}"
if ($existing -ne "jewelry-client") { throw "容器 jewelry-client 不存在，请先 docker compose up -d" }

$oldFp = Get-ClientFingerprint -Label "[旧]"
Write-Host "$oldFp"

# 1) 镜像内构建（package-lock 未变时 npm ci 层命中缓存，全程约 1-3 分钟）
Write-Host "`n[1/3] docker compose build client ..." -ForegroundColor Yellow
docker compose build client
if ($LASTEXITCODE -ne 0) { throw "构建失败——旧容器继续服务，:80 未受影响" }

# 2) 换容器（秒级窗口，期间 :80 可能短暂 502）
Write-Host "`n[2/3] docker compose up -d client ..." -ForegroundColor Yellow
docker compose up -d client
if ($LASTEXITCODE -ne 0) { throw "容器替换失败——旧容器仍在，:80 可能需要手动 docker start jewelry-client" }

# 3) 健康检查（最多等 60 秒）
Write-Host "`n[3/3] 等待 :80 恢复 ..." -ForegroundColor Yellow
$ok = $false
foreach ($i in 1..12) {
  Start-Sleep -Seconds 5
  try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1/" -UseBasicParsing -TimeoutSec 5
    if ($resp.StatusCode -eq 200) { $ok = $true; break }
  } catch {}
}
if (-not $ok) { throw "80 端口 60 秒内未恢复 200——请 docker logs jewelry-client --tail 50 排查" }

$newFp = Get-ClientFingerprint -Label "[新]"
Write-Host ""
Write-Host "== 完成 ==" -ForegroundColor Green
Write-Host "$oldFp"
Write-Host "$newFp"
Write-Host "`n浏览器请硬刷新（Ctrl+F5）后再访问 http://127.0.0.1/ 验收新构建。"
