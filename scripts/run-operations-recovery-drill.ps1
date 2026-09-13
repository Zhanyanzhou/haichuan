[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$runId = ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString('x') + [Guid]::NewGuid().ToString('N').Substring(0, 6)).Substring(0, 16)
$resourcePrefix = "hc-ops-rehearsal-$runId"
$networkName = "$resourcePrefix-network"
$mysqlContainer = "$resourcePrefix-mysql"
$serverContainer = "$resourcePrefix-server"
$operationsImage = "$resourcePrefix-operations:local"
$serverImage = "$resourcePrefix-server:local"
$mysqlImage = 'mysql:8.0@sha256:7dcddc01f13bab2f15cde676d44d01f61fc9f99fe7785e86196dfc07d358ae2b'
$nodeImage = 'node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32'
$volumes = @{
  Database = "$resourcePrefix-db"
  Backups = "$resourcePrefix-backups"
  Uploads = "$resourcePrefix-uploads"
  PrivateMedia = "$resourcePrefix-private-media"
  RestoredUploads = "$resourcePrefix-restored-uploads"
  RestoredPrivateMedia = "$resourcePrefix-restored-private-media"
  RestoreEvidence = "$resourcePrefix-restore-evidence"
}
$sourceDatabase = ("hc_ops_rehearsal_source_" + $runId.Replace('-', '_'))
$restoreDatabase = ("hc_ops_rehearsal_restore_" + $runId.Replace('-', '_'))
$rootPassword = "Synthetic$([Guid]::NewGuid().ToString('N').Substring(0, 24))"
$adminUsername = "hcops_$($runId.Replace('-', '').Substring(0, 10))"
$adminPassword = "Ops$([Guid]::NewGuid().ToString('N').Substring(0, 10))!"
$syntheticMarker = "marker-$runId"
$createdContainers = [System.Collections.Generic.List[string]]::new()
$createdVolumes = [System.Collections.Generic.List[string]]::new()
$createdImages = [System.Collections.Generic.List[string]]::new()
$networkCreated = $false
$dockerAvailable = $false
$cleanupRemaining = -1
$report = $null
$executionError = $null

function Assert-OwnedName([string]$Name) {
  if (-not $Name.StartsWith($resourcePrefix, [StringComparison]::Ordinal)) {
    throw "Refusing resource outside task prefix: $Name"
  }
}

function Invoke-Docker {
  param(
    [Parameter(Mandatory)][string[]]$Arguments,
    [switch]$AllowFailure
  )
  $output = (& docker @Arguments 2>&1 | Out-String)
  $exitCode = $LASTEXITCODE
  if (-not $AllowFailure -and $exitCode -ne 0) {
    $safeOutput = $output.Replace($rootPassword, '[redacted-synthetic-secret]').Replace($adminPassword, '[redacted-synthetic-secret]').Trim()
    throw "docker exited $exitCode`: $safeOutput"
  }
  [pscustomobject]@{ ExitCode = $exitCode; Output = $output.Trim() }
}

function Get-Sha256([string]$Value) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
  $hash = [Security.Cryptography.SHA256]::HashData($bytes)
  [Convert]::ToHexString($hash).ToLowerInvariant()
}

function Wait-MySql {
  $deadline = [DateTimeOffset]::UtcNow.AddSeconds(120)
  $consecutive = 0
  while ([DateTimeOffset]::UtcNow -lt $deadline) {
    $probe = Invoke-Docker -AllowFailure -Arguments @(
      'exec', '-e', "MYSQL_PWD=$rootPassword", $mysqlContainer,
      'mysql', '-uroot', '--batch', '--skip-column-names', '-e', 'SELECT 1'
    )
    if ($probe.ExitCode -eq 0 -and $probe.Output.Trim() -eq '1') {
      $consecutive++
      if ($consecutive -ge 3) { return }
    } else {
      $consecutive = 0
    }
    Start-Sleep -Seconds 1
  }
  throw 'Synthetic MySQL did not become ready within 120 seconds'
}

function Invoke-MySql([string]$Sql, [string]$Database = '') {
  $arguments = @('exec', '-e', "MYSQL_PWD=$rootPassword", $mysqlContainer, 'mysql', '-uroot', '--batch', '--raw', '--skip-column-names')
  if ($Database) { $arguments += $Database }
  $arguments += @('-e', $Sql)
  (Invoke-Docker -Arguments $arguments).Output.Trim()
}

