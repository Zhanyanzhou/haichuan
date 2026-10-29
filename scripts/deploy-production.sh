#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  echo "Usage: deploy-production.sh --release-dir DIR --expected-manifest-sha256 SHA256 --env-file FILE --project-name NAME [--dry-run]" >&2
  exit 2
}

release_dir=""
env_file=""
project_name=""
expected_manifest_sha256=""
dry_run="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --release-dir) release_dir="${2:-}"; shift 2 ;;
    --expected-manifest-sha256) expected_manifest_sha256="${2:-}"; shift 2 ;;
    --env-file) env_file="${2:-}"; shift 2 ;;
    --project-name) project_name="${2:-}"; shift 2 ;;
    --dry-run) dry_run="true"; shift ;;
    *) usage ;;
  esac
done
[ -n "$release_dir" ] && [ -n "$expected_manifest_sha256" ] && [ -n "$env_file" ] && [ -n "$project_name" ] || usage
[[ "$expected_manifest_sha256" =~ ^[a-f0-9]{64}$ ]] || { echo "DEPLOY_EXPECTED_MANIFEST_SHA256_INVALID" >&2; exit 2; }
[[ "$project_name" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || { echo "DEPLOY_PROJECT_NAME_INVALID" >&2; exit 2; }

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
project_root="$(CDPATH= cd -- "$script_dir/.." && pwd -P)"
release_dir="$(realpath -- "$release_dir")"
env_file="$(realpath -- "$env_file")"
manifest="$release_dir/release-manifest.json"
manifest_bundle="$release_dir/release-manifest.attestation.json"
[ -f "$manifest" ] && [ ! -L "$manifest" ] || { echo "DEPLOY_MANIFEST_MISSING" >&2; exit 1; }
[ -f "$manifest_bundle" ] && [ ! -L "$manifest_bundle" ] || { echo "DEPLOY_MANIFEST_BUNDLE_INVALID" >&2; exit 1; }
[ -f "$env_file" ] && [ ! -L "$env_file" ] || { echo "DEPLOY_ENV_FILE_INVALID" >&2; exit 1; }
env_mode="$(stat -c '%a' "$env_file")"
[[ "$env_mode" =~ ^[0-7]{3,4}$ ]] || { echo "DEPLOY_ENV_FILE_MODE_INVALID" >&2; exit 1; }
(( (8#$env_mode & 0037) == 0 )) || { echo "DEPLOY_ENV_FILE_TOO_PERMISSIVE" >&2; exit 1; }

for command in node docker curl cosign realpath stat mktemp; do
  command -v "$command" >/dev/null 2>&1 || { echo "DEPLOY_COMMAND_MISSING:$command" >&2; exit 1; }
done
docker compose version >/dev/null

declare SERVER_IMAGE_NAME SERVER_IMAGE_DIGEST CLIENT_IMAGE_NAME CLIENT_IMAGE_DIGEST
declare OPERATIONS_IMAGE_NAME OPERATIONS_IMAGE_DIGEST RELEASE_GIT_SHA RELEASE_SOURCE
declare MIGRATION_BUNDLE_SHA256 RELEASE_PROFILE ASSURANCE_LEVEL PUBLIC_SEO_CONTENT_READY PUBLIC_SEO_SOURCE_KIND
declare PUBLIC_SEO_ORIGIN INITIAL_CUTOVER_AUTHORIZED MYSQL_VOLUME_NAME UPLOADS_VOLUME_NAME PRIVATE_MEDIA_VOLUME_NAME
declare PUBLIC_SEO_PAGE_HASH_HOME PUBLIC_SEO_PAGE_HASH_ABOUT PUBLIC_SEO_PAGE_HASH_PRODUCTS
declare PUBLIC_SEO_PAGE_HASH_CATALOG PUBLIC_SEO_PAGE_HASH_CUSTOM PUBLIC_SEO_PAGE_HASH_CONTACT
prepare_output="$(node "$project_root/scripts/prepare-production-deploy.mjs" \
  --manifest "$manifest" \
  --expected-manifest-sha256 "$expected_manifest_sha256" \
  --env-file "$env_file")"
while IFS='=' read -r key value; do
  case "$key" in
    SERVER_IMAGE_NAME|SERVER_IMAGE_DIGEST|CLIENT_IMAGE_NAME|CLIENT_IMAGE_DIGEST|OPERATIONS_IMAGE_NAME|OPERATIONS_IMAGE_DIGEST|RELEASE_GIT_SHA|RELEASE_SOURCE|MIGRATION_BUNDLE_SHA256|RELEASE_PROFILE|ASSURANCE_LEVEL|PUBLIC_SEO_CONTENT_READY|PUBLIC_SEO_SOURCE_KIND|PUBLIC_SEO_ORIGIN|PUBLIC_SEO_PAGE_HASH_HOME|PUBLIC_SEO_PAGE_HASH_ABOUT|PUBLIC_SEO_PAGE_HASH_PRODUCTS|PUBLIC_SEO_PAGE_HASH_CATALOG|PUBLIC_SEO_PAGE_HASH_CUSTOM|PUBLIC_SEO_PAGE_HASH_CONTACT|MYSQL_VOLUME_NAME|UPLOADS_VOLUME_NAME|PRIVATE_MEDIA_VOLUME_NAME|INITIAL_CUTOVER_AUTHORIZED)
      printf -v "$key" '%s' "$value" ;;
    *) echo "DEPLOY_PREPARE_OUTPUT_INVALID" >&2; exit 1 ;;
  esac
done <<< "$prepare_output"
[ "$ASSURANCE_LEVEL" = "high" ] && [ "$PUBLIC_SEO_CONTENT_READY" = "true" ] && [ "$PUBLIC_SEO_SOURCE_KIND" = "approved-snapshot" ] \
  || { echo "DEPLOY_PRODUCTION_CONTENT_OR_ASSURANCE_INVALID" >&2; exit 1; }
public_seo_host="$(node -e 'process.stdout.write(new URL(process.argv[1]).host)' "$PUBLIC_SEO_ORIGIN")"
release_source_ref="$(node -e 'const m=require(process.argv[1]); process.stdout.write(m.attestationPolicy.sourceRef)' "$manifest")"
signer_identity="$(node -e 'const m=require(process.argv[1]); process.stdout.write(m.attestationPolicy.signerIdentity)' "$manifest")"
identity_args=(
  --certificate-identity "$signer_identity"
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
  --certificate-github-workflow-trigger "workflow_dispatch"
  --certificate-github-workflow-sha "$RELEASE_GIT_SHA"
  --certificate-github-workflow-repository "Zhanyanzhou/haichuan"
  --certificate-github-workflow-ref "$release_source_ref"
)

cosign verify-blob-attestation \
  --bundle "$manifest_bundle" \
  "${identity_args[@]}" \
  --type slsaprovenance1 \
  "$manifest" >/dev/null
for component in server client operations; do
  name_variable="${component^^}_IMAGE_NAME"
  digest_variable="${component^^}_IMAGE_DIGEST"
  reference="${!name_variable}@sha256:${!digest_variable}"
  for kind in image provenance sbom; do
    case "$kind" in
      image) predicate_type="https://sigstore.dev/cosign/sign/v1" ;;
      provenance) predicate_type="slsaprovenance1" ;;
      sbom) predicate_type="spdxjson" ;;
    esac
    cosign verify-blob-attestation \
      --bundle "$release_dir/attestations/${component}-${kind}.sigstore.json" \
      "${identity_args[@]}" \
      --digest "${!digest_variable}" --digestAlg sha256 \
      --type "$predicate_type" >/dev/null
  done
