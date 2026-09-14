#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  echo "Usage: deploy-preproduction.sh --release-dir DIR --env-file FILE --project-name NAME [--dry-run]" >&2
  exit 2
}

release_dir=""
env_file=""
project_name=""
dry_run="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --release-dir) release_dir="${2:-}"; shift 2 ;;
    --env-file) env_file="${2:-}"; shift 2 ;;
    --project-name) project_name="${2:-}"; shift 2 ;;
    --dry-run) dry_run="true"; shift ;;
    *) usage ;;
  esac
done
[ -n "$release_dir" ] && [ -n "$env_file" ] && [ -n "$project_name" ] || usage
[[ "$project_name" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || { echo "DEPLOY_PROJECT_NAME_INVALID" >&2; exit 2; }

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
project_root="$(CDPATH= cd -- "$script_dir/.." && pwd -P)"
release_dir="$(realpath -- "$release_dir")"
env_file="$(realpath -- "$env_file")"
manifest="$release_dir/release-manifest.json"
manifest_bundle="$release_dir/release-manifest.attestation.json"
[ -f "$manifest" ] && [ ! -L "$manifest" ] || { echo "DEPLOY_MANIFEST_MISSING" >&2; exit 1; }
[ -f "$manifest_bundle" ] && [ ! -L "$manifest_bundle" ] || { echo "DEPLOY_MANIFEST_BUNDLE_MISSING" >&2; exit 1; }
[ -f "$env_file" ] && [ ! -L "$env_file" ] || { echo "DEPLOY_ENV_FILE_INVALID" >&2; exit 1; }
env_mode="$(stat -c '%a' "$env_file")"
[[ "$env_mode" =~ ^[0-7]{3,4}$ ]] || { echo "DEPLOY_ENV_FILE_MODE_INVALID" >&2; exit 1; }
(( (8#$env_mode & 0037) == 0 )) || { echo "DEPLOY_ENV_FILE_TOO_PERMISSIVE" >&2; exit 1; }

for command in node docker cosign curl sha256sum; do
  command -v "$command" >/dev/null 2>&1 || { echo "DEPLOY_COMMAND_MISSING:$command" >&2; exit 1; }
done
docker compose version >/dev/null

cosign verify-blob-attestation \
  --bundle "$manifest_bundle" \
  --certificate-identity-regexp '^https://github\.com/Zhanyanzhou/haichuan/\.github/workflows/release-images\.yml@refs/heads/(main|release/[A-Za-z0-9._/-]+)$' \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  --type slsaprovenance1 \
  "$manifest" >/dev/null

declare SERVER_IMAGE_NAME SERVER_IMAGE_DIGEST CLIENT_IMAGE_NAME CLIENT_IMAGE_DIGEST
declare OPERATIONS_IMAGE_NAME OPERATIONS_IMAGE_DIGEST RELEASE_GIT_SHA RELEASE_SOURCE
declare MIGRATION_BUNDLE_SHA256 PUBLIC_SEO_CONTENT_READY PUBLIC_SEO_SOURCE_KIND INITIAL_CUTOVER_AUTHORIZED
prepare_output="$(node "$project_root/scripts/prepare-preproduction-deploy.mjs" --manifest "$manifest" --env-file "$env_file")"
while IFS='=' read -r key value; do
  case "$key" in
    SERVER_IMAGE_NAME|SERVER_IMAGE_DIGEST|CLIENT_IMAGE_NAME|CLIENT_IMAGE_DIGEST|OPERATIONS_IMAGE_NAME|OPERATIONS_IMAGE_DIGEST|RELEASE_GIT_SHA|RELEASE_SOURCE|MIGRATION_BUNDLE_SHA256|PUBLIC_SEO_CONTENT_READY|PUBLIC_SEO_SOURCE_KIND|INITIAL_CUTOVER_AUTHORIZED)
      printf -v "$key" '%s' "$value" ;;
    *) echo "DEPLOY_PREPARE_OUTPUT_INVALID" >&2; exit 1 ;;
  esac
done <<< "$prepare_output"

export SERVER_IMAGE_NAME SERVER_IMAGE_DIGEST CLIENT_IMAGE_NAME CLIENT_IMAGE_DIGEST
export OPERATIONS_IMAGE_NAME OPERATIONS_IMAGE_DIGEST RELEASE_GIT_SHA RELEASE_SOURCE MIGRATION_BUNDLE_SHA256
compose=(docker compose --project-name "$project_name" --env-file "$env_file" -f "$project_root/docker-compose.yml")
operations_compose=("${compose[@]}" -f "$project_root/docker-compose.operations.yml" --profile operations)

mapfile -t configured_images < <("${compose[@]}" config --images)
for image in "${configured_images[@]}"; do
  [[ "$image" == *@sha256:* ]] || { echo "DEPLOY_FLOATING_IMAGE_REFUSED" >&2; exit 1; }
done

echo "DEPLOY_PREFLIGHT_OK stage=preproduction sha=$RELEASE_GIT_SHA contentReady=$PUBLIC_SEO_CONTENT_READY source=$PUBLIC_SEO_SOURCE_KIND"
if [ "$dry_run" = "true" ]; then
  echo "DEPLOY_DRY_RUN_OK"
  exit 0
fi

previous_server="$(docker inspect --format '{{.Config.Image}}' jewelry-server 2>/dev/null || true)"
previous_client="$(docker inspect --format '{{.Config.Image}}' jewelry-client 2>/dev/null || true)"
previous_operations="$(docker inspect --format '{{.Config.Image}}' jewelry-backup 2>/dev/null || true)"
rollback_available="true"
for reference in "$previous_server" "$previous_client" "$previous_operations"; do
  [[ "$reference" == *@sha256:* ]] || rollback_available="false"
done
if [ "$rollback_available" != "true" ] && [ "$INITIAL_CUTOVER_AUTHORIZED" != "true" ]; then
  echo "DEPLOY_INITIAL_SIGNED_CUTOVER_AUTHORIZATION_REQUIRED" >&2
  exit 1
fi

mutation_started="false"
safe_home_file="$(mktemp /tmp/haichuan-preproduction-home.XXXXXX)"
cleanup() { rm -f -- "$safe_home_file"; }
rollback_on_error() {
  exit_code=$?
  cleanup
  if [ "$mutation_started" = "true" ] && [ "$rollback_available" = "true" ]; then
    export SERVER_IMAGE_NAME="${previous_server%@sha256:*}" SERVER_IMAGE_DIGEST="${previous_server##*@sha256:}"
    export CLIENT_IMAGE_NAME="${previous_client%@sha256:*}" CLIENT_IMAGE_DIGEST="${previous_client##*@sha256:}"
    export OPERATIONS_IMAGE_NAME="${previous_operations%@sha256:*}" OPERATIONS_IMAGE_DIGEST="${previous_operations##*@sha256:}"
    if "${compose[@]}" up -d --no-deps --wait server client backup; then
      echo "DEPLOY_ROLLBACK_OK" >&2
    else
      echo "DEPLOY_ROLLBACK_FAILED_MANUAL_ACTION_REQUIRED" >&2
    fi
  elif [ "$mutation_started" = "true" ]; then
    echo "DEPLOY_ROLLBACK_UNAVAILABLE_INITIAL_CUTOVER" >&2
  fi
  exit "$exit_code"
}
trap rollback_on_error ERR
trap cleanup EXIT

if docker inspect jewelry-backup >/dev/null 2>&1; then
  backup_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' jewelry-backup)"
  [ "$backup_health" = "healthy" ] || { echo "DEPLOY_BACKUP_NOT_HEALTHY" >&2; exit 1; }
fi

docker pull "$SERVER_IMAGE_NAME@sha256:$SERVER_IMAGE_DIGEST" >/dev/null
docker pull "$CLIENT_IMAGE_NAME@sha256:$CLIENT_IMAGE_DIGEST" >/dev/null
docker pull "$OPERATIONS_IMAGE_NAME@sha256:$OPERATIONS_IMAGE_DIGEST" >/dev/null

"${operations_compose[@]}" run --rm migration-status
if [ "$PUBLIC_SEO_CONTENT_READY" = "true" ]; then
  "${operations_compose[@]}" run --rm release-preflight
else
  echo "DEPLOY_CONTENT_PREFLIGHT_SKIPPED reason=signed-safe-fallback"
fi

mutation_started="true"
"${compose[@]}" up -d --no-deps --wait server client backup
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8081/ >"$safe_home_file"
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8081/api/ready >/dev/null
if [ "$PUBLIC_SEO_CONTENT_READY" = "false" ]; then
  grep -F 'data-content-ready="false"' "$safe_home_file" >/dev/null \
    || { echo "DEPLOY_SAFE_FALLBACK_MARKER_MISSING" >&2; exit 1; }
  curl --fail --silent --show-error --head --max-time 10 http://127.0.0.1:8081/ \
    | tr -d '\r' | grep -i '^X-Robots-Tag:.*noindex' >/dev/null \
    || { echo "DEPLOY_SAFE_FALLBACK_NOINDEX_MISSING" >&2; exit 1; }
fi
mutation_started="false"
cleanup
echo "DEPLOY_OK stage=preproduction sha=$RELEASE_GIT_SHA contentReady=$PUBLIC_SEO_CONTENT_READY"