function Start-MySql {
  $result = Invoke-Docker -Arguments @(
    'run', '--detach', '--name', $mysqlContainer,
    '--network', $networkName, '--network-alias', 'mysql',
    '-e', "MYSQL_ROOT_PASSWORD=$rootPassword",
    '-v', "$($volumes.Database):/var/lib/mysql",
    $mysqlImage
  )
  if (-not $createdContainers.Contains($mysqlContainer)) { $createdContainers.Add($mysqlContainer) }
  if (-not $result.Output) { throw 'MySQL container id missing' }
  Wait-MySql
}

function Remove-OwnedContainer([string]$Name) {
  Assert-OwnedName $Name
  [void](Invoke-Docker -AllowFailure -Arguments @('rm', '--force', '--volumes', $Name))
}

function Get-VolumeFileSha([string]$Volume, [string]$Path) {
  Assert-OwnedName $Volume
  $result = Invoke-Docker -Arguments @(
    'run', '--rm', '--network', 'none', '-v', "$Volume`:/data:ro", $nodeImage,
    'sh', '-lc', "sha256sum '/data/$Path' | awk '{print `$1}'"
  )
  if ($result.Output -notmatch '^[a-f0-9]{64}$') { throw "Invalid volume file hash for $Volume/$Path" }
  $result.Output
}

function Probe-Server {
  foreach ($path in @('/api/health', '/api/ready')) {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(90)
    $last = $null
    while ([DateTimeOffset]::UtcNow -lt $deadline) {
      $last = Invoke-Docker -AllowFailure -Arguments @(
        'run', '--rm', '--network', $networkName, $nodeImage,
        'wget', '-qO-', "http://server:3000$path"
      )
      if ($last.ExitCode -eq 0 -and $last.Output -match '"code"\s*:\s*200') { break }
      Start-Sleep -Seconds 1
    }
    if ($last.ExitCode -ne 0 -or $last.Output -notmatch '"code"\s*:\s*200') {
      $logs = (Invoke-Docker -AllowFailure -Arguments @('logs', '--tail', '80', $serverContainer)).Output
      $safeLogs = $logs.Replace($rootPassword, '[redacted-synthetic-secret]').Replace($adminPassword, '[redacted-synthetic-secret]')
      throw "Server probe failed: $path; synthetic container logs: $safeLogs"
    }
  }
}

function Probe-AdminLogin {
  $script = @'
fetch("http://server:3000/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    username: process.env.HC_LOGIN_USERNAME,
    password: process.env.HC_LOGIN_PASSWORD,
  }),
}).then(async (response) => {
  const body = await response.json().catch(() => null);
  if (
    response.status !== 201
    || body?.code !== 200
    || typeof body?.data?.accessToken !== "string"
    || body?.data?.user?.role !== "SUPER_ADMIN"
  ) process.exit(1);
  console.log("ADMIN_LOGIN_OK");
}).catch(() => process.exit(1));
'@
  $probe = Invoke-Docker -Arguments @(
    'run', '--rm', '--network', $networkName,
    '-e', "HC_LOGIN_USERNAME=$adminUsername",
    '-e', "HC_LOGIN_PASSWORD=$adminPassword",
    $nodeImage, 'node', '-e', $script
  )
  if ($probe.Output -ne 'ADMIN_LOGIN_OK') { throw 'Synthetic administrator login probe failed' }
}

