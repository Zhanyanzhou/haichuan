[CmdletBinding()]
param(
  [string]$NodePath,
  [int]$ReadyTimeoutSeconds = 90
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$databaseName = "haichuan_ci_real_tests"
$databaseUser = "isolated_ci"
$mysqlImage = "mysql@sha256:7dcddc01f13bab2f15cde676d44d01f61fc9f99fe7785e86196dfc07d358ae2b"
$runId = [Guid]::NewGuid().ToString("N")
$containerName = "hc-validation-mysql-$($runId.Substring(0, 12))"
$ownerLabel = "com.haichuan.validation-run=$runId"
$databasePassword = "ci$([Guid]::NewGuid().ToString('N'))"
$rootPassword = "root$([Guid]::NewGuid().ToString('N'))"
$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$runnerPath = Join-Path $PSScriptRoot "run-real-mysql-tests.cjs"
$containerCreated = $false

function Resolve-Node22Path {
  param([string]$RequestedPath)

  $candidates = @()
  if ($RequestedPath) {
    $candidates += $RequestedPath
  } else {
    $currentNode = Get-Command node -ErrorAction SilentlyContinue
    if ($currentNode) { $candidates += $currentNode.Source }
    $fnmVersions = Join-Path $env:APPDATA "fnm\node-versions"
    if (Test-Path -LiteralPath $fnmVersions) {
      $candidates += Get-ChildItem -LiteralPath $fnmVersions -Directory -Filter "v22.*" |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName "installation\node.exe" }
    }
  }

  foreach ($candidate in $candidates | Select-Object -Unique) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
    $version = (& $candidate --version 2>$null).Trim()
    if ($LASTEXITCODE -eq 0 -and $version -match '^v22\.') {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }
  throw "NODE_22_NOT_FOUND: use -NodePath with an existing Windows Node 22 executable"
}

function Invoke-Docker {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  & docker @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "DOCKER_COMMAND_FAILED: docker $($Arguments[0])"
  }
}

$resolvedNode = Resolve-Node22Path $NodePath
$nodeVersion = (& $resolvedNode --version).Trim()

try {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "DOCKER_NOT_FOUND"
  }

  $null = Invoke-Docker run --detach `
    --name $containerName `
    --label $ownerLabel `
    --publish "127.0.0.1::3306" `
    --tmpfs "/var/lib/mysql:rw,noexec,nosuid,size=1073741824" `
    --env "MYSQL_DATABASE=$databaseName" `
    --env "MYSQL_USER=$databaseUser" `
    --env "MYSQL_PASSWORD=$databasePassword" `
    --env "MYSQL_ROOT_PASSWORD=$rootPassword" `
    $mysqlImage
  $containerCreated = $true

  $deadline = [DateTimeOffset]::UtcNow.AddSeconds($ReadyTimeoutSeconds)
  $ready = $false
  while ([DateTimeOffset]::UtcNow -lt $deadline) {
    $running = (& docker inspect --format "{{.State.Running}}" $containerName 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or $running -ne "true") {
      throw "DEDICATED_MYSQL_EXITED_BEFORE_READY"
    }
    & docker exec --env "MYSQL_PWD=$databasePassword" $containerName `
      mysqladmin --protocol=TCP --host=127.0.0.1 --user=$databaseUser ping --silent *> $null
    if ($LASTEXITCODE -eq 0) {
      $ready = $true
      break
    }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw "DEDICATED_MYSQL_AUTHENTICATED_PROBE_TIMEOUT" }

  $portLine = (& docker port $containerName "3306/tcp").Trim()
  if ($LASTEXITCODE -ne 0 -or $portLine -notmatch '127\.0\.0\.1:(\d+)$') {
    throw "DEDICATED_MYSQL_LOOPBACK_PORT_NOT_FOUND"
  }
  $hostPort = $Matches[1]

  $null = Invoke-Docker exec --env "MYSQL_PWD=$rootPassword" $containerName `
    mysql --protocol=TCP --host=127.0.0.1 --user=root `
    --execute "SET GLOBAL log_bin_trust_function_creators=ON;"
  $probe = (& docker exec --env "MYSQL_PWD=$databasePassword" $containerName `
    mysql --batch --skip-column-names --protocol=TCP --host=127.0.0.1 --user=$databaseUser `
    --database=$databaseName `
    --execute "SELECT DATABASE(), CURRENT_USER(), @@log_bin_trust_function_creators;").Trim()
  if ($LASTEXITCODE -ne 0 -or $probe -notmatch "^$databaseName\s+$databaseUser@%\s+1$") {
    throw "DEDICATED_MYSQL_CONNECTION_POLICY_PROBE_FAILED"
  }

  $escapedUser = [Uri]::EscapeDataString($databaseUser)
  $escapedPassword = [Uri]::EscapeDataString($databasePassword)
  $databaseUrl = "mysql://${escapedUser}:${escapedPassword}@127.0.0.1:${hostPort}/${databaseName}"
  $env:REAL_MYSQL_TEST_ISOLATED = "1"
  $env:REAL_MYSQL_TEST_DATABASE_URL = $databaseUrl

  Write-Output "LOCAL_REAL_MYSQL_READY: Windows; node=$nodeVersion; container=$containerName; host=127.0.0.1; port=$hostPort; database=$databaseName; storage=tmpfs"
  Push-Location $workspaceRoot
  try {
    & $resolvedNode $runnerPath
    if ($LASTEXITCODE -ne 0) { throw "REAL_MYSQL_TEST_RUN_FAILED" }
  } finally {
    Pop-Location
  }
} finally {
  if ($containerCreated) {
    $ownedContainer = & docker inspect $containerName 2>$null | ConvertFrom-Json
    $actualOwner = if ($LASTEXITCODE -eq 0 -and $ownedContainer) {
      $ownedContainer[0].Config.Labels.'com.haichuan.validation-run'
    } else {
      $null
    }
    if ($actualOwner -eq $runId) {
      & docker rm --force $containerName *> $null
      if ($LASTEXITCODE -eq 0) {
        Write-Output "LOCAL_REAL_MYSQL_CLEANUP_PASS: removed owned container $containerName"
      } else {
        Write-Warning "LOCAL_REAL_MYSQL_CLEANUP_FAILED: $containerName"
      }
    } else {
      Write-Warning "LOCAL_REAL_MYSQL_CLEANUP_REFUSED: ownership label mismatch for $containerName"
    }
  }
}
