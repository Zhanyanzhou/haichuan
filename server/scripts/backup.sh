#!/bin/bash
# ============================================
# 海川珠宝 - MySQL 数据库备份脚本
# 用法: ./backup.sh
# 建议: crontab 定时执行 (如每日凌晨 2 点)
#       0 2 * * * /path/to/backup.sh
# ============================================

set -e

# 配置
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-jewelry_user}"
: "${DB_PASS:?DB_PASS must be set}"
DB_NAME="${DB_NAME:-jewelry_db}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS=7

# 日期
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="${DB_NAME}_${TIMESTAMP}.sql.gz"

# 创建备份目录
mkdir -p "$BACKUP_DIR"

echo "📦 开始备份数据库: $DB_NAME ..."

# mysqldump + 压缩
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

echo "✅ 备份完成: $BACKUP_DIR/$FILENAME"

# 清理超过保留天数的旧备份
echo "🧹 清理 ${RETENTION_DAYS} 天前的备份..."
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "📊 当前备份列表:"
ls -lh "$BACKUP_DIR" | grep "$DB_NAME"

echo "🎉 备份任务完成"
