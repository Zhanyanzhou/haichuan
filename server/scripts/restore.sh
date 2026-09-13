#!/bin/bash
# 海川珠宝备份恢复入口。
#
# 安全默认：
# - 只接受 backup.sh 发布的 SHA-256 清单和受控文件名；
# - 目标数据库必须已存在且为空；
# - 媒体只能恢复到已存在的空目录，不覆盖或合并现有文件；
# - 脚本不会创建、删除或原位覆盖数据库。

set -Eeuo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-jewelry_user}"
: "${DB_PASS:?DB_PASS must be set}"
: "${DB_NAME:?DB_NAME must be set}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
: "${RESTORE_MANIFEST:?RESTORE_MANIFEST must be set to a manifest filename}"
MEDIA_TARGET_DIRS="${MEDIA_TARGET_DIRS:-}"
RESTORE_DATABASE_ONLY="${RESTORE_DATABASE_ONLY:-false}"
RESTORE_CONFIRM="${RESTORE_CONFIRM:-}"

fail() {
  echo "🚨 ERROR: $*" >&2
  exit 1
}

[[ "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]] || fail "DB_NAME 只允许字母、数字和下划线"
[[ "$RESTORE_DATABASE_ONLY" = "true" || "$RESTORE_DATABASE_ONLY" = "false" ]] ||
  fail "RESTORE_DATABASE_ONLY 只允许 true 或 false"
[[ "$RESTORE_MANIFEST" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*\.sha256$ ]] ||
  fail "RESTORE_MANIFEST 必须是 BACKUP_DIR 下的安全 .sha256 文件名"
[[ -d "$BACKUP_DIR" ]] || fail "备份目录不存在: $BACKUP_DIR"

MANIFEST_PATH="$BACKUP_DIR/$RESTORE_MANIFEST"
[[ -f "$MANIFEST_PATH" && ! -L "$MANIFEST_PATH" ]] || fail "备份清单不存在或类型不安全: $MANIFEST_PATH"

# backup.sh 的清单固定为「64 位 SHA-256 + 两个空格 + 单个安全文件名」。
awk '
  NF != 2 || length($1) != 64 || $1 !~ /^[0-9a-fA-F]+$/ || $2 !~ /^[A-Za-z0-9][A-Za-z0-9_.-]*$/ {
    invalid = 1
  }
  END { exit invalid ? 1 : 0 }
' "$MANIFEST_PATH" || fail "备份清单格式不安全或已损坏"

mapfile -t ARTIFACTS < <(awk '{ print $2 }' "$MANIFEST_PATH")
[[ "${#ARTIFACTS[@]}" -gt 0 ]] || fail "备份清单为空"

DB_DUMPS=()
MEDIA_ARCHIVES=()
METADATA_FILES=()
for artifact in "${ARTIFACTS[@]}"; do
  [[ -f "$BACKUP_DIR/$artifact" && ! -L "$BACKUP_DIR/$artifact" ]] ||
    fail "清单中的备份文件不存在或类型不安全: $artifact"
  case "$artifact" in
    *.sql.gz) DB_DUMPS+=("$BACKUP_DIR/$artifact") ;;
    *.tar.gz) MEDIA_ARCHIVES+=("$BACKUP_DIR/$artifact") ;;
    *.metadata.env) METADATA_FILES+=("$BACKUP_DIR/$artifact") ;;
    *) fail "清单包含不支持的备份类型: $artifact" ;;
  esac
done

[[ "${#DB_DUMPS[@]}" -eq 1 ]] || fail "每个恢复批次必须且只能包含一个数据库备份"
[[ "${#METADATA_FILES[@]}" -eq 1 ]] || fail "备份批次必须且只能包含一个快照元数据文件"
if [[ "$RESTORE_DATABASE_ONLY" = "false" ]]; then
  [[ "${#MEDIA_ARCHIVES[@]}" -eq 2 ]] || fail "完整恢复必须且只能包含 uploads 与 private-media 两个媒体归档"
fi

(cd "$BACKUP_DIR" && sha256sum -c -- "$RESTORE_MANIFEST") ||
  fail "备份清单校验失败，未执行任何恢复"
gzip -t "${DB_DUMPS[0]}" || fail "数据库备份 gzip 校验失败"

mysql_exec() {
  MYSQL_PWD="$DB_PASS" mysql \
    --protocol=TCP \
    -h "$DB_HOST" \
    -P "$DB_PORT" \
    -u "$DB_USER" \
    "$@"
}

schema_exists=$(mysql_exec -N -e \
  "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = '$DB_NAME'")
[[ "$schema_exists" = "1" ]] || fail "目标数据库不存在，脚本不会自动创建: $DB_NAME"

schema_object_count=$(mysql_exec -N -e \
  "SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$DB_NAME') + (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = '$DB_NAME') + (SELECT COUNT(*) FROM information_schema.events WHERE event_schema = '$DB_NAME')")
[[ "$schema_object_count" = "0" ]] ||
  fail "目标数据库必须为空；脚本禁止原位覆盖，请改用新的隔离恢复库"
expected_confirm="RESTORE:$DB_NAME"
[[ "$RESTORE_CONFIRM" = "$expected_confirm" ]] ||
  fail "确认值不匹配；本次需要 RESTORE_CONFIRM=$expected_confirm"

