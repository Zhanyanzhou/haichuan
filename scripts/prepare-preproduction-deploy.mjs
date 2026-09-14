import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_SOURCE = "https://github.com/Zhanyanzhou/haichuan";
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
const COMPONENTS = ["server", "client", "operations"];
const DISABLED_GATES = [
  "CUSTOMER_COMMERCE_ENABLED",
  "CUSTOMER_QUOTATION_ORDERING_ENABLED",
  "PARTNER_APPLICATIONS_WRITE_ENABLED",
  "NOTIFICATION_DELIVERY_ENABLED",
  "PAYMENT_GATEWAY_TRANSACTIONS_ENABLED",
  "PAYMENT_GATEWAY_REFUNDS_ENABLED",
  "ANALYTICS_INGESTION_ENABLED",
];

function fail(code) {
  throw new Error(code);
}

function exact(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code);
}

function parseDotEnv(source) {
  const values = new Map();
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

export function validatePreproductionDeployInputs(manifest, envSource) {
  exact(manifest, [
    "schemaVersion", "releaseStage", "imageTag", "gitSha", "migrationBundleSha256", "source",
    "qualityGate", "attestationPolicy", "publicSeo", "server", "client", "operations",
  ], "PREPRODUCTION_DEPLOY_MANIFEST_SCHEMA_INVALID");
  if (manifest.schemaVersion !== 6 || manifest.releaseStage !== "preproduction" || manifest.source !== EXPECTED_SOURCE
      || !SHA.test(manifest.gitSha ?? "") || manifest.imageTag !== `preproduction-sha-${manifest.gitSha}`
      || !/^[a-f0-9]{64}$/.test(manifest.migrationBundleSha256 ?? "")) {
    fail("PREPRODUCTION_DEPLOY_MANIFEST_IDENTITY_INVALID");
  }
  exact(manifest.publicSeo, [
    "sourceStage", "snapshotHash", "prerenderManifestSha256", "sourceArtifactId",
    "sourceArtifactDigest", "sourceKind", "contentReady",
  ], "PREPRODUCTION_DEPLOY_CONTENT_SCHEMA_INVALID");
  const seo = manifest.publicSeo;
  if (seo.sourceStage !== "preproduction" || typeof seo.contentReady !== "boolean"
      || !/^[a-f0-9]{64}$/.test(seo.snapshotHash ?? "") || !DIGEST.test(seo.sourceArtifactDigest ?? "")) {
    fail("PREPRODUCTION_DEPLOY_CONTENT_INVALID");
  }
  if (seo.sourceKind === "safe-fallback") {
    if (seo.contentReady || seo.sourceArtifactId !== 0) fail("PREPRODUCTION_DEPLOY_FALLBACK_INVALID");
  } else if (seo.sourceKind === "approved-snapshot") {
    if (!seo.contentReady || !Number.isSafeInteger(seo.sourceArtifactId) || seo.sourceArtifactId <= 0) {
      fail("PREPRODUCTION_DEPLOY_APPROVED_CONTENT_INVALID");
    }
  } else fail("PREPRODUCTION_DEPLOY_CONTENT_SOURCE_INVALID");

  const imageValues = {};
  for (const component of COMPONENTS) {
    const entry = manifest[component];
    const expectedImage = `ghcr.io/zhanyanzhou/haichuan-preproduction-${component}`;
    if (!entry || entry.image !== expectedImage || !DIGEST.test(entry.digest ?? "")
        || entry.reference !== `${entry.image}@${entry.digest}`) {
      fail(`PREPRODUCTION_DEPLOY_${component.toUpperCase()}_IMAGE_INVALID`);
    }
    imageValues[`${component.toUpperCase()}_IMAGE_NAME`] = entry.image;
    imageValues[`${component.toUpperCase()}_IMAGE_DIGEST`] = entry.digest.slice("sha256:".length);
  }

  const env = parseDotEnv(envSource);
  for (const key of DISABLED_GATES) {
    const value = (env.get(key) ?? "false").toLowerCase();
    if (value !== "false") fail(`PREPRODUCTION_DEPLOY_UNSAFE_GATE:${key}`);
  }
  if ((env.get("RELEASE_PROFILE") ?? "lead-generation") !== "lead-generation") {
    fail("PREPRODUCTION_DEPLOY_RELEASE_PROFILE_INVALID");
  }
  return {
    ...imageValues,
    RELEASE_GIT_SHA: manifest.gitSha,
    RELEASE_SOURCE: manifest.source,
    MIGRATION_BUNDLE_SHA256: manifest.migrationBundleSha256,
    PUBLIC_SEO_CONTENT_READY: String(seo.contentReady),
    PUBLIC_SEO_SOURCE_KIND: seo.sourceKind,
    INITIAL_CUTOVER_AUTHORIZED: env.get("PREPRODUCTION_INITIAL_SIGNED_CUTOVER_AUTHORIZED") === "1" ? "true" : "false",
  };
}

function parseArguments(argv) {
  const manifestIndex = argv.indexOf("--manifest");
  const envIndex = argv.indexOf("--env-file");
  if (manifestIndex < 0 || envIndex < 0 || !argv[manifestIndex + 1] || !argv[envIndex + 1] || argv.length !== 4) {
    fail("PREPRODUCTION_DEPLOY_ARGUMENTS_INVALID");
  }
  return { manifest: resolve(argv[manifestIndex + 1]), envFile: resolve(argv[envIndex + 1]) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = validatePreproductionDeployInputs(
      JSON.parse(readFileSync(options.manifest, "utf8")),
      readFileSync(options.envFile, "utf8"),
    );
    for (const [key, value] of Object.entries(result)) process.stdout.write(`${key}=${value}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "PREPRODUCTION_DEPLOY_PREPARE_FAILED"}\n`);
    process.exitCode = 1;
  }
}
