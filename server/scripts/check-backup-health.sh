#!/bin/bash
set -u

BACKUP_DIR="${BACKUP_DIR:-/backups}"
STATUS_PATH="${BACKUP_DIR}/.health/backup-status.env"
BACKUP_INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:?BACKUP_INTERVAL_SECONDS must be set}"
BACKUP_RPO_SECONDS="${BACKUP_RPO_SECONDS:?BACKUP_RPO_SECONDS must be set}"

for numeric_name in BACKUP_INTERVAL_SECONDS BACKUP_RPO_SECONDS; do
  numeric_value="${!numeric_name}"
  case "$numeric_value" in
    ''|*[!0-9]*)
      echo "BACKUP_POLICY_INVALID"
      exit 1
      ;;
  esac
  if [ "$numeric_value" -le 0 ]; then
    echo "BACKUP_POLICY_INVALID"
    exit 1
  fi
done
if [ "$BACKUP_INTERVAL_SECONDS" -gt "$BACKUP_RPO_SECONDS" ]; then
  echo "BACKUP_POLICY_RPO_UNACHIEVABLE"
  exit 1
fi

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
latest_manifest=$(read_status_value "LATEST_MANIFEST")

if [ "$schema_version" != "1" ] || [ "$result" != "SUCCESS" ] || [ "$last_exit_code" != "0" ]; then
  echo "BACKUP_STATUS_UNHEALTHY"
  exit 1
fi

case "$latest_manifest" in
  ''|*[!A-Za-z0-9_.-]*|*.sha256.sha256)
    echo "BACKUP_MANIFEST_NAME_INVALID"
    exit 1
    ;;
esac
case "$latest_manifest" in
  *.sha256) ;;
  *)
    echo "BACKUP_MANIFEST_NAME_INVALID"
    exit 1
    ;;
esac
if [ ! -f "$BACKUP_DIR/$latest_manifest" ]; then
  echo "BACKUP_MANIFEST_MISSING"
  exit 1
fi

if ! awk '
  NF != 2 || $1 !~ /^[0-9a-fA-F]{64}$/ || $2 !~ /^[A-Za-z0-9][A-Za-z0-9_.-]*$/ { invalid = 1 }
  $2 ~ /\.sql\.gz$/ { database += 1 }
  $2 ~ /_uploads\.tar\.gz$/ { uploads += 1 }
  $2 ~ /_private-media\.tar\.gz$/ { private_media += 1 }
  $2 ~ /\.metadata\.env$/ { metadata += 1 }
  END { exit invalid || database != 1 || uploads != 1 || private_media != 1 || metadata != 1 }
' "$BACKUP_DIR/$latest_manifest"; then
  echo "BACKUP_MANIFEST_CONTRACT_INVALID"
  exit 1
fi
if ! (cd "$BACKUP_DIR" && sha256sum -c -- "$latest_manifest" >/dev/null 2>&1); then
  echo "BACKUP_ARTIFACT_INTEGRITY_INVALID"
  exit 1
fi

if ! last_success_epoch=$(date -u -d "$last_success_at" +%s 2>/dev/null); then
  echo "BACKUP_LAST_SUCCESS_INVALID"
  exit 1
fi

now_epoch=$(date -u +%s)
age=$((now_epoch - last_success_epoch))
if [ "$age" -lt 0 ] || [ "$age" -gt "$BACKUP_RPO_SECONDS" ]; then
  echo "BACKUP_LAST_SUCCESS_STALE"
  exit 1
fi

echo "LOCAL_BACKUP_HEALTHY"
