#!/bin/bash
set -u

BACKUP_DIR="${BACKUP_DIR:-/backups}"
STATUS_PATH="${BACKUP_DIR}/.health/backup-status.env"
BACKUP_INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"
BACKUP_HEALTH_GRACE_SECONDS="${BACKUP_HEALTH_GRACE_SECONDS:-3600}"

read_status_value() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$STATUS_PATH"
}

if [ ! -f "$STATUS_PATH" ]; then
  echo "BACKUP_STATUS_MISSING"
  exit 1
fi

schema_version=$(read_status_value "SCHEMA_VERSION")
result=$(read_status_value "RESULT")
last_exit_code=$(read_status_value "LAST_EXIT_CODE")
last_success_at=$(read_status_value "LAST_SUCCESS_AT")

if [ "$schema_version" != "1" ] || [ "$result" != "SUCCESS" ] || [ "$last_exit_code" != "0" ]; then
  echo "BACKUP_STATUS_UNHEALTHY"
  exit 1
fi

if ! last_success_epoch=$(date -u -d "$last_success_at" +%s 2>/dev/null); then
  echo "BACKUP_LAST_SUCCESS_INVALID"
  exit 1
fi

now_epoch=$(date -u +%s)
max_age=$((BACKUP_INTERVAL_SECONDS + BACKUP_HEALTH_GRACE_SECONDS))
age=$((now_epoch - last_success_epoch))
if [ "$age" -lt 0 ] || [ "$age" -gt "$max_age" ]; then
  echo "BACKUP_LAST_SUCCESS_STALE"
  exit 1
fi

echo "BACKUP_HEALTHY"
