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
#   媒体卷: tar 归档非原子，备份瞬间正在写入的文件可能进入下一个归档，
#           对图片/凭证类只增不改的存储可接受。
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

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# ---------- 1. 数据库 ----------
echo "📦 开始备份数据库: ${DB_NAME} ..."

mysqldump \
  -h "$DB_HOST" \
  -P "$DB_PORT" \
  -u "$DB_USER" \
  -p"$DB_PASS" \
  --single-transaction \
  --routines \
  --triggers \
  --add-drop-table \
  "$DB_NAME" | gzip > "$BACKUP_DIR/$FILENAME"

echo "✅ 数据库备份完成: $BACKUP_DIR/$FILENAME"

# ---------- 2. 媒体卷（uploads / private-media，含付款凭证） ----------
if [ -n "$MEDIA_DIRS" ]; then
  echo "📦 开始备份媒体卷: $MEDIA_DIRS ..."
  IFS=':' read -ra DIRS <<< "$MEDIA_DIRS"
  for dir in "${DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
      echo "⚠️  目录不存在，跳过: $dir"
      continue
    fi
    # 用目录名区分归档: jewelry_media_20260814_020000_uploads.tar.gz
    dirname_part=$(basename "$dir" | tr -c 'a-zA-Z0-9_.-' '_')
    media_file="${BACKUP_DIR}/${MEDIA_PREFIX}_${TIMESTAMP}_${dirname_part}.tar.gz"
    tar -czf "$media_file" -C "$(dirname "$dir")" "$(basename "$dir")"
    echo "✅ 媒体备份完成: $media_file ($(du -h "$media_file" | cut -f1))"
  done
else
  echo "ℹ️  未设置 MEDIA_DIRS，跳过媒体备份（容器内运行时由 compose 注入）"
fi

# ---------- 3. 清理过期备份 ----------
echo "🧹 清理 ${RETENTION_DAYS} 天前的备份 ..."
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name "${MEDIA_PREFIX}_*.tar.gz" -mtime +"$RETENTION_DAYS" -delete

# ---------- 4. 磁盘水位检查（超阈值输出告警日志，供日志采集/人工巡检发现） ----------
disk_use=$(df -P "$BACKUP_DIR" | awk 'NR==2 {gsub("%",""); print $5}')
if [ -n "$disk_use" ] && [ "$disk_use" -ge "$DISK_WARN_PCT" ]; then
  echo "🚨 WARN: 备份目标磁盘使用率 ${disk_use}% ≥ 阈值 ${DISK_WARN_PCT}%，请清理或扩容！"
fi

# ---------- 5. 清单 ----------
echo "📊 当前备份列表:"
ls -lh "$BACKUP_DIR" | grep -E "$DB_NAME|$MEDIA_PREFIX" || echo "(空)"

echo "🎉 备份任务完成"
