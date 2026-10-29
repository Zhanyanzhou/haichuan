import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { RELEASE_PROFILE_CONTRACT } from "./release-profile-contract.mjs";
import { normalizeProductionOrigin } from "./export-public-seo-snapshot.mjs";
import {
  validateReleaseEnvironment,
  validateReleaseManifest,
} from "./verify-release-images.mjs";

const EXPECTED_SOURCE = "https://github.com/Zhanyanzhou/haichuan";
const COMPONENTS = ["server", "client", "operations"];
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const DISABLED_GATES = [
  "CUSTOMER_COMMERCE_ENABLED",
  "CUSTOMER_QUOTATION_ORDERING_ENABLED",
  "PARTNER_APPLICATIONS_WRITE_ENABLED",
  "NOTIFICATION_DELIVERY_ENABLED",
  "PAYMENT_GATEWAY_TRANSACTIONS_ENABLED",
  "PAYMENT_GATEWAY_REFUNDS_ENABLED",
  "ANALYTICS_INGESTION_ENABLED",
];
const DISABLED_EXTERNAL_CONFIG = [
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
  "ALIYUN_SMS_ACCESS_KEY_ID",
  "ALIYUN_SMS_ACCESS_KEY_SECRET",
  "ALIYUN_SMS_SIGN_NAME",
  "ALIYUN_SMS_TEMPLATE_CODE",
];

function fail(code) {
  throw new Error(code);
}

function exact(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    fail(code);
  }
}

