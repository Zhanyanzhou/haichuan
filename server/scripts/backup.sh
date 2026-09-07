#!/bin/bash
# ============================================
# 海川珠宝 - 备份脚本（数据库 + 媒体卷）
#
# 用法:
#   宿主机: ./backup.sh
#     （仅数据库备份，需本机有 mysqldump；建议 crontab: 0 2 * * *）
#   容器内: 由 docker-compose 的 backup 服务定时执行
#     （数据库 + uploads/private-media 媒体卷，见 docker-compose.yml）
#
# 环境变量:
#   DB_HOST / DB_PORT / DB_USER / DB_PASS / DB_NAME   数据库连接
#   BACKUP_DIR   备份输出目录（默认 ./backups）
#   MEDIA_DIRS   待备份目录列表，冒号分隔（默认空 = 跳过媒体备份）
#                例: /media/uploads:/media/private-media
#   MEDIA_PREFIX 媒体归档文件名前缀（默认 jewelry_media）
#   BACKUP_DB_READY_TIMEOUT_SECONDS 等待数据库就绪的最长秒数（默认 60）
#   BACKUP_INTERVAL_SECONDS 备份周期（生产必须显式设置）
#   BACKUP_RPO_SECONDS 最大可接受数据丢失窗口（生产必须显式设置）
#   DISK_WARN_PCT 磁盘使用率告警阈值（默认 85）
#   RETENTION_DAYS 保留天数（默认 7）
#
# 一致性说明:
#   数据库: --single-transaction（InnoDB 一致性快照，不锁表）
#   媒体卷: 源目录快照仍不是跨文件原子，但所有输出先写 *.partial，
#           通过 gzip/tar 校验后才发布；SHA-256 清单最后原子改名，作为整批完成标记。
# ============================================

set -e
set -o pipefail
umask 077

# 配置
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-jewelry_user}"
: "${DB_PASS:?DB_PASS must be set}"
DB_NAME="${DB_NAME:-jewelry_db}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
MEDIA_DIRS="${MEDIA_DIRS:-}"
MEDIA_PREFIX="${MEDIA_PREFIX:-jewelry_media}"
BACKUP_DB_READY_TIMEOUT_SECONDS="${BACKUP_DB_READY_TIMEOUT_SECONDS:-60}"
DISK_WARN_PCT="${DISK_WARN_PCT:-85}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
BACKUP_INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:?BACKUP_INTERVAL_SECONDS must be set}"
BACKUP_RPO_SECONDS="${BACKUP_RPO_SECONDS:?BACKUP_RPO_SECONDS must be set}"
BACKUP_CONSISTENCY_MODE="${BACKUP_CONSISTENCY_MODE:-best-effort}"
BACKUP_WRITE_QUIESCE_EVIDENCE_SHA256="${BACKUP_WRITE_QUIESCE_EVIDENCE_SHA256:-NONE}"
[[ "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]] || exit 2
[[ "$MEDIA_PREFIX" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] || exit 2
case "$BACKUP_CONSISTENCY_MODE" in
  best-effort)
    BACKUP_WRITE_QUIESCE_EVIDENCE_SHA256="NONE"
    ;;
  quiesced)
    [[ "$BACKUP_WRITE_QUIESCE_EVIDENCE_SHA256" =~ ^[a-f0-9]{64}$ ]] || {
      echo "🚨 ERROR: quiesced 备份必须提供 64 位写入静默证据哈希"
      exit 2
    }
    ;;
  *)
    echo "🚨 ERROR: BACKUP_CONSISTENCY_MODE 只允许 best-effort 或 quiesced"
    exit 2
    ;;
esac

for numeric_name in BACKUP_DB_READY_TIMEOUT_SECONDS BACKUP_INTERVAL_SECONDS BACKUP_RPO_SECONDS RETENTION_DAYS DISK_WARN_PCT; do
  numeric_value="${!numeric_name}"
  case "$numeric_value" in
  ''|0*|*[!0-9]*)
    echo "🚨 ERROR: ${numeric_name} 必须是正整数"
    exit 2
    ;;
  esac
  [[ "${#numeric_value}" -le 9 ]] || exit 2
  if [ "$numeric_value" -le 0 ]; then
    echo "🚨 ERROR: ${numeric_name} 必须大于 0"
    exit 2
  fi
done
if [ "$BACKUP_INTERVAL_SECONDS" -gt "$BACKUP_RPO_SECONDS" ]; then
  echo "🚨 ERROR: BACKUP_INTERVAL_SECONDS 不得大于 BACKUP_RPO_SECONDS"
  exit 2
fi
if [ "$DISK_WARN_PCT" -gt 100 ]; then
  echo "🚨 ERROR: DISK_WARN_PCT 不得大于 100"
  exit 2
