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

# 配置
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-jewelry_user}"
: "${DB_PASS:?DB_PASS must be set}"
DB_NAME="${DB_NAME:-jewelry_db}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
MEDIA_DIRS="${MEDIA_DIRS:-}"
MEDIA_PREFIX="${MEDIA_PREFIX:-jewelry_media}"
DISK_WARN_PCT="${DISK_WARN_PCT:-85}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

# 日期
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="${DB_NAME}_${TIMESTAMP}.sql.gz"
FINAL_PATH="${BACKUP_DIR}/${FILENAME}"
PARTIAL_PATH="${FINAL_PATH}.partial"
MANIFEST_FILENAME="${DB_NAME}_${TIMESTAMP}.sha256"
MANIFEST_FINAL_PATH="${BACKUP_DIR}/${MANIFEST_FILENAME}"
MANIFEST_PARTIAL_PATH="${MANIFEST_FINAL_PATH}.partial"

# 创建备份目录
mkdir -p "$BACKUP_DIR"

MEDIA_FINAL_PATHS=()
MEDIA_PARTIAL_PATHS=()
PUBLISHED_PATHS=()
PUBLISH_COMPLETE=false

cleanup_incomplete_backup() {
  rm -f -- "$PARTIAL_PATH" "$MANIFEST_PARTIAL_PATH"
  for partial in "${MEDIA_PARTIAL_PATHS[@]}"; do
    rm -f -- "$partial"
  done
  if [ "$PUBLISH_COMPLETE" != "true" ]; then
    for published in "${PUBLISHED_PATHS[@]}"; do
      rm -f -- "$published"
    done
  fi
}

# 重定向会在命令失败前创建空文件；清单发布前的任何退出都清理本批产物。
trap cleanup_incomplete_backup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# ---------- 1. 数据库 ----------
echo "📦 开始备份数据库: ${DB_NAME} ..."

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
    else
      echo "✅ 媒体备份暂存并校验完成: $media_partial"
    fi
  done
else
  echo "ℹ️  未设置 MEDIA_DIRS，跳过媒体备份（容器内运行时由 compose 注入）"
fi

# ---------- 3. 批次提交（清单最后发布，作为完整备份组的提交标记） ----------
: > "$MANIFEST_PARTIAL_PATH"
db_checksum=$(sha256sum "$PARTIAL_PATH" | awk '{print $1}')
printf '%s  %s\n' "$db_checksum" "$(basename "$FINAL_PATH")" >> "$MANIFEST_PARTIAL_PATH"
for index in "${!MEDIA_PARTIAL_PATHS[@]}"; do
  media_checksum=$(sha256sum "${MEDIA_PARTIAL_PATHS[$index]}" | awk '{print $1}')
  printf '%s  %s\n' "$media_checksum" "$(basename "${MEDIA_FINAL_PATHS[$index]}")" >> "$MANIFEST_PARTIAL_PATH"
done
test -s "$MANIFEST_PARTIAL_PATH"

mv -f -- "$PARTIAL_PATH" "$FINAL_PATH"
PUBLISHED_PATHS+=("$FINAL_PATH")
for index in "${!MEDIA_PARTIAL_PATHS[@]}"; do
  mv -f -- "${MEDIA_PARTIAL_PATHS[$index]}" "${MEDIA_FINAL_PATHS[$index]}"
  PUBLISHED_PATHS+=("${MEDIA_FINAL_PATHS[$index]}")
done
mv -f -- "$MANIFEST_PARTIAL_PATH" "$MANIFEST_FINAL_PATH"
PUBLISHED_PATHS+=("$MANIFEST_FINAL_PATH")

(cd "$BACKUP_DIR" && sha256sum -c "$MANIFEST_FILENAME")
PUBLISH_COMPLETE=true
echo "✅ 完整备份批次已发布并复验: $MANIFEST_FINAL_PATH"

# ---------- 4. 清理过期备份 ----------
echo "🧹 清理 ${RETENTION_DAYS} 天前的备份 ..."
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name "${DB_NAME}_*.sha256" -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name "${MEDIA_PREFIX}_*.tar.gz" -mtime +"$RETENTION_DAYS" -delete

# ---------- 5. 磁盘水位检查（超阈值输出告警日志，供日志采集/人工巡检发现） ----------
disk_use=$(df -P "$BACKUP_DIR" | awk 'NR==2 {gsub("%",""); print $5}')
if [ -n "$disk_use" ] && [ "$disk_use" -ge "$DISK_WARN_PCT" ]; then
  echo "🚨 WARN: 备份目标磁盘使用率 ${disk_use}% ≥ 阈值 ${DISK_WARN_PCT}%，请清理或扩容！"
fi

# ---------- 6. 清单 ----------
echo "📊 当前备份列表:"
ls -lh "$BACKUP_DIR" | grep -E "$DB_NAME|$MEDIA_PREFIX" || echo "(空)"

echo "🎉 备份任务完成"
