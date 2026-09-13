#!/bin/bash
set -Eeuo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
STATUS_PATH="${BACKUP_DIR}/.health/backup-status.env"
BACKUP_INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:?BACKUP_INTERVAL_SECONDS must be set}"
BACKUP_RPO_SECONDS="${BACKUP_RPO_SECONDS:?BACKUP_RPO_SECONDS must be set}"

for numeric_name in BACKUP_INTERVAL_SECONDS BACKUP_RPO_SECONDS; do
  numeric_value="${!numeric_name}"
  case "$numeric_value" in
    ''|0*|*[!0-9]*)
      echo "BACKUP_POLICY_INVALID"
      exit 1
      ;;
  esac
  if [ "${#numeric_value}" -gt 9 ]; then
    echo "BACKUP_POLICY_INVALID"
    exit 1
  fi
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

if [ ! -f "$STATUS_PATH" ] || [ -L "$STATUS_PATH" ]; then
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
if [ ! -f "$BACKUP_DIR/$latest_manifest" ] || [ -L "$BACKUP_DIR/$latest_manifest" ]; then
  echo "BACKUP_MANIFEST_MISSING"
  exit 1
fi

if ! awk '
  NF != 2 || length($1) != 64 || $1 !~ /^[0-9a-fA-F]+$/ || $2 !~ /^[A-Za-z0-9][A-Za-z0-9_.-]*$/ { invalid = 1 }
  $2 ~ /\.sql\.gz$/ { database += 1 }
  $2 ~ /_uploads\.tar\.gz$/ { uploads += 1 }
  $2 ~ /_private-media\.tar\.gz$/ { private_media += 1 }
  $2 ~ /\.metadata\.env$/ { metadata += 1 }
  END { exit invalid || NR != 4 || database != 1 || uploads != 1 || private_media != 1 || metadata != 1 }
' "$BACKUP_DIR/$latest_manifest"; then
  echo "BACKUP_MANIFEST_CONTRACT_INVALID"
  exit 1
fi
while read -r _ artifact; do
  if [ ! -f "$BACKUP_DIR/$artifact" ] || [ -L "$BACKUP_DIR/$artifact" ]; then
    echo "BACKUP_ARTIFACT_TYPE_INVALID"
    exit 1
  fi
done < "$BACKUP_DIR/$latest_manifest"
if ! (cd "$BACKUP_DIR" && sha256sum -c -- "$latest_manifest" >/dev/null 2>&1); then
  echo "BACKUP_ARTIFACT_INTEGRITY_INVALID"
  exit 1
fi

metadata_name=$(awk '$2 ~ /\.metadata\.env$/ { print $2 }' "$BACKUP_DIR/$latest_manifest")
metadata_path="$BACKUP_DIR/$metadata_name"
if ! awk -F= '
  $1 == "SCHEMA_VERSION" { schema += 1; if ($2 != "1") invalid = 1; next }
  $1 == "SNAPSHOT_STARTED_AT_UTC" { snapshot += 1; next }
  $1 == "CONSISTENCY_MODE" { consistency += 1; if ($2 != "best-effort" && $2 != "quiesced") invalid = 1; next }
  $1 == "WRITE_QUIESCE_EVIDENCE_SHA256" { quiesce += 1; next }
  { invalid = 1 }
  END { exit invalid || NR != 4 || schema != 1 || snapshot != 1 || consistency != 1 || quiesce != 1 }
' "$metadata_path"; then
  echo "BACKUP_METADATA_INVALID"
  exit 1
fi
snapshot_started_at=$(awk -F= '$1 == "SNAPSHOT_STARTED_AT_UTC" { sub(/^[^=]*=/, ""); print; exit }' "$metadata_path")
consistency_mode=$(awk -F= '$1 == "CONSISTENCY_MODE" { sub(/^[^=]*=/, ""); print; exit }' "$metadata_path")
quiesce_sha256=$(awk -F= '$1 == "WRITE_QUIESCE_EVIDENCE_SHA256" { sub(/^[^=]*=/, ""); print; exit }' "$metadata_path")
if [ "$snapshot_started_at" != "$last_success_at" ]; then
  echo "BACKUP_SNAPSHOT_STATUS_MISMATCH"
  exit 1
fi
case "$consistency_mode" in
  best-effort)
    [ "$quiesce_sha256" = "NONE" ] || { echo "BACKUP_METADATA_INVALID"; exit 1; }
    ;;
  quiesced)
    [[ "$quiesce_sha256" =~ ^[a-f0-9]{64}$ ]] || { echo "BACKUP_METADATA_INVALID"; exit 1; }
    ;;
esac

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