function Start-Server {
  $databaseUrl = "mysql://root:$rootPassword@mysql:3306/$restoreDatabase"
  $result = Invoke-Docker -Arguments @(
    'run', '--detach', '--name', $serverContainer,
    '--network', $networkName, '--network-alias', 'server',
    '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=64m',
    '-e', 'NODE_ENV=production', '-e', 'HOST=0.0.0.0', '-e', 'PORT=3000',
    '-e', "DATABASE_URL=$databaseUrl",
    '-e', 'JWT_SECRET=synthetic-jwt-secret-for-local-recovery-only',
    '-e', 'CORS_ORIGIN=https://rehearsal.invalid',
    '-e', 'RELEASE_PROFILE=lead-generation',
    '-e', 'CUSTOMER_COMMERCE_ENABLED=false',
    '-e', 'CUSTOMER_QUOTATION_ORDERING_ENABLED=false',
    '-e', 'PARTNER_APPLICATIONS_WRITE_ENABLED=false',
    '-e', 'PAYMENT_GATEWAY_TRANSACTIONS_ENABLED=false',
    '-e', 'PAYMENT_GATEWAY_REFUNDS_ENABLED=false',
    '-e', 'NOTIFICATION_DELIVERY_ENABLED=false',
    '-e', 'PUBLIC_MEDIA_ROOT=/app/uploads',
    '-e', 'PAGE_MEDIA_ARCHIVE_ROOT=/app/private-media/page-assets-archive',
    '-e', 'PAYMENT_PROOF_MEDIA_ROOT=/app/private-media/payment-proofs',
    '-e', 'PRODUCT_MEDIA_ROOT=/app/private-media/products',
    '-v', "$($volumes.RestoredUploads):/app/uploads",
    '-v', "$($volumes.RestoredPrivateMedia):/app/private-media",
    $serverImage
  )
  if (-not $createdContainers.Contains($serverContainer)) { $createdContainers.Add($serverContainer) }
  if (-not $result.Output) { throw 'Server container id missing' }
  Probe-Server
}