done

RELEASE_DIR="$release_dir" MANIFEST_PATH="$manifest" \
SERVER_REFERENCE="$SERVER_IMAGE_NAME@sha256:$SERVER_IMAGE_DIGEST" \
CLIENT_REFERENCE="$CLIENT_IMAGE_NAME@sha256:$CLIENT_IMAGE_DIGEST" \
OPERATIONS_REFERENCE="$OPERATIONS_IMAGE_NAME@sha256:$OPERATIONS_IMAGE_DIGEST" \
node --input-type=module <<'NODE'
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const manifest = JSON.parse(readFileSync(process.env.MANIFEST_PATH, "utf8"));
const expectedMediaType = "application/vnd.dev.sigstore.bundle.v0.3+json";
const readBundle = (path) => {
  const bundle = JSON.parse(readFileSync(path, "utf8"));
  if (bundle?.mediaType !== expectedMediaType) throw new Error(`PRODUCTION_SIGSTORE_BUNDLE_FORMAT_INVALID:${path}`);
  return bundle;
};
const statement = (bundle, code) => {
  const payload = bundle?.dsseEnvelope?.payload;
  if (typeof payload !== "string" || !payload) throw new Error(`${code}_PAYLOAD_MISSING`);
  return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
};
const hasSubject = (value, digest) => value.subject?.some((entry) => entry?.digest?.sha256 === digest);
const policy = manifest.attestationPolicy;
const expectedBuilder = policy.signerIdentity;
const references = {
  server: process.env.SERVER_REFERENCE,
  client: process.env.CLIENT_REFERENCE,
  operations: process.env.OPERATIONS_REFERENCE,
};
for (const component of ["server", "client", "operations"]) {
  const expectedDigest = references[component].split("@sha256:")[1];
  const signature = statement(readBundle(join(process.env.RELEASE_DIR, "attestations", `${component}-image.sigstore.json`)), "PRODUCTION_IMAGE_SIGNATURE");
  if (signature?.predicateType !== "https://sigstore.dev/cosign/sign/v1" || !hasSubject(signature, expectedDigest)) {
    throw new Error(`PRODUCTION_IMAGE_SIGNATURE_SUBJECT_INVALID:${component}`);
  }
  const provenance = statement(readBundle(join(process.env.RELEASE_DIR, "attestations", `${component}-provenance.sigstore.json`)), "PRODUCTION_PROVENANCE");
  const parameters = provenance?.predicate?.buildDefinition?.externalParameters;
  if (provenance?.predicateType !== "https://slsa.dev/provenance/v1" || !hasSubject(provenance, expectedDigest)
      || parameters?.component !== component || parameters?.source !== manifest.source
      || parameters?.releaseStage !== "production" || parameters?.imageTag !== manifest.imageTag
      || parameters?.sourceRef !== policy.sourceRef || parameters?.gitSha !== manifest.gitSha
      || provenance?.predicate?.runDetails?.builder?.id !== expectedBuilder) {
    throw new Error(`PRODUCTION_PROVENANCE_CONTENT_INVALID:${component}`);
  }
  const sbom = statement(readBundle(join(process.env.RELEASE_DIR, "attestations", `${component}-sbom.sigstore.json`)), "PRODUCTION_SBOM");
  if (sbom?.predicateType !== "https://spdx.dev/Document" || !hasSubject(sbom, expectedDigest)
      || sbom?.predicate?.spdxVersion !== "SPDX-2.3" || sbom?.predicate?.SPDXID !== "SPDXRef-DOCUMENT") {
    throw new Error(`PRODUCTION_SBOM_CONTENT_INVALID:${component}`);
  }
}
const manifestStatement = statement(readBundle(join(process.env.RELEASE_DIR, "release-manifest.attestation.json")), "PRODUCTION_MANIFEST");
const manifestDigest = createHash("sha256").update(readFileSync(process.env.MANIFEST_PATH)).digest("hex");
const predicate = manifestStatement?.predicate;
const parameters = predicate?.buildDefinition?.externalParameters;
const expectedBuildType = `${manifest.source}/blob/${manifest.gitSha}/.github/workflows/release-images.yml#release-manifest-v9`;
if (manifestStatement?.predicateType !== "https://slsa.dev/provenance/v1" || !hasSubject(manifestStatement, manifestDigest)
    || predicate?.buildDefinition?.buildType !== expectedBuildType
    || parameters?.gitSha !== manifest.gitSha || parameters?.sourceRef !== policy.sourceRef
    || parameters?.qualityGateRunId !== manifest.qualityGate.runId || parameters?.schemaVersion !== 9
    || parameters?.publicSeoOrigin !== manifest.publicSeo.origin || parameters?.assuranceLevel !== "high"
    || parameters?.releaseStage !== "production" || parameters?.imageTag !== manifest.imageTag
    || predicate?.runDetails?.builder?.id !== expectedBuilder) {
  throw new Error("PRODUCTION_MANIFEST_PROVENANCE_CONTENT_INVALID");
}
const expectedDependencies = new Set([
  `${manifest.source}@git:${manifest.gitSha}`,
  references.server,
  references.client,
  references.operations,
]);
const resolvedDependencies = predicate?.buildDefinition?.resolvedDependencies ?? [];
const actualDependencies = new Set(resolvedDependencies.map((dependency) => dependency.digest?.gitCommit
  ? `${dependency.uri}@git:${dependency.digest.gitCommit}`
  : `${dependency.uri}@sha256:${dependency.digest?.sha256}`));