fi

# 日期
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="${DB_NAME}_${TIMESTAMP}.sql.gz"
FINAL_PATH="${BACKUP_DIR}/${FILENAME}"
PARTIAL_PATH="${FINAL_PATH}.partial"
MANIFEST_FILENAME="${DB_NAME}_${TIMESTAMP}.sha256"
MANIFEST_FINAL_PATH="${BACKUP_DIR}/${MANIFEST_FILENAME}"
MANIFEST_PARTIAL_PATH="${MANIFEST_FINAL_PATH}.partial"
METADATA_PATH="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.metadata.env"
METADATA_PARTIAL_PATH="${METADATA_PATH}.partial"
STATUS_DIR="${BACKUP_DIR}/.health"
STATUS_PATH="${STATUS_DIR}/backup-status.env"
STATUS_PARTIAL_PATH="${STATUS_PATH}.partial"
ATTEMPT_STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
BACKUP_PHASE="INITIALIZING"
WARNING_CODE="NONE"

# 创建备份目录
mkdir -p "$BACKUP_DIR"
mkdir -p "$STATUS_DIR"

MEDIA_FINAL_PATHS=()
MEDIA_PARTIAL_PATHS=()
PUBLISHED_PATHS=()
PUBLISH_COMPLETE=false
LOCK_DIR="${STATUS_DIR}/backup.lock"
LOCK_HELD=false

read_previous_status() {
  local key="$1"
  if [ ! -f "$STATUS_PATH" ]; then
    return 0
  fi
  awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$STATUS_PATH"
}

PREVIOUS_LAST_SUCCESS_AT=$(read_previous_status "LAST_SUCCESS_AT")
PREVIOUS_LATEST_MANIFEST=$(read_previous_status "LATEST_MANIFEST")

failure_code_for_phase() {
  case "$BACKUP_PHASE" in
    DATABASE_DUMP) echo "DB_DUMP_FAILED" ;;
    MEDIA_ARCHIVE) echo "MEDIA_ARCHIVE_FAILED" ;;
    MANIFEST_BUILD) echo "MANIFEST_FAILED" ;;
    MANIFEST_VERIFY) echo "VERIFY_FAILED" ;;
    RETENTION) echo "RETENTION_FAILED" ;;
    DISK_CHECK) echo "DISK_CHECK_FAILED" ;;
    *) echo "UNKNOWN" ;;
  esac
}

write_status_marker() {
  local exit_code="$1"
  local result="$2"
  local error_code="$3"
  local finished_at="$4"
  local last_success_at="$PREVIOUS_LAST_SUCCESS_AT"
  local latest_manifest="$PREVIOUS_LATEST_MANIFEST"
  if [ "$PUBLISH_COMPLETE" = "true" ] && [ "$result" = "SUCCESS" ]; then
    # 以快照开始时间保守计算 RPO，完成时间不能掩盖备份执行期间的数据窗口。
    last_success_at="$ATTEMPT_STARTED_AT"
    latest_manifest="$MANIFEST_FILENAME"
  fi
  {
    printf 'SCHEMA_VERSION=1\n'
    printf 'LAST_ATTEMPT_STARTED_AT=%s\n' "$ATTEMPT_STARTED_AT"
    printf 'LAST_ATTEMPT_FINISHED_AT=%s\n' "$finished_at"
    printf 'LAST_SUCCESS_AT=%s\n' "$last_success_at"
    printf 'LAST_EXIT_CODE=%s\n' "$exit_code"
    printf 'RESULT=%s\n' "$result"
    printf 'ERROR_CODE=%s\n' "$error_code"
    printf 'WARNING_CODE=%s\n' "$WARNING_CODE"
    printf 'LATEST_MANIFEST=%s\n' "$latest_manifest"
  } > "$STATUS_PARTIAL_PATH" || return 1
  mv -f -- "$STATUS_PARTIAL_PATH" "$STATUS_PATH" || return 1
}

cleanup_incomplete_backup() {
  rm -f -- "$PARTIAL_PATH" "$MANIFEST_PARTIAL_PATH" "$METADATA_PARTIAL_PATH"
  for partial in "${MEDIA_PARTIAL_PATHS[@]}"; do
    rm -f -- "$partial"
  done
  if [ "$PUBLISH_COMPLETE" != "true" ]; then
    for published in "${PUBLISHED_PATHS[@]}"; do
      rm -f -- "$published"
    done
  fi
}