function parseDotEnv(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function verifyDescriptorFile(releaseDir, descriptor, expectedPath, code) {
  exact(descriptor, ["path", "sha256"], `${code}_DESCRIPTOR_INVALID`);
  if (descriptor.path !== expectedPath || !SHA256.test(descriptor.sha256 ?? "")) {
    fail(`${code}_DESCRIPTOR_INVALID`);
  }
  const filePath = resolve(releaseDir, descriptor.path);
  const within = relative(releaseDir, filePath);
  if (!within || within.startsWith("..") || isAbsolute(within)) fail(`${code}_PATH_INVALID`);
  let stat;
  let canonicalReleaseDir;
  let canonicalFilePath;
  try {
    stat = lstatSync(filePath);
    canonicalReleaseDir = realpathSync(releaseDir);
    canonicalFilePath = realpathSync(filePath);
  } catch {
    fail(`${code}_FILE_INVALID`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${code}_FILE_INVALID`);
  const withinCanonicalRoot = relative(canonicalReleaseDir, canonicalFilePath);
  if (!withinCanonicalRoot || withinCanonicalRoot.startsWith("..") || isAbsolute(withinCanonicalRoot)) {
    fail(`${code}_PATH_INVALID`);
  }
  if (sha256(readFileSync(filePath)) !== descriptor.sha256) fail(`${code}_HASH_MISMATCH`);
}

function bindImmutableEnvironment(env, key, expected) {
  if (env[key] && env[key] !== expected) fail(`PRODUCTION_DEPLOY_ENV_${key}_MANIFEST_MISMATCH`);
  env[key] = expected;
}

export function validateProductionDeployInputs(manifest, envSource, bundle = undefined) {
  exact(manifest, [
    "schemaVersion", "assuranceLevel", "releaseStage", "imageTag", "gitSha",
    "migrationBundleSha256", "source", "qualityGate", "releaseAuthorization",
    "attestationPolicy", "publicSeo", "server", "client", "operations",
  ], "PRODUCTION_DEPLOY_MANIFEST_SCHEMA_INVALID");
  if (manifest.schemaVersion !== 9 || manifest.assuranceLevel !== "high"
      || manifest.releaseStage !== "production" || manifest.source !== EXPECTED_SOURCE
      || !GIT_SHA.test(manifest.gitSha ?? "") || manifest.imageTag !== `sha-${manifest.gitSha}`
      || !SHA256.test(manifest.migrationBundleSha256 ?? "")) {
    fail("PRODUCTION_DEPLOY_MANIFEST_IDENTITY_INVALID");
  }
  validateReleaseManifest(manifest, {
    gitSha: manifest.gitSha,
    migrationBundleSha256: manifest.migrationBundleSha256,
    releaseStage: "production",
  });

  if (bundle) {
    if (!SHA256.test(bundle.expectedManifestSha256 ?? "")
        || sha256(bundle.manifestBytes) !== bundle.expectedManifestSha256) {
      fail("PRODUCTION_DEPLOY_MANIFEST_SHA256_MISMATCH");
    }
    for (const component of COMPONENTS) {
      const prefix = `PRODUCTION_DEPLOY_${component.toUpperCase()}`;
      verifyDescriptorFile(
        bundle.releaseDir,
        manifest[component].signatureBundle,
        `attestations/${component}-image.sigstore.json`,
        `${prefix}_SIGNATURE`,
      );
      verifyDescriptorFile(
        bundle.releaseDir,
        manifest[component].provenanceBundle,
        `attestations/${component}-provenance.sigstore.json`,
        `${prefix}_PROVENANCE`,
      );
      verifyDescriptorFile(
        bundle.releaseDir,
        manifest[component].sbomBundle,
        `attestations/${component}-sbom.sigstore.json`,
        `${prefix}_SBOM`,
      );
    }
  }

  const seo = manifest.publicSeo;
  if (seo.sourceStage !== "production" || seo.contentReady !== true
      || seo.sourceKind !== "approved-snapshot"
      || !Number.isSafeInteger(seo.sourceArtifactId) || seo.sourceArtifactId <= 0) {
    fail("PRODUCTION_DEPLOY_CONTENT_NOT_READY");
  }

  const imageValues = {};
  for (const component of COMPONENTS) {
    const entry = manifest[component];
    const expectedImage = `ghcr.io/zhanyanzhou/haichuan-${component}`;
    if (!entry || entry.image !== expectedImage || !DIGEST.test(entry.digest ?? "")
        || entry.reference !== `${entry.image}@${entry.digest}`) {
      fail(`PRODUCTION_DEPLOY_${component.toUpperCase()}_IMAGE_INVALID`);
    }
    imageValues[`${component.toUpperCase()}_IMAGE_NAME`] = entry.image;
    imageValues[`${component.toUpperCase()}_IMAGE_DIGEST`] = entry.digest.slice("sha256:".length);
  }

  const env = parseDotEnv(envSource);
  let deploymentOrigin;
  try {
    deploymentOrigin = normalizeProductionOrigin(env.VITE_PUBLIC_SITE_ORIGIN);
  } catch {
    fail("PRODUCTION_DEPLOY_PUBLIC_SITE_ORIGIN_INVALID");
  }
  if (deploymentOrigin !== seo.origin) fail("PRODUCTION_DEPLOY_PUBLIC_SITE_ORIGIN_MISMATCH");
  if (env.RELEASE_PROFILE !== RELEASE_PROFILE_CONTRACT.defaultProfile) {
    fail("PRODUCTION_DEPLOY_RELEASE_PROFILE_INVALID");
  }
  for (const key of DISABLED_GATES) {
    if ((env[key] ?? "false").toLowerCase() !== "false") {
      fail(`PRODUCTION_DEPLOY_UNSAFE_GATE:${key}`);
    }
  }
  for (const key of DISABLED_EXTERNAL_CONFIG) {
    if ((env[key] ?? "") !== "") fail(`PRODUCTION_DEPLOY_UNSAFE_EXTERNAL_CONFIG:${key}`);
  }
  if ((env.PAYMENT_PROVIDER_MODE ?? "disabled") !== "disabled") {
    fail("PRODUCTION_DEPLOY_UNSAFE_PAYMENT_PROVIDER_MODE");
  }
  const initialCutover = env.PRODUCTION_INITIAL_SIGNED_CUTOVER_AUTHORIZED ?? "0";
  if (!["0", "1"].includes(initialCutover)) {
    fail("PRODUCTION_DEPLOY_INITIAL_CUTOVER_AUTHORIZATION_INVALID");
  }

  for (const [key, value] of Object.entries(imageValues)) bindImmutableEnvironment(env, key, value);
  bindImmutableEnvironment(env, "RELEASE_GIT_SHA", manifest.gitSha);
  bindImmutableEnvironment(env, "RELEASE_SOURCE", manifest.source);
  bindImmutableEnvironment(env, "MIGRATION_BUNDLE_SHA256", manifest.migrationBundleSha256);
  validateReleaseEnvironment(env, manifest);

  return {
    ...imageValues,
    RELEASE_GIT_SHA: manifest.gitSha,
    RELEASE_SOURCE: manifest.source,
    MIGRATION_BUNDLE_SHA256: manifest.migrationBundleSha256,
    RELEASE_PROFILE: env.RELEASE_PROFILE,
    ASSURANCE_LEVEL: manifest.assuranceLevel,
    PUBLIC_SEO_CONTENT_READY: String(seo.contentReady),
    PUBLIC_SEO_SOURCE_KIND: seo.sourceKind,
    PUBLIC_SEO_ORIGIN: seo.origin,
    MYSQL_VOLUME_NAME: env.MYSQL_VOLUME_NAME,
    UPLOADS_VOLUME_NAME: env.UPLOADS_VOLUME_NAME,
    PRIVATE_MEDIA_VOLUME_NAME: env.PRIVATE_MEDIA_VOLUME_NAME,
    INITIAL_CUTOVER_AUTHORIZED: initialCutover === "1" ? "true" : "false",
    ...Object.fromEntries(seo.pageDocuments.map((page) => [
      `PUBLIC_SEO_PAGE_HASH_${page.pageKey.toUpperCase()}`,
      page.contentHash,
    ])),
  };
}

function parseArguments(argv) {
  const manifestIndex = argv.indexOf("--manifest");
  const envIndex = argv.indexOf("--env-file");
  const shaIndex = argv.indexOf("--expected-manifest-sha256");
  if (manifestIndex < 0 || envIndex < 0 || shaIndex < 0 || !argv[manifestIndex + 1]
      || !argv[envIndex + 1] || !argv[shaIndex + 1] || argv.length !== 6) {
    fail("PRODUCTION_DEPLOY_ARGUMENTS_INVALID");
  }
  return {
    manifest: resolve(argv[manifestIndex + 1]),
    envFile: resolve(argv[envIndex + 1]),
    expectedManifestSha256: argv[shaIndex + 1],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const manifestBytes = readFileSync(options.manifest);
    const result = validateProductionDeployInputs(
      JSON.parse(manifestBytes.toString("utf8")),
      readFileSync(options.envFile, "utf8"),
      {
        expectedManifestSha256: options.expectedManifestSha256,
        manifestBytes,
        releaseDir: dirname(options.manifest),
      },
    );
    for (const [key, value] of Object.entries(result)) process.stdout.write(`${key}=${value}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "PRODUCTION_DEPLOY_PREPARE_FAILED"}\n`);
    process.exitCode = 1;
  }
}