if (resolvedDependencies.length !== expectedDependencies.size || actualDependencies.size !== expectedDependencies.size
    || [...expectedDependencies].some((dependency) => !actualDependencies.has(dependency))) {
  throw new Error("PRODUCTION_MANIFEST_PROVENANCE_DEPENDENCIES_INVALID");
}
NODE

export SERVER_IMAGE_NAME SERVER_IMAGE_DIGEST CLIENT_IMAGE_NAME CLIENT_IMAGE_DIGEST
export OPERATIONS_IMAGE_NAME OPERATIONS_IMAGE_DIGEST RELEASE_GIT_SHA RELEASE_SOURCE MIGRATION_BUNDLE_SHA256
export RELEASE_PROFILE PUBLIC_SEO_PAGE_HASH_HOME PUBLIC_SEO_PAGE_HASH_ABOUT PUBLIC_SEO_PAGE_HASH_PRODUCTS
export PUBLIC_SEO_PAGE_HASH_CATALOG PUBLIC_SEO_PAGE_HASH_CUSTOM PUBLIC_SEO_PAGE_HASH_CONTACT
compose=(docker compose --project-name "$project_name" --env-file "$env_file" -f "$project_root/docker-compose.yml")
operations_compose=("${compose[@]}" -f "$project_root/docker-compose.operations.yml" --profile operations)
mapfile -t configured_images < <("${operations_compose[@]}" config --images)
for image in "${configured_images[@]}"; do
  [[ "$image" == *@sha256:* ]] || { echo "DEPLOY_FLOATING_IMAGE_REFUSED" >&2; exit 1; }
