#!/bin/bash
# 在已批准的隔离空库与空媒体目录上执行完整恢复，并生成不含凭据的阶段证据。
# 业务 RTO 还必须包含发现、目标准备、服务恢复与切流，由生产证据验证器统一裁决。

set -Eeuo pipefail
umask 077

: "${DB_PASS:?DB_PASS must be set}"
: "${DB_NAME:?DB_NAME must be set}"
: "${BACKUP_DIR:?BACKUP_DIR must be set}"
: "${RESTORE_MANIFEST:?RESTORE_MANIFEST must be set}"
: "${RESTORE_DRILL_AUTHORIZED:?RESTORE_DRILL_AUTHORIZED must be set to 1}"
: "${RESTORE_DRILL_ENVIRONMENT_ID:?RESTORE_DRILL_ENVIRONMENT_ID must be set}"
: "${RESTORE_DRILL_APPROVAL_REFERENCE:?RESTORE_DRILL_APPROVAL_REFERENCE must be set}"
: "${RESTORE_DRILL_EXPECTED_DATABASE:?RESTORE_DRILL_EXPECTED_DATABASE must be set}"
: "${RESTORE_DRILL_TARGET_CLASS:?RESTORE_DRILL_TARGET_CLASS must be set}"
: "${RESTORE_DRILL_CONFIRM:?RESTORE_DRILL_CONFIRM must be set}"
: "${RESTORE_DRILL_ISOLATION_EVIDENCE_SHA256:?RESTORE_DRILL_ISOLATION_EVIDENCE_SHA256 must be set}"
: "${RESTORE_DRILL_ROOT:?RESTORE_DRILL_ROOT must be set}"
: "${MEDIA_TARGET_DIRS:?MEDIA_TARGET_DIRS must contain isolated uploads and private-media directories}"
: "${BACKUP_RPO_SECONDS:?BACKUP_RPO_SECONDS must be set}"
: "${RESTORE_RTO_SECONDS:?RESTORE_RTO_SECONDS must be set}"
: "${RESTORE_EVIDENCE_DIR:?RESTORE_EVIDENCE_DIR must be set}"

fail() {
  echo "🚨 ERROR: $*" >&2
  exit 1
}