on_exit() {
  local exit_code=$?
  local finished_at
  local result="FAILED"
  local error_code
  trap - EXIT
  set +e
  cleanup_incomplete_backup
  finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  if [ "$exit_code" -eq 0 ] && [ "$PUBLISH_COMPLETE" = "true" ]; then
    if [ "$WARNING_CODE" = "NONE" ]; then
      result="SUCCESS"
      error_code="NONE"
    else
      result="WARNING"
      error_code="$WARNING_CODE"
    fi
  else
    error_code=$(failure_code_for_phase)
  fi
  if ! write_status_marker "$exit_code" "$result" "$error_code" "$finished_at"; then
    echo 'BACKUP_STATUS_WRITE_FAILED' >&2
    rm -f -- "$STATUS_PARTIAL_PATH"
    exit_code=1
  fi
  if [ "$LOCK_HELD" = "true" ]; then
    rmdir -- "$LOCK_DIR" 2>/dev/null || true
  fi
  exit "$exit_code"
}

# 重定向会在命令失败前创建空文件；清单发布前的任何退出都清理本批产物。
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "🚨 ERROR: 已有备份任务占用 $BACKUP_DIR"
  exit 1
fi
LOCK_HELD=true
for target in "$FINAL_PATH" "$PARTIAL_PATH" "$MANIFEST_FINAL_PATH" "$MANIFEST_PARTIAL_PATH" "$METADATA_PATH" "$METADATA_PARTIAL_PATH"; do
  if [ -e "$target" ]; then
    rmdir -- "$LOCK_DIR"
    echo 'BACKUP_BATCH_ALREADY_EXISTS' >&2
    exit 1
  fi
done
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# ---------- 1. 数据库 ----------
BACKUP_PHASE="DATABASE_DUMP"
echo "📦 开始备份数据库: ${DB_NAME} ..."

db_wait_started_at=$SECONDS
until MYSQL_PWD="$DB_PASS" mysqladmin ping \
  --protocol=tcp \
  -h "$DB_HOST" \
  -P "$DB_PORT" \
  -u "$DB_USER" \
  --silent >/dev/null 2>&1; do
  db_wait_elapsed=$((SECONDS - db_wait_started_at))
  if [ "$db_wait_elapsed" -ge "$BACKUP_DB_READY_TIMEOUT_SECONDS" ]; then
    echo "🚨 ERROR: 数据库在 ${BACKUP_DB_READY_TIMEOUT_SECONDS}s 内未就绪"
    exit 1
  fi
  echo "⏳ 数据库尚未就绪，2 秒后重试（已等待 ${db_wait_elapsed}s）..."
  sleep 2
done

MYSQL_PWD="$DB_PASS" mysqldump \
  -h "$DB_HOST" \
  -P "$DB_PORT" \
  -u "$DB_USER" \
  --single-transaction \
  --no-tablespaces \
  --routines \
  --triggers \
  --add-drop-table \
  "$DB_NAME" | gzip > "$PARTIAL_PATH"

gzip -t "$PARTIAL_PATH"
test -s "$PARTIAL_PATH"
echo "✅ 数据库备份暂存并校验完成: $PARTIAL_PATH"