done

echo "DEPLOY_PREFLIGHT_OK stage=production assurance=high sha=$RELEASE_GIT_SHA contentReady=true source=approved-snapshot"
if [ "$dry_run" = "true" ]; then
  echo "DEPLOY_DRY_RUN_OK"
  exit 0
fi

snapshot_file="$(mktemp /tmp/haichuan-production-seo.XXXXXX)"
headers_file="$(mktemp /tmp/haichuan-production-headers.XXXXXX)"
cleanup() { rm -f -- "$snapshot_file" "$headers_file"; }
trap cleanup EXIT

previous_server=""
previous_client=""
previous_operations=""
previous_release_sha=""
previous_release_source=""
previous_migration_bundle=""
previous_count=0
previous_production="false"
previous_identity_valid="true"
for specification in server:jewelry-server:server client:jewelry-client:client operations:jewelry-backup:backup; do
  IFS=: read -r component container service <<< "$specification"
  if docker inspect "$container" >/dev/null 2>&1; then
    previous_count=$((previous_count + 1))
    record="$(docker inspect --format '{{.Config.Image}}{{"\t"}}{{index .Config.Labels "com.docker.compose.project"}}{{"\t"}}{{index .Config.Labels "com.docker.compose.service"}}{{"\t"}}{{index .Config.Labels "io.haichuan.component"}}{{"\t"}}{{index .Config.Labels "org.opencontainers.image.revision"}}{{"\t"}}{{index .Config.Labels "org.opencontainers.image.source"}}{{"\t"}}{{index .Config.Labels "io.haichuan.migration-bundle-sha256"}}' "$container")"
    IFS=$'\t' read -r reference project service_label component_label revision source migration <<< "$record"
    if [[ ! "$reference" =~ ^ghcr\.io/zhanyanzhou/haichuan-${component}@sha256:[a-f0-9]{64}$ ]] \
        || [ "$project" != "$project_name" ] || [ "$service_label" != "$service" ] || [ "$component_label" != "$component" ] \
        || [[ ! "$revision" =~ ^[a-f0-9]{40}$ ]] || [ "$source" != "$RELEASE_SOURCE" ] || [[ ! "$migration" =~ ^[a-f0-9]{64}$ ]]; then
      previous_identity_valid="false"
    else
      printf -v "previous_${component}" '%s' "$reference"
      if [ "$component" = "server" ]; then
        previous_release_sha="$revision"
        previous_release_source="$source"
        previous_migration_bundle="$migration"
      elif [ "$revision" != "$previous_release_sha" ] || [ "$source" != "$previous_release_source" ] || [ "$migration" != "$previous_migration_bundle" ]; then
        previous_identity_valid="false"
      fi
    fi
  fi