[[ "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]] || fail "DB_NAME 只允许字母、数字和下划线"
[[ "$RESTORE_MANIFEST" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*\.sha256$ ]] || fail "RESTORE_MANIFEST 不是安全文件名"
[[ "$RESTORE_DRILL_AUTHORIZED" = "1" ]] || fail "RESTORE_DRILL_AUTHORIZED 必须是 1"
[[ "$DB_NAME" = "$RESTORE_DRILL_EXPECTED_DATABASE" ]] || fail "目标数据库身份不匹配"
[[ "$RESTORE_DRILL_TARGET_CLASS" = "isolated-empty" ]] || fail "RESTORE_DRILL_TARGET_CLASS 必须是 isolated-empty"
[[ "$RESTORE_DRILL_CONFIRM" = "RESTORE_DRILL:$DB_NAME" ]] || fail "RESTORE_DRILL_CONFIRM 不匹配"
[[ "$RESTORE_DRILL_ISOLATION_EVIDENCE_SHA256" =~ ^[a-f0-9]{64}$ ]] || fail "隔离环境证据哈希无效"
[[ "${RESTORE_DATABASE_ONLY:-false}" = "false" ]] || fail "恢复演练禁止跳过媒体"
for numeric_name in BACKUP_RPO_SECONDS RESTORE_RTO_SECONDS; do
  numeric_value="${!numeric_name}"
  [[ "$numeric_value" =~ ^[1-9][0-9]{0,8}$ ]] || fail "${numeric_name} 必须是正整数"
done

[[ -d "$BACKUP_DIR" ]] || fail "备份目录不存在"
manifest_path="$BACKUP_DIR/$RESTORE_MANIFEST"
[[ -f "$manifest_path" ]] || fail "备份清单不存在"
awk '
  NF != 2 || $1 !~ /^[0-9a-fA-F]{64}$/ || $2 !~ /^[A-Za-z0-9][A-Za-z0-9_.-]*$/ { invalid = 1 }
  END { exit invalid ? 1 : 0 }
' "$manifest_path" || fail "备份清单格式不安全"
(cd "$BACKUP_DIR" && sha256sum -c -- "$RESTORE_MANIFEST" >/dev/null) || fail "备份清单或制品校验失败"

mapfile -t metadata_names < <(awk '$2 ~ /\.metadata\.env$/ { print $2 }' "$manifest_path")
[[ "${#metadata_names[@]}" -eq 1 ]] || fail "备份清单必须包含一个快照元数据文件"
metadata_path="$BACKUP_DIR/${metadata_names[0]}"
read_metadata() {
  awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$metadata_path"
}
[[ "$(read_metadata SCHEMA_VERSION)" = "1" ]] || fail "快照元数据版本无效"
snapshot_started_at=$(read_metadata SNAPSHOT_STARTED_AT_UTC)
[[ "$snapshot_started_at" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || fail "快照时间格式无效"
snapshot_epoch=$(date -u -d "$snapshot_started_at" +%s 2>/dev/null) || fail "快照时间无效"
consistency_mode=$(read_metadata CONSISTENCY_MODE)
write_quiesce_evidence_sha256=$(read_metadata WRITE_QUIESCE_EVIDENCE_SHA256)
case "$consistency_mode" in
  best-effort)
    [[ "$write_quiesce_evidence_sha256" = "NONE" ]] || fail "best-effort 快照静默证据字段无效"
    ;;
  quiesced)
    [[ "$write_quiesce_evidence_sha256" =~ ^[a-f0-9]{64}$ ]] || fail "quiesced 快照缺少写入静默证据"
    ;;
  *) fail "快照一致性模式无效" ;;
esac

now_epoch=$(date -u +%s)
backup_age_seconds=$((now_epoch - snapshot_epoch))
[[ "$backup_age_seconds" -ge 0 && "$backup_age_seconds" -le "$BACKUP_RPO_SECONDS" ]] || fail "待演练备份不满足 RPO"

[[ -d "$RESTORE_DRILL_ROOT" && -d "$RESTORE_EVIDENCE_DIR" ]] || fail "演练根目录和证据目录必须预先存在"
drill_root=$(realpath "$RESTORE_DRILL_ROOT")
case "$drill_root" in /|/app|/media|"$(realpath "$BACKUP_DIR")") fail "RESTORE_DRILL_ROOT 范围过宽或与备份目录重合" ;; esac
IFS=':' read -ra media_targets <<< "$MEDIA_TARGET_DIRS"
[[ "${#media_targets[@]}" -eq 2 ]] || fail "必须提供两个媒体目标目录"
declare -A required_media=( [uploads]=0 [private-media]=0 )
for target_dir in "${media_targets[@]}"; do
  [[ -d "$target_dir" ]] || fail "媒体目标目录不存在: $target_dir"
  resolved_target=$(realpath "$target_dir")
  case "$resolved_target/" in "$drill_root"/*/) ;; *) fail "媒体目标目录越出 RESTORE_DRILL_ROOT" ;; esac
  target_name=$(basename "$resolved_target")
  [[ -v "required_media[$target_name]" ]] || fail "媒体目标必须命名为 uploads 或 private-media"
  required_media[$target_name]=1
  [[ -z "$(find "$resolved_target" -mindepth 1 -print -quit)" ]] || fail "媒体目标目录必须为空"
done
[[ "${required_media[uploads]}" = "1" && "${required_media[private-media]}" = "1" ]] || fail "媒体目标不完整"

started_epoch=$(date -u +%s)
started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
manifest_sha256=$(sha256sum "$manifest_path" | awk '{print $1}')
environment_id_sha256=$(printf '%s' "$RESTORE_DRILL_ENVIRONMENT_ID" | sha256sum | awk '{print $1}')
approval_reference_sha256=$(printf '%s' "$RESTORE_DRILL_APPROVAL_REFERENCE" | sha256sum | awk '{print $1}')
evidence_name="restore-drill-$(date -u +%Y%m%d_%H%M%S)-${manifest_sha256:0:12}.env"
evidence_path="$RESTORE_EVIDENCE_DIR/$evidence_name"
[[ ! -e "$evidence_path" ]] || fail "恢复证据文件已存在"
evidence_partial=$(mktemp "$RESTORE_EVIDENCE_DIR/.restore-drill.XXXXXX.partial")
restore_result="FAILED"
error_code="RESTORE_COMMAND_FAILED"
restored_table_count="0"
applied_migration_count="0"

write_evidence() {
  local original_exit_code="$1"
  local finished_epoch finished_at duration_seconds evidence_exit_code
  finished_epoch=$(date -u +%s)
  finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  duration_seconds=$((finished_epoch - started_epoch))
  evidence_exit_code="$original_exit_code"
  [[ "$restore_result" = "SUCCESS" ]] || evidence_exit_code=1
  {
    printf 'SCHEMA_VERSION=2\n'
    printf 'RESTORE_RESULT=%s\n' "$restore_result"
    printf 'ERROR_CODE=%s\n' "$error_code"
    printf 'EXIT_CODE=%s\n' "$evidence_exit_code"
    printf 'STARTED_AT=%s\n' "$started_at"
    printf 'FINISHED_AT=%s\n' "$finished_at"
    printf 'DATABASE_MEDIA_RESTORE_SECONDS=%s\n' "$duration_seconds"
    printf 'BUSINESS_RTO_SECONDS=%s\n' "$RESTORE_RTO_SECONDS"
    printf 'BUSINESS_RTO_MET=UNVERIFIED\n'
    printf 'SNAPSHOT_STARTED_AT_UTC=%s\n' "$snapshot_started_at"
    printf 'BACKUP_AGE_SECONDS=%s\n' "$backup_age_seconds"
    printf 'RPO_SECONDS=%s\n' "$BACKUP_RPO_SECONDS"
    printf 'CONSISTENCY_MODE=%s\n' "$consistency_mode"
    printf 'WRITE_QUIESCE_EVIDENCE_SHA256=%s\n' "$write_quiesce_evidence_sha256"
    printf 'MEDIA_RESTORE_REQUIRED=true\n'
    printf 'ENVIRONMENT_ID_SHA256=%s\n' "$environment_id_sha256"
    printf 'APPROVAL_REFERENCE_SHA256=%s\n' "$approval_reference_sha256"
    printf 'ISOLATION_EVIDENCE_SHA256=%s\n' "$RESTORE_DRILL_ISOLATION_EVIDENCE_SHA256"
    printf 'RESTORE_MANIFEST_SHA256=%s\n' "$manifest_sha256"
    printf 'RESTORED_TABLE_COUNT=%s\n' "$restored_table_count"
    printf 'APPLIED_MIGRATION_COUNT=%s\n' "$applied_migration_count"
  } > "$evidence_partial" || return 1
  mv -- "$evidence_partial" "$evidence_path" || return 1
  echo "RESTORE_DRILL_EVIDENCE=$evidence_path"
}

on_exit() {
  local original_exit_code=$?
  trap - EXIT
  set +e
  if ! write_evidence "$original_exit_code"; then
    rm -f -- "$evidence_partial"
    echo "RESTORE_EVIDENCE_WRITE_FAILED" >&2
    exit 1
  fi
  [[ "$restore_result" = "SUCCESS" ]] || exit 1
  exit "$original_exit_code"
}
trap on_exit EXIT

RESTORE_DATABASE_ONLY=false RESTORE_CONFIRM="RESTORE:$DB_NAME" /bin/bash "$(dirname "$0")/restore.sh"

mysql_exec() {
  MYSQL_PWD="$DB_PASS" mysql --protocol=TCP -h "${DB_HOST:-localhost}" -P "${DB_PORT:-3306}" -u "${DB_USER:-jewelry_user}" "$@"
}
restored_table_count=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$DB_NAME'")
applied_migration_count=$(mysql_exec -N "$DB_NAME" -e "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")
[[ "$restored_table_count" =~ ^[1-9][0-9]*$ ]] || fail "恢复后数据表计数无效"
[[ "$applied_migration_count" =~ ^[1-9][0-9]*$ ]] || fail "恢复后 migration 计数无效"
restore_result="SUCCESS"
error_code="NONE"