try {
  Set-Location -LiteralPath $repositoryRoot
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker CLI is required' }
  $dockerAvailable = $true
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git CLI is required' }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required for migration bundle hashing' }

  $gitOutput = (& git -C $repositoryRoot rev-parse HEAD 2>&1 | Out-String).Trim()
  $gitExitCode = $LASTEXITCODE
  if ($gitExitCode -ne 0 -or $gitOutput -notmatch '^[a-f0-9]{40}$') { throw 'Unable to resolve current Git SHA' }
  $gitSha = $gitOutput
  $migrationOutput = (& node (Join-Path $repositoryRoot 'scripts/verify-migration-integrity.mjs') --print-bundle-sha 2>&1 | Out-String).Trim()
  $migrationExitCode = $LASTEXITCODE
  if ($migrationExitCode -ne 0 -or $migrationOutput -notmatch '^[a-f0-9]{64}$') {
    throw "Unable to calculate migration bundle SHA-256: $migrationOutput"
  }
  $migrationBundleSha = $migrationOutput

  Write-Host "[$resourcePrefix] building Node 22 operations and server images"
  foreach ($build in @(
    @{ Target = 'operations'; Tag = $operationsImage },
    @{ Target = ''; Tag = $serverImage }
  )) {
    $arguments = @(
      'build', '--quiet',
      '--build-arg', "BUILD_REVISION=$gitSha",
      '--build-arg', 'BUILD_SOURCE=https://github.com/local/haichuan-rehearsal',
      '--build-arg', "MIGRATION_BUNDLE_SHA256=$migrationBundleSha",
      '--tag', $build.Tag,
      '--file', 'server/Dockerfile'
    )
    if ($build.Target) { $arguments += @('--target', $build.Target) }
    $arguments += 'server'
    [void](Invoke-Docker -Arguments $arguments)
    $createdImages.Add($build.Tag)
  }
  [void](Invoke-Docker -Arguments @(
    'run', '--rm', '--network', 'none', '--entrypoint', '/bin/bash', $operationsImage, '-lc',
    'set -eu; for executable in /usr/local/bin/backup.sh /usr/local/bin/check-backup-health.sh /usr/local/bin/restore.sh /usr/local/bin/restore-drill.sh /usr/local/bin/prune-backups.sh; do test "$(stat -c "%U:%G:%a" "$executable")" = root:root:555; bash -n "$executable"; done; command -v mysql >/dev/null; command -v mysqldump >/dev/null; command -v mysqladmin >/dev/null; command -v sha256sum >/dev/null; command -v tar >/dev/null; command -v gzip >/dev/null'
  ))

  [void](Invoke-Docker -Arguments @('network', 'create', $networkName))
  $networkCreated = $true
  foreach ($volume in $volumes.Values) {
    Assert-OwnedName $volume
    [void](Invoke-Docker -Arguments @('volume', 'create', $volume))
    $createdVolumes.Add($volume)
  }

  [void](Invoke-Docker -Arguments @(
    'run', '--rm', '--network', 'none',
    '-v', "$($volumes.Backups):/backups",
    '-v', "$($volumes.Uploads):/media/uploads",
    '-v', "$($volumes.PrivateMedia):/media/private-media",
    '-v', "$($volumes.RestoredUploads):/restore/uploads",
    '-v', "$($volumes.RestoredPrivateMedia):/restore/private-media",
    '-v', "$($volumes.RestoreEvidence):/restore/evidence",
    $nodeImage, 'sh', '-lc',
    "chown -R 1000:1000 /backups /media/uploads /media/private-media /restore/uploads /restore/private-media /restore/evidence; printf '%s' '$syntheticMarker-upload' > /media/uploads/sentinel.txt; printf '%s' '$syntheticMarker-private' > /media/private-media/sentinel.txt; chown 1000:1000 /media/uploads/sentinel.txt /media/private-media/sentinel.txt"
  ))
  $sourceUploadSha = Get-VolumeFileSha $volumes.Uploads 'sentinel.txt'
  $sourcePrivateSha = Get-VolumeFileSha $volumes.PrivateMedia 'sentinel.txt'

  Start-MySql
  Invoke-MySql "CREATE DATABASE ``$sourceDatabase`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE DATABASE ``$restoreDatabase`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  $sourceDatabaseUrl = "mysql://root:$rootPassword@mysql:3306/$sourceDatabase"
  [void](Invoke-Docker -Arguments @(
    'run', '--rm', '--network', $networkName,
    '-e', "DATABASE_URL=$sourceDatabaseUrl",
    $operationsImage, './node_modules/.bin/prisma', 'migrate', 'deploy'
  ))
  [void](Invoke-Docker -Arguments @(
    'run', '--rm', '--network', $networkName,
    '-e', "DATABASE_URL=$sourceDatabaseUrl",
    '-e', 'BOOTSTRAP_ADMIN_TARGET_CLASS=synthetic-test',
    '-e', "BOOTSTRAP_ADMIN_ENVIRONMENT_ID=synthetic-$resourcePrefix",
    '-e', "BOOTSTRAP_ADMIN_EXPECTED_DATABASE=$sourceDatabase",
    '-e', "BOOTSTRAP_ADMIN_APPROVAL_REFERENCE=synthetic-rehearsal-$runId",
    '-e', "BOOTSTRAP_ADMIN_USERNAME=$adminUsername",
    '-e', "BOOTSTRAP_ADMIN_PASSWORD=$adminPassword",
    '-e', 'BOOTSTRAP_ADMIN_REAL_NAME=Local Recovery Rehearsal',
    $operationsImage, 'node', 'dist/cli/bootstrap-admin.js'
  ))
  Invoke-MySql "CREATE TABLE operations_rehearsal_sentinel (id INT PRIMARY KEY, marker VARCHAR(128) NOT NULL); INSERT INTO operations_rehearsal_sentinel VALUES (1, '$syntheticMarker');" $sourceDatabase
  $sourceDbFact = Invoke-MySql "SELECT CONCAT(marker, ':', (SELECT COUNT(*) FROM users WHERE username = '$adminUsername' AND role = 'SUPER_ADMIN' AND status = 'ACTIVE')) FROM operations_rehearsal_sentinel WHERE id = 1;" $sourceDatabase
  $sourceDbSha = Get-Sha256 $sourceDbFact

  Write-Host "[$resourcePrefix] executing database and media backup"
  [void](Invoke-Docker -Arguments @(
    'run', '--rm', '--network', $networkName,
    '-e', 'DB_HOST=mysql', '-e', 'DB_PORT=3306', '-e', 'DB_USER=root',
    '-e', "DB_PASS=$rootPassword", '-e', "DB_NAME=$sourceDatabase",
    '-e', 'BACKUP_DIR=/backups', '-e', 'MEDIA_DIRS=/media/uploads:/media/private-media',
    '-e', 'MEDIA_PREFIX=hc_ops_media', '-e', 'BACKUP_DB_READY_TIMEOUT_SECONDS=60',
    '-e', 'BACKUP_INTERVAL_SECONDS=300', '-e', 'BACKUP_RPO_SECONDS=3600',
    '-e', 'BACKUP_CONSISTENCY_MODE=best-effort', '-e', 'RETENTION_DAYS=7', '-e', 'DISK_WARN_PCT=100',
    '-v', "$($volumes.Backups):/backups",
    '-v', "$($volumes.Uploads):/media/uploads:ro",
    '-v', "$($volumes.PrivateMedia):/media/private-media:ro",
    $operationsImage, '/bin/bash', '/usr/local/bin/backup.sh'
  ))
  $health = Invoke-Docker -Arguments @(
    'run', '--rm', '--network', 'none',
    '-e', 'BACKUP_DIR=/backups', '-e', 'BACKUP_INTERVAL_SECONDS=300', '-e', 'BACKUP_RPO_SECONDS=3600',
    '-v', "$($volumes.Backups):/backups:ro",
    $operationsImage, '/bin/bash', '/usr/local/bin/check-backup-health.sh'
  )
  if ($health.Output -notmatch 'LOCAL_BACKUP_HEALTHY') { throw 'Backup health did not report LOCAL_BACKUP_HEALTHY' }
  $manifest = (Invoke-Docker -Arguments @(
    'run', '--rm', '--network', 'none', '-v', "$($volumes.Backups):/backups:ro", $nodeImage,
    'sh', '-lc', ('set -- /backups/{0}_*.sha256; test "$#" -eq 1; test -f "$1"; basename "$1"' -f $sourceDatabase)
  )).Output.Trim()
  if ($manifest -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]*\.sha256$' -or $manifest.Contains("`n")) { throw 'Expected exactly one safe backup manifest' }
  $manifestSha = (Invoke-Docker -Arguments @(
    'run', '--rm', '--network', 'none', '-v', "$($volumes.Backups):/backups:ro", $nodeImage,
    'sh', '-lc', "sha256sum '/backups/$manifest' | awk '{print `$1}'"
  )).Output.Trim()

  Write-Host "[$resourcePrefix] restoring into isolated empty database and media volumes"
  $isolationEvidenceSha = Get-Sha256 "isolated:$resourcePrefix"
  [void](Invoke-Docker -Arguments @(
    'run', '--rm', '--network', $networkName,
    '--tmpfs', '/restore-drill:rw,noexec,nosuid,nodev,size=64m',
    '-e', 'DB_HOST=mysql', '-e', 'DB_PORT=3306', '-e', 'DB_USER=root',
    '-e', "DB_PASS=$rootPassword", '-e', "DB_NAME=$restoreDatabase",
    '-e', 'BACKUP_DIR=/backups', '-e', "RESTORE_MANIFEST=$manifest",
    '-e', 'RESTORE_DRILL_AUTHORIZED=1', '-e', "RESTORE_DRILL_ENVIRONMENT_ID=local-$resourcePrefix",
    '-e', "RESTORE_DRILL_APPROVAL_REFERENCE=local-authorized-rehearsal-$runId",
    '-e', "RESTORE_DRILL_EXPECTED_DATABASE=$restoreDatabase",
    '-e', 'RESTORE_DRILL_TARGET_CLASS=isolated-empty',
    '-e', "RESTORE_DRILL_CONFIRM=RESTORE_DRILL:$restoreDatabase",
    '-e', "RESTORE_DRILL_ISOLATION_EVIDENCE_SHA256=$isolationEvidenceSha",
    '-e', 'RESTORE_DRILL_ROOT=/restore-drill',
    '-e', 'MEDIA_TARGET_DIRS=/restore-drill/uploads:/restore-drill/private-media',
    '-e', 'RESTORE_EVIDENCE_DIR=/restore-drill/evidence',
    '-e', 'BACKUP_RPO_SECONDS=3600', '-e', 'RESTORE_RTO_SECONDS=600',
    '-v', "$($volumes.Backups):/backups:ro",
    '-v', "$($volumes.RestoredUploads):/restore-drill/uploads",
    '-v', "$($volumes.RestoredPrivateMedia):/restore-drill/private-media",
    '-v', "$($volumes.RestoreEvidence):/restore-drill/evidence",
    $operationsImage, '/bin/bash', '/usr/local/bin/restore-drill.sh'
  ))

  $restoredDbFact = Invoke-MySql "SELECT CONCAT(marker, ':', (SELECT COUNT(*) FROM users WHERE username = '$adminUsername' AND role = 'SUPER_ADMIN' AND status = 'ACTIVE')) FROM operations_rehearsal_sentinel WHERE id = 1;" $restoreDatabase
  $restoredDbSha = Get-Sha256 $restoredDbFact
  $restoredUploadSha = Get-VolumeFileSha $volumes.RestoredUploads 'sentinel.txt'
  $restoredPrivateSha = Get-VolumeFileSha $volumes.RestoredPrivateMedia 'sentinel.txt'
  if ($restoredDbSha -ne $sourceDbSha -or $restoredUploadSha -ne $sourceUploadSha -or $restoredPrivateSha -ne $sourcePrivateSha) {
    throw 'Restored database or media fingerprint mismatch'
  }

  Write-Host "[$resourcePrefix] recreating database and application containers"
  Remove-OwnedContainer $mysqlContainer
  Start-MySql
  $recreatedDbFact = Invoke-MySql "SELECT CONCAT(marker, ':', (SELECT COUNT(*) FROM users WHERE username = '$adminUsername' AND role = 'SUPER_ADMIN' AND status = 'ACTIVE')) FROM operations_rehearsal_sentinel WHERE id = 1;" $restoreDatabase
  $recreatedDbSha = Get-Sha256 $recreatedDbFact
  if ($recreatedDbSha -ne $sourceDbSha) { throw 'Database fingerprint changed after MySQL container recreation' }

  Start-Server
  Remove-OwnedContainer $serverContainer
  Start-Server
  Probe-AdminLogin
  $recreatedUploadSha = Get-VolumeFileSha $volumes.RestoredUploads 'sentinel.txt'
  $recreatedPrivateSha = Get-VolumeFileSha $volumes.RestoredPrivateMedia 'sentinel.txt'
  if ($recreatedUploadSha -ne $sourceUploadSha -or $recreatedPrivateSha -ne $sourcePrivateSha) {
    throw 'Media fingerprint changed after remount into recreated service container'
  }

  $restoreEvidence = (Invoke-Docker -Arguments @(
    'run', '--rm', '--network', 'none', '-v', "$($volumes.RestoreEvidence):/evidence:ro", $nodeImage,
    'sh', '-lc', 'set -eu; set -- /evidence/restore-drill-*.env; test "$#" -eq 1; test -f "$1"; grep -E "^(RESTORE_RESULT|DATABASE_MEDIA_RESTORE_SECONDS|BUSINESS_RTO_SECONDS|BUSINESS_RTO_MET|BACKUP_AGE_SECONDS|RPO_SECONDS|RESTORE_MANIFEST_SHA256)=" "$1"'
  )).Output
  if ($restoreEvidence -notmatch 'RESTORE_RESULT=SUCCESS' -or $restoreEvidence -notmatch 'BUSINESS_RTO_MET=UNVERIFIED') {
    throw 'Restore evidence did not preserve the expected success and RTO boundary'
  }
  $restoreEvidenceValues = @{}
  foreach ($line in ($restoreEvidence -split "`r?`n")) {
    if ($line -match '^([A-Z0-9_]+)=(.*)$') { $restoreEvidenceValues[$Matches[1]] = $Matches[2] }
  }
  foreach ($requiredKey in @('DATABASE_MEDIA_RESTORE_SECONDS', 'BUSINESS_RTO_SECONDS', 'BACKUP_AGE_SECONDS', 'RPO_SECONDS', 'RESTORE_MANIFEST_SHA256')) {
    if (-not $restoreEvidenceValues.ContainsKey($requiredKey)) { throw "Restore evidence is missing $requiredKey" }
  }
  foreach ($numericKey in @('DATABASE_MEDIA_RESTORE_SECONDS', 'BUSINESS_RTO_SECONDS', 'BACKUP_AGE_SECONDS', 'RPO_SECONDS')) {
    if ($restoreEvidenceValues[$numericKey] -notmatch '^[0-9]{1,9}$') { throw "Restore evidence has invalid $numericKey" }
  }
  if ($restoreEvidenceValues.RESTORE_MANIFEST_SHA256 -ne $manifestSha) {
    throw 'Restore evidence manifest SHA-256 does not match the rehearsed backup manifest'
  }

  $operationsImageId = (Invoke-Docker -Arguments @('image', 'inspect', $operationsImage, '--format', '{{.Id}}')).Output
  $revisionLabel = (Invoke-Docker -Arguments @('image', 'inspect', $operationsImage, '--format', '{{with .Config.Labels}}{{index . "org.opencontainers.image.revision"}}{{end}}')).Output
  $componentLabel = (Invoke-Docker -Arguments @('image', 'inspect', $operationsImage, '--format', '{{with .Config.Labels}}{{index . "io.haichuan.component"}}{{end}}')).Output
  $migrationLabel = (Invoke-Docker -Arguments @('image', 'inspect', $operationsImage, '--format', '{{with .Config.Labels}}{{index . "io.haichuan.migration-bundle-sha256"}}{{end}}')).Output
  if ($revisionLabel -ne $gitSha -or $componentLabel -ne 'operations' -or $migrationLabel -ne $migrationBundleSha) {
    throw 'Operations image identity labels do not match the rehearsal candidate'
  }

  $report = [ordered]@{
    result = 'passed'
    scope = 'local-isolated-synthetic-only'
    resourcePrefix = $resourcePrefix
    gitSha = $gitSha
    migrationBundleSha256 = $migrationBundleSha
    operationsImageId = $operationsImageId
    operationsLabelsVerified = $true
    operationsExecutablesVerified = $true
    backupHealth = 'LOCAL_BACKUP_HEALTHY'
    backupManifestSha256 = $manifestSha
    restoreResult = 'SUCCESS'
    databaseMediaRestoreSeconds = [int]$restoreEvidenceValues.DATABASE_MEDIA_RESTORE_SECONDS
    businessRtoSeconds = [int]$restoreEvidenceValues.BUSINESS_RTO_SECONDS
    businessRtoMet = 'UNVERIFIED'
    backupAgeSeconds = [int]$restoreEvidenceValues.BACKUP_AGE_SECONDS
    backupRpoSeconds = [int]$restoreEvidenceValues.RPO_SECONDS
    databaseFingerprint = $sourceDbSha
    restoredDatabaseFingerprint = $restoredDbSha
    recreatedDatabaseFingerprint = $recreatedDbSha
    uploadsFingerprint = $sourceUploadSha
    restoredUploadsFingerprint = $restoredUploadSha
    recreatedUploadsFingerprint = $recreatedUploadSha
    privateMediaFingerprint = $sourcePrivateSha
    restoredPrivateMediaFingerprint = $restoredPrivateSha
    recreatedPrivateMediaFingerprint = $recreatedPrivateSha
    healthReadyBeforeAndAfterServerRecreation = $true
    administratorLoginAfterRestore = $true
  }
}
catch {
  $executionError = $_
}
finally {
  Set-Location -LiteralPath $repositoryRoot
  if ($dockerAvailable) {
    foreach ($container in $createdContainers) {
      Assert-OwnedName $container
      [void](Invoke-Docker -AllowFailure -Arguments @('rm', '--force', '--volumes', $container))
    }
    foreach ($volume in $createdVolumes) {
      Assert-OwnedName $volume
      [void](Invoke-Docker -AllowFailure -Arguments @('volume', 'rm', $volume))
    }
    if ($networkCreated) {
      Assert-OwnedName $networkName
      [void](Invoke-Docker -AllowFailure -Arguments @('network', 'rm', $networkName))
    }
    foreach ($image in $createdImages) {
      Assert-OwnedName $image
      [void](Invoke-Docker -AllowFailure -Arguments @('image', 'rm', $image))
    }
    $remainingContainers = (Invoke-Docker -AllowFailure -Arguments @('ps', '--all', '--quiet', '--filter', "name=^/$resourcePrefix")).Output
    $remainingVolumes = (Invoke-Docker -AllowFailure -Arguments @('volume', 'ls', '--quiet', '--filter', "name=^$resourcePrefix")).Output
    $remainingNetworks = (Invoke-Docker -AllowFailure -Arguments @('network', 'ls', '--quiet', '--filter', "name=^$resourcePrefix")).Output
    $remainingImages = (Invoke-Docker -AllowFailure -Arguments @('image', 'ls', '--quiet', "$resourcePrefix*")).Output
    $cleanupRemaining = @($remainingContainers, $remainingVolumes, $remainingNetworks, $remainingImages).Where({ $_ }).Count
  } else {
    # Docker 可用性检查发生在创建任何资源之前；此分支没有可清理的 Docker 资源。
    $cleanupRemaining = 0
  }
  if ($null -ne $report) { $report['cleanupRemaining'] = $cleanupRemaining }
}

if ($cleanupRemaining -ne 0) {
  if ($null -ne $executionError) {
    throw "Local recovery drill failed and task resource cleanup is incomplete ($cleanupRemaining item(s)): $($executionError.Exception.Message)"
  }
  throw "Task resource cleanup incomplete: $cleanupRemaining item(s) remain"
}
if ($null -ne $executionError) { throw $executionError }
$report | ConvertTo-Json -Depth 4