done
if [ "$previous_count" -eq 0 ]; then
  [ "$INITIAL_CUTOVER_AUTHORIZED" = "true" ] || { echo "DEPLOY_INITIAL_PRODUCTION_CUTOVER_AUTHORIZATION_REQUIRED" >&2; exit 1; }
elif [ "$previous_count" -ne 3 ] || [ "$previous_identity_valid" != "true" ]; then
  echo "DEPLOY_EXISTING_CONTAINERS_NOT_VERIFIABLE_PRODUCTION" >&2
  exit 1
else
  previous_production="true"
  [ "$INITIAL_CUTOVER_AUTHORIZED" != "true" ] || { echo "DEPLOY_INITIAL_CUTOVER_AUTHORIZATION_STALE" >&2; exit 1; }
fi

rollback_available="false"
if [ "$previous_production" = "true" ] && [ "$previous_migration_bundle" = "$MIGRATION_BUNDLE_SHA256" ]; then
  rollback_available="true"
elif [ "$previous_production" = "true" ]; then
  echo "DEPLOY_AUTOMATIC_ROLLBACK_DISABLED reason=schema-compatibility-unproven"
fi

mysql_present="false"
if docker inspect jewelry-mysql >/dev/null 2>&1; then
  mysql_present="true"
  mysql_identity="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}{{"\t"}}{{index .Config.Labels "com.docker.compose.service"}}' jewelry-mysql)"
  [ "$mysql_identity" = "$project_name"$'\t'"mysql" ] || { echo "DEPLOY_MYSQL_NOT_IN_PRODUCTION_PROJECT" >&2; exit 1; }
fi
if [ "$previous_production" = "true" ] && [ "$mysql_present" != "true" ]; then
  echo "DEPLOY_PREVIOUS_PRODUCTION_MYSQL_MISSING" >&2
  exit 1
fi
if [ "$mysql_present" = "true" ]; then
  mysql_volume="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/mysql"}}{{.Name}}{{end}}{{end}}' jewelry-mysql)"
  [ "$mysql_volume" = "$MYSQL_VOLUME_NAME" ] || { echo "DEPLOY_MYSQL_VOLUME_IDENTITY_MISMATCH" >&2; exit 1; }
fi
if [ "$previous_production" = "true" ]; then
  mounted_volumes="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{if eq .Destination "/app/private-media"}}{{.Name}}{{end}}{{end}}' jewelry-server)"
  expected_volumes="${UPLOADS_VOLUME_NAME}${PRIVATE_MEDIA_VOLUME_NAME}"
  [ "$mounted_volumes" = "$expected_volumes" ] || { echo "DEPLOY_MEDIA_VOLUME_IDENTITY_MISMATCH" >&2; exit 1; }
  backup_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' jewelry-backup)"
  [ "$backup_health" = "healthy" ] || { echo "DEPLOY_BACKUP_NOT_HEALTHY" >&2; exit 1; }