declare -A MEDIA_TARGET_BY_NAME=()
if [[ -n "$MEDIA_TARGET_DIRS" ]]; then
  IFS=':' read -ra TARGET_DIRS <<< "$MEDIA_TARGET_DIRS"
  for target_dir in "${TARGET_DIRS[@]}"; do
    [[ -d "$target_dir" && ! -L "$target_dir" ]] || fail "媒体目标目录不存在或类型不安全: $target_dir"
    [[ -z "$(find "$target_dir" -mindepth 1 -print -quit)" ]] ||
      fail "媒体目标目录必须为空，脚本不会覆盖或合并现有文件: $target_dir"
    target_name=$(basename "$target_dir")
    [[ -z "${MEDIA_TARGET_BY_NAME[$target_name]:-}" ]] ||
      fail "媒体目标目录 basename 重复: $target_name"
    MEDIA_TARGET_BY_NAME[$target_name]="$target_dir"
  done
fi

if [[ "$RESTORE_DATABASE_ONLY" = "false" ]]; then
  [[ -n "${MEDIA_TARGET_BY_NAME[uploads]:-}" && -n "${MEDIA_TARGET_BY_NAME[private-media]:-}" ]] ||
    fail "完整恢复必须提供 uploads 与 private-media 两个同名空目标目录"
fi

if [[ "${#MEDIA_ARCHIVES[@]}" -gt 0 && "$RESTORE_DATABASE_ONLY" != "true" ]]; then
  [[ "${#MEDIA_TARGET_BY_NAME[@]}" -eq "${#MEDIA_ARCHIVES[@]}" ]] ||
    fail "媒体归档数量与 MEDIA_TARGET_DIRS 数量不一致"
elif [[ "${#MEDIA_ARCHIVES[@]}" -gt 0 && "$RESTORE_DATABASE_ONLY" = "true" ]]; then
  echo "⚠️  已显式选择仅恢复数据库；清单中的媒体归档不会写入目标目录"
elif [[ "${#MEDIA_TARGET_BY_NAME[@]}" -gt 0 ]]; then
  fail "清单不含媒体归档，但配置了 MEDIA_TARGET_DIRS"
fi

STAGING_DIR=$(mktemp -d "${TMPDIR:-/tmp}/hc-restore.XXXXXX")
cleanup() {
  rm -rf -- "$STAGING_DIR"
}
trap cleanup EXIT

declare -A STAGED_MEDIA_BY_NAME=()
if [[ "$RESTORE_DATABASE_ONLY" != "true" ]]; then
  for archive in "${MEDIA_ARCHIVES[@]}"; do
    tar -tzf "$archive" >/dev/null || fail "媒体归档校验失败: $(basename "$archive")"
    if tar -tzf "$archive" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
      fail "媒体归档包含不安全路径: $(basename "$archive")"
    fi
    if tar -tvzf "$archive" | awk 'substr($1, 1, 1) != "-" && substr($1, 1, 1) != "d" { exit 1 }'; then
      :
    else
      fail "媒体归档只允许普通文件和目录: $(basename "$archive")"
    fi
    mapfile -t top_levels < <(tar -tzf "$archive" | awk -F/ 'NF > 0 { print $1 }' | sort -u)
    [[ "${#top_levels[@]}" -eq 1 && -n "${top_levels[0]}" ]] ||
      fail "媒体归档必须只有一个顶层目录: $(basename "$archive")"
    top_level="${top_levels[0]}"
    [[ -n "${MEDIA_TARGET_BY_NAME[$top_level]:-}" ]] ||
      fail "媒体归档没有同名目标目录: $top_level"
    [[ -z "${STAGED_MEDIA_BY_NAME[$top_level]:-}" ]] ||
      fail "多个媒体归档使用同一顶层目录: $top_level"
    tar -xzf "$archive" -C "$STAGING_DIR"
    STAGED_MEDIA_BY_NAME[$top_level]="$STAGING_DIR/$top_level"
  done
fi

echo "📦 开始恢复数据库: $DB_NAME"
gzip -dc "${DB_DUMPS[0]}" | mysql_exec "$DB_NAME"

restored_table_count=$(mysql_exec -N -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$DB_NAME'")
[[ "$restored_table_count" -gt 0 ]] || fail "数据库恢复后仍无数据表"
migration_table_exists=$(mysql_exec -N -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$DB_NAME' AND table_name = '_prisma_migrations'")
[[ "$migration_table_exists" = "1" ]] || fail "恢复结果缺少 _prisma_migrations"

tree_hash() {
  local root="$1"
  (
    cd "$root"
    find . -type f -print0 | sort -z | xargs -0 -r sha256sum
  ) | sha256sum | awk '{ print $1 }'
}

if [[ "$RESTORE_DATABASE_ONLY" != "true" ]]; then
  for top_level in "${!STAGED_MEDIA_BY_NAME[@]}"; do
    target_dir="${MEDIA_TARGET_BY_NAME[$top_level]}"
    cp -a "${STAGED_MEDIA_BY_NAME[$top_level]}/." "$target_dir/"
    source_hash=$(tree_hash "${STAGED_MEDIA_BY_NAME[$top_level]}")
    target_hash=$(tree_hash "$target_dir")
    [[ "$source_hash" = "$target_hash" ]] ||
      fail "媒体恢复后哈希不一致: $top_level"
  done
fi

echo "✅ 恢复完成：数据库 $DB_NAME（$restored_table_count 张表）"
if [[ "$RESTORE_DATABASE_ONLY" != "true" ]]; then
  echo "✅ 媒体恢复完成：${#STAGED_MEDIA_BY_NAME[@]} 个归档"
fi
