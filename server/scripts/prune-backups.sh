#!/bin/bash
# 只读列出保留期外候选。删除由获批的外部备份管理流程执行。

set -Eeuo pipefail
umask 077

BACKUP_DIR="${BACKUP_DIR:-./backups}"
DB_NAME="${DB_NAME:-jewelry_db}"
: "${RETENTION_DAYS:?RETENTION_DAYS must be set}"
PRUNE_EXECUTE="${PRUNE_EXECUTE:-0}"
[[ "$PRUNE_EXECUTE" = "0" ]] || { echo 'PRUNE_EXECUTION_NOT_SUPPORTED' >&2; exit 1; }

fail() {
  echo "🚨 ERROR: $*" >&2
  exit 1
}

[[ "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]] || fail "DB_NAME 只允许字母、数字和下划线"
[[ "$RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]] || fail "RETENTION_DAYS 必须是正整数"
[[ -d "$BACKUP_DIR" ]] || fail "备份目录不存在"

latest_manifest=""
status_path="$BACKUP_DIR/.health/backup-status.env"
if [[ -f "$status_path" ]]; then
  latest_manifest=$(awk -F= '$1 == "LATEST_MANIFEST" { sub(/^[^=]*=/, ""); print; exit }' "$status_path")
fi

mapfile -d '' candidates < <(
  find "$BACKUP_DIR" -maxdepth 1 -type f -name "${DB_NAME}_*.sha256" -mtime +"$RETENTION_DAYS" -print0
)

if [[ "${#candidates[@]}" -eq 0 ]]; then
  echo "PRUNE_CANDIDATE_COUNT=0"
  exit 0
fi

prunable=()
for manifest_path in "${candidates[@]}"; do
  manifest_name=$(basename "$manifest_path")
  [[ "$manifest_name" = "$latest_manifest" ]] && continue
  awk '
    NF != 2 || $1 !~ /^[0-9a-fA-F]{64}$/ || $2 !~ /^[A-Za-z0-9][A-Za-z0-9_.-]*$/ { invalid = 1 }
    END { exit invalid ? 1 : 0 }
  ' "$manifest_path" || fail "候选清单格式不安全: $manifest_name"
  prunable+=("$manifest_path")
  echo "PRUNE_CANDIDATE=$manifest_name"
done

echo "PRUNE_CANDIDATE_COUNT=${#prunable[@]}"
echo "PRUNE_RESULT=READ_ONLY_CANDIDATES_REQUIRE_OFFSITE_AND_RETENTION_REVIEW"