fi
docker volume inspect "$MYSQL_VOLUME_NAME" >/dev/null
docker volume inspect "$UPLOADS_VOLUME_NAME" >/dev/null
docker volume inspect "$PRIVATE_MEDIA_VOLUME_NAME" >/dev/null

mutation_started="false"
rollback_on_error() {
  exit_code=$?
  if [ "$mutation_started" = "true" ] && [ "$rollback_available" = "true" ]; then
    export SERVER_IMAGE_NAME="${previous_server%@sha256:*}" SERVER_IMAGE_DIGEST="${previous_server##*@sha256:}"
    export CLIENT_IMAGE_NAME="${previous_client%@sha256:*}" CLIENT_IMAGE_DIGEST="${previous_client##*@sha256:}"
    export OPERATIONS_IMAGE_NAME="${previous_operations%@sha256:*}" OPERATIONS_IMAGE_DIGEST="${previous_operations##*@sha256:}"
    export RELEASE_GIT_SHA="$previous_release_sha" RELEASE_SOURCE="$previous_release_source" MIGRATION_BUNDLE_SHA256="$previous_migration_bundle"
    if "${compose[@]}" up -d --no-deps --no-build --wait server client backup \
        && curl --fail --silent --show-error --max-time 10 --header "Host: ${public_seo_host}" http://127.0.0.1:8081/api/health >/dev/null \
        && curl --fail --silent --show-error --max-time 10 --header "Host: ${public_seo_host}" http://127.0.0.1:8081/api/ready >/dev/null; then
      echo "DEPLOY_ROLLBACK_RUNTIME_OK" >&2
    else
      echo "DEPLOY_ROLLBACK_FAILED_MANUAL_ACTION_REQUIRED" >&2
    fi
  elif [ "$mutation_started" = "true" ]; then
    echo "DEPLOY_ROLLBACK_UNAVAILABLE_MANUAL_ACTION_REQUIRED" >&2
  fi
  exit "$exit_code"
}
trap rollback_on_error ERR

for component in server client operations; do
  name_variable="${component^^}_IMAGE_NAME"
  digest_variable="${component^^}_IMAGE_DIGEST"
  docker pull "${!name_variable}@sha256:${!digest_variable}" >/dev/null
  reference="${!name_variable}@sha256:${!digest_variable}"
  [ "$(docker image inspect "$reference" --format '{{with .Config.Labels}}{{index . "org.opencontainers.image.revision"}}{{end}}')" = "$RELEASE_GIT_SHA" ] \
    || { echo "DEPLOY_IMAGE_REVISION_MISMATCH:$component" >&2; exit 1; }
  [ "$(docker image inspect "$reference" --format '{{with .Config.Labels}}{{index . "org.opencontainers.image.source"}}{{end}}')" = "$RELEASE_SOURCE" ] \
    || { echo "DEPLOY_IMAGE_SOURCE_MISMATCH:$component" >&2; exit 1; }
  [ "$(docker image inspect "$reference" --format '{{with .Config.Labels}}{{index . "io.haichuan.component"}}{{end}}')" = "$component" ] \
    || { echo "DEPLOY_IMAGE_COMPONENT_MISMATCH:$component" >&2; exit 1; }
  [ "$(docker image inspect "$reference" --format '{{with .Config.Labels}}{{index . "io.haichuan.migration-bundle-sha256"}}{{end}}')" = "$MIGRATION_BUNDLE_SHA256" ] \
    || { echo "DEPLOY_IMAGE_MIGRATION_MISMATCH:$component" >&2; exit 1; }