# ---------- 2. 媒体卷（uploads / private-media，含付款凭证） ----------
if [ -n "$MEDIA_DIRS" ]; then
  BACKUP_PHASE="MEDIA_ARCHIVE"
  echo "📦 开始备份媒体卷: $MEDIA_DIRS ..."
  IFS=':' read -ra DIRS <<< "$MEDIA_DIRS"
  for dir in "${DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
      echo "🚨 ERROR: 已配置的媒体目录不存在，整批备份失败: $dir"
      exit 1
    fi
    # 用目录名区分归档: jewelry_media_20260814_020000_uploads.tar.gz
    # 纯 bash 替换做白名单清洗（tr -c 会把 basename 的尾部换行也映射成 '_'，导致 uploads_.tar.gz）
    dirname_part=$(basename "$dir")
    dirname_part=${dirname_part//[^a-zA-Z0-9_.-]/_}
    media_file="${BACKUP_DIR}/${MEDIA_PREFIX}_${TIMESTAMP}_${dirname_part}.tar.gz"
    media_partial="${media_file}.partial"
    [ ! -e "$media_file" ] && [ ! -e "$media_partial" ] || { echo 'BACKUP_MEDIA_BATCH_ALREADY_EXISTS' >&2; exit 1; }
    MEDIA_FINAL_PATHS+=("$media_file")
    MEDIA_PARTIAL_PATHS+=("$media_partial")
    # tar 退出码 1 = 读取期间文件变更（"file changed as we read it"），归档仍完整生成。
    # 按本脚本头部一致性说明，对只增不改的图片/凭证存储可接受；>1 才是真实失败。
    set +e
    tar -czf "$media_partial" -C "$(dirname "$dir")" "$(basename "$dir")"
    tar_status=$?
    set -e
    if [ "$tar_status" -gt 1 ]; then
      echo "🚨 ERROR: tar 退出码 ${tar_status}，媒体归档失败: $media_partial"
      exit "$tar_status"
    fi
    test -s "$media_partial"
    tar -tzf "$media_partial" >/dev/null
    if [ "$tar_status" -eq 1 ]; then
      echo "⚠️  tar 退出码 1（读取期间文件变更），归档校验通过并暂存: $media_partial"
      WARNING_CODE="MEDIA_CHANGED_DURING_ARCHIVE"
    else
      echo "✅ 媒体备份暂存并校验完成: $media_partial"
    fi
  done
else
  echo "ℹ️  未设置 MEDIA_DIRS，跳过媒体备份（容器内运行时由 compose 注入）"
fi

# ---------- 3. 批次提交（清单最后发布，作为完整备份组的提交标记） ----------
BACKUP_PHASE="MANIFEST_BUILD"
{
  printf 'SCHEMA_VERSION=1\n'
  printf 'SNAPSHOT_STARTED_AT_UTC=%s\n' "$ATTEMPT_STARTED_AT"
  printf 'CONSISTENCY_MODE=%s\n' "$BACKUP_CONSISTENCY_MODE"
  printf 'WRITE_QUIESCE_EVIDENCE_SHA256=%s\n' "$BACKUP_WRITE_QUIESCE_EVIDENCE_SHA256"
} > "$METADATA_PARTIAL_PATH"
: > "$MANIFEST_PARTIAL_PATH"
metadata_checksum=$(sha256sum "$METADATA_PARTIAL_PATH" | awk '{print $1}')
printf '%s  %s\n' "$metadata_checksum" "$(basename "$METADATA_PATH")" >> "$MANIFEST_PARTIAL_PATH"
db_checksum=$(sha256sum "$PARTIAL_PATH" | awk '{print $1}')
printf '%s  %s\n' "$db_checksum" "$(basename "$FINAL_PATH")" >> "$MANIFEST_PARTIAL_PATH"
for index in "${!MEDIA_PARTIAL_PATHS[@]}"; do
  media_checksum=$(sha256sum "${MEDIA_PARTIAL_PATHS[$index]}" | awk '{print $1}')
  printf '%s  %s\n' "$media_checksum" "$(basename "${MEDIA_FINAL_PATHS[$index]}")" >> "$MANIFEST_PARTIAL_PATH"
done
test -s "$MANIFEST_PARTIAL_PATH"

mv -f -- "$PARTIAL_PATH" "$FINAL_PATH"
PUBLISHED_PATHS+=("$FINAL_PATH")
mv -f -- "$METADATA_PARTIAL_PATH" "$METADATA_PATH"
PUBLISHED_PATHS+=("$METADATA_PATH")
for index in "${!MEDIA_PARTIAL_PATHS[@]}"; do
  mv -f -- "${MEDIA_PARTIAL_PATHS[$index]}" "${MEDIA_FINAL_PATHS[$index]}"
  PUBLISHED_PATHS+=("${MEDIA_FINAL_PATHS[$index]}")
done
mv -f -- "$MANIFEST_PARTIAL_PATH" "$MANIFEST_FINAL_PATH"
PUBLISHED_PATHS+=("$MANIFEST_FINAL_PATH")

BACKUP_PHASE="MANIFEST_VERIFY"
(cd "$BACKUP_DIR" && sha256sum -c "$MANIFEST_FILENAME")
PUBLISH_COMPLETE=true
echo "✅ 完整备份批次已发布并复验: $MANIFEST_FINAL_PATH"

# ---------- 4. 保留策略报告 ----------
BACKUP_PHASE="RETENTION"
echo "ℹ️  保留目标为 ${RETENTION_DAYS} 天；prune-backups.sh 只读列出候选，删除须交给已批准的备份管理流程。"

# ---------- 5. 磁盘水位检查（超阈值输出告警日志，供日志采集/人工巡检发现） ----------
BACKUP_PHASE="DISK_CHECK"
disk_use=$(df -P "$BACKUP_DIR" | awk 'NR==2 {gsub("%",""); print $5}')
if [ -n "$disk_use" ] && [ "$disk_use" -ge "$DISK_WARN_PCT" ]; then
  echo "🚨 WARN: 备份目标磁盘使用率 ${disk_use}% ≥ 阈值 ${DISK_WARN_PCT}%，请清理或扩容！"
  WARNING_CODE="DISK_HIGH"
fi

# ---------- 6. 清单 ----------
echo "📊 当前备份列表:"
ls -lh "$BACKUP_DIR" | grep -E "$DB_NAME|$MEDIA_PREFIX" || echo "(空)"

echo "🎉 备份任务完成"