done
client_reference="$CLIENT_IMAGE_NAME@sha256:$CLIENT_IMAGE_DIGEST"
for label in public-seo-snapshot-sha256 public-seo-prerender-manifest-sha256 public-seo-source-artifact-digest public-seo-content-ready public-seo-source-kind; do
  actual="$(docker image inspect "$client_reference" --format "{{with .Config.Labels}}{{index . \"io.haichuan.${label}\"}}{{end}}")"
  expected="$(LABEL="$label" node -e 'const m=require(process.argv[1]); const keys={"public-seo-snapshot-sha256":"snapshotHash","public-seo-prerender-manifest-sha256":"prerenderManifestSha256","public-seo-source-artifact-digest":"sourceArtifactDigest","public-seo-content-ready":"contentReady","public-seo-source-kind":"sourceKind"}; process.stdout.write(String(m.publicSeo[keys[process.env.LABEL]]))' "$manifest")"
  [ "$actual" = "$expected" ] || { echo "DEPLOY_CLIENT_SEO_LABEL_MISMATCH:$label" >&2; exit 1; }
done

docker run --rm --entrypoint cat "$client_reference" /release/public-seo-snapshot.json >"$snapshot_file"
SNAPSHOT_PATH="$snapshot_file" MANIFEST_PATH="$manifest" node -e 'const fs=require("node:fs"); const snapshot=JSON.parse(fs.readFileSync(process.env.SNAPSHOT_PATH,"utf8")); const seo=JSON.parse(fs.readFileSync(process.env.MANIFEST_PATH,"utf8")).publicSeo; if(snapshot.snapshotHash!==seo.snapshotHash || snapshot.origin!==seo.origin || snapshot.sourceStage!=="production" || snapshot.contentReady!==true) process.exit(1)'
"${operations_compose[@]}" run --rm migration-status
"${operations_compose[@]}" run --rm release-preflight
if [ "$previous_production" = "true" ]; then
  node "$project_root/scripts/verify-public-page-sync.mjs" \
    --manifest "$manifest" \
    --base-url http://127.0.0.1:8081 \
    --mode api
else
  echo "DEPLOY_PREMUTATION_PAGE_SYNC_SKIPPED reason=authorized-initial-production-cutover"
fi

mutation_started="true"
"${compose[@]}" up -d --no-deps --no-build --wait server client backup
curl --fail --silent --show-error --max-time 10 --header "Host: ${public_seo_host}" http://127.0.0.1:8081/api/health >/dev/null
curl --fail --silent --show-error --max-time 10 --header "Host: ${public_seo_host}" http://127.0.0.1:8081/api/ready >/dev/null
node "$project_root/scripts/verify-public-page-sync.mjs" \
  --manifest "$manifest" \
  --base-url http://127.0.0.1:8081 \
  --mode full
node "$project_root/scripts/verify-public-seo-http.mjs" \
  --base-url http://127.0.0.1:8081 \
  --snapshot "$snapshot_file" \
  --require-representative
curl --fail --silent --show-error --head --max-time 10 --header "Host: ${public_seo_host}" http://127.0.0.1:8081/ >"$headers_file"
tr -d '\r' <"$headers_file" | grep -i '^Content-Security-Policy:.\+' >/dev/null
tr -d '\r' <"$headers_file" | grep -i '^X-Content-Type-Options: nosniff' >/dev/null
tr -d '\r' <"$headers_file" | grep -i '^Referrer-Policy:.\+' >/dev/null
tr -d '\r' <"$headers_file" | grep -i '^Permissions-Policy:.\+' >/dev/null
invalid_host_status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 --header 'Host: invalid.example' http://127.0.0.1:8081/)"
[ "$invalid_host_status" = "421" ] || { echo "DEPLOY_UNTRUSTED_HOST_NOT_REJECTED" >&2; exit 1; }
english_api_status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 --header "Host: ${public_seo_host}" 'http://127.0.0.1:8081/api/page-modules/document/published?pageKey=home&locale=en')"
case "$english_api_status" in 400|404) ;; *) echo "DEPLOY_RETIRED_ENGLISH_API_NOT_REJECTED" >&2; exit 1 ;; esac
mutation_started="false"
cleanup
echo "DEPLOY_OK stage=production assurance=high sha=$RELEASE_GIT_SHA contentReady=true"
