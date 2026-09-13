import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  RELEASE_PROFILE_CONTRACT,
  requireReleaseProfile,
} from "./release-profile-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function walk(relativeDir, predicate) {
  const absoluteDir = path.join(root, relativeDir);
  const files = [];
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) files.push(...walk(relativePath, predicate));
    else if (predicate(relativePath)) files.push(relativePath);
  }
  return files;
}

function collectMatches(text, patterns) {
  const keys = new Set();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) keys.add(match[1]);
  }
  return keys;
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function serviceBlock(compose, service) {
  const startMatch = new RegExp(`^  ${service}:\\s*$`, "m").exec(compose);
  if (!startMatch) throw new Error(`docker-compose.yml 缺少 ${service} service`);
  const start = startMatch.index;
  const remainder = compose.slice(start + startMatch[0].length);
  const nextService = /^  [a-zA-Z0-9_-]+:\s*$/m.exec(remainder);
  return compose.slice(start, nextService ? start + startMatch[0].length + nextService.index : undefined);
}

function mappingKeys(block, mappingName) {
  const startMatch = new RegExp(`^    ${mappingName}:\\s*$`, "m").exec(block);
  if (!startMatch) return new Set();
  const start = startMatch.index + startMatch[0].length;
  const remainder = block.slice(start);
  const nextPeer = /^    [a-zA-Z0-9_-]+:\s*$/m.exec(remainder);
  const mapping = remainder.slice(0, nextPeer?.index);
  return collectMatches(mapping, [/^\s{6}([A-Z][A-Z0-9_]*):/gm]);
}

function sectionBody(block, sectionName) {
  const startMatch = new RegExp(`^    ${sectionName}:\\s*$`, "m").exec(block);
  if (!startMatch) return "";
  const start = startMatch.index + startMatch[0].length;
  const remainder = block.slice(start);
  const nextPeer = /^    [a-zA-Z0-9_-]+:\s*$/m.exec(remainder);
  return remainder.slice(0, nextPeer?.index);
}

function sequenceEntries(block, sequenceName) {
  return sectionBody(block, sequenceName)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

function unquoteYamlScalar(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function mappingValues(block, mappingName) {
  const body = sectionBody(block, mappingName);
  const values = new Map();
  for (const match of body.matchAll(/^\s{6}([A-Z][A-Z0-9_]*):\s*(.*?)\s*$/gm)) {
    values.set(match[1], unquoteYamlScalar(match[2]));
  }
  return values;
}

function longBindMounts(block) {
  const mounts = [];
  let current;
  let inBindOptions = false;
  for (const line of sectionBody(block, "volumes").split(/\r?\n/)) {
    const start = /^\s{6}-\s+type:\s*(\S+)\s*$/.exec(line);
    if (start) {
      current = { type: unquoteYamlScalar(start[1]) };
      mounts.push(current);
      inBindOptions = false;
      continue;
    }
    if (!current) continue;
    const property = /^\s{8}(source|target|read_only):\s*(.*?)\s*$/.exec(line);
    if (property) {
      current[property[1]] = unquoteYamlScalar(property[2]);
      inBindOptions = false;
      continue;
    }
    if (/^\s{8}bind:\s*$/.test(line)) {
      inBindOptions = true;
      continue;
    }
    const createHostPath = /^\s{10}create_host_path:\s*(\S+)\s*$/.exec(line);
    if (inBindOptions && createHostPath) {
      current.create_host_path = unquoteYamlScalar(createHostPath[1]);
    }
  }
  return mounts;
}

const wechatCertificateMountContract = [
  {
    runtimeKey: "WECHAT_PLATFORM_CERT_PATH",
    hostKey: "WECHAT_PLATFORM_CERT_HOST_PATH",
    target: "/run/secrets/wechat-pay/platform-cert.pem",
  },
  {
    runtimeKey: "WECHAT_MCH_PRIVATE_KEY_PATH",
    hostKey: "WECHAT_MCH_PRIVATE_KEY_HOST_PATH",
    target: "/run/secrets/wechat-pay/mch-private-key.pem",
  },
];

function validateWechatPaymentOverride(source) {
  const contractErrors = [];
  let serverBlock;
  try {
    serverBlock = serviceBlock(source, "server");
  } catch {
    return ["WECHAT_PAY_OVERRIDE_SERVER_SERVICE_MISSING"];
  }

  const environment = mappingValues(serverBlock, "environment");
  for (const { runtimeKey, target } of wechatCertificateMountContract) {
    if (environment.get(runtimeKey) !== target) {
      contractErrors.push(`WECHAT_PAY_OVERRIDE_FIXED_CONTAINER_PATH_REQUIRED:${runtimeKey}`);
    }
  }
  for (const forbiddenKey of [
    "CUSTOMER_COMMERCE_ENABLED",
    "PAYMENT_GATEWAY_TRANSACTIONS_ENABLED",
    "PAYMENT_GATEWAY_REFUNDS_ENABLED",
  ]) {
    if (environment.has(forbiddenKey)) {
      contractErrors.push(`WECHAT_PAY_OVERRIDE_MUST_NOT_ENABLE_TRANSACTIONS:${forbiddenKey}`);
    }
  }

  const mounts = longBindMounts(serverBlock);
  if (mounts.length !== wechatCertificateMountContract.length) {
    contractErrors.push("WECHAT_PAY_OVERRIDE_EXACT_MOUNT_COUNT_REQUIRED");
  }
  const sources = mounts.map((mount) => mount.source).filter(Boolean);
  if (new Set(sources).size !== sources.length) {
    contractErrors.push("WECHAT_PAY_OVERRIDE_MOUNT_SOURCES_MUST_BE_DISTINCT");
  }
  for (const { hostKey, target } of wechatCertificateMountContract) {
    const expectedSource = "${" + hostKey + ":?" + hostKey + " must be an absolute host file path}";
    const mount = mounts.find((candidate) => candidate.target === target);
    if (!mount) {
      contractErrors.push(`WECHAT_PAY_OVERRIDE_EXACT_FILE_TARGET_REQUIRED:${target}`);
      continue;
    }
    if (mount.type !== "bind") {
      contractErrors.push(`WECHAT_PAY_OVERRIDE_BIND_REQUIRED:${target}`);
    }
    if (mount.source !== expectedSource) {
      contractErrors.push(`WECHAT_PAY_OVERRIDE_REQUIRED_HOST_PATH:${hostKey}`);
    }
    if (mount.read_only !== "true") {
      contractErrors.push(`WECHAT_PAY_OVERRIDE_READ_ONLY_REQUIRED:${target}`);
    }
    if (mount.create_host_path !== "false") {
      contractErrors.push(`WECHAT_PAY_OVERRIDE_CREATE_HOST_PATH_MUST_BE_FALSE:${target}`);
    }
  }
  return contractErrors;
}

function isAbsoluteHostPath(value) {
  return path.posix.isAbsolute(value) || path.win32.isAbsolute(value);
}

function normalizeHostPath(value) {
  return value.replaceAll("\\", "/").replace(/\/$/, "").toLowerCase();
}

function validateWechatPaymentHostPaths(environment, { requireFiles = false } = {}) {
  const contractErrors = [];
  const values = [];
  for (const { hostKey } of wechatCertificateMountContract) {
    const value = environment[hostKey]?.trim() ?? "";
    values.push([hostKey, value]);
    if (!value) {
      contractErrors.push(`WECHAT_PAY_HOST_PATH_REQUIRED:${hostKey}`);
      continue;
    }
    if (!isAbsoluteHostPath(value)) {
      contractErrors.push(`WECHAT_PAY_HOST_PATH_MUST_BE_ABSOLUTE:${hostKey}`);
      continue;
    }
    if (/^(?:[A-Za-z]:)?[\\/]?$/.test(value) || /[\\/]$/.test(value) ||
        !/\.(?:pem|key|crt|cer)$/i.test(value)) {
      contractErrors.push(`WECHAT_PAY_HOST_PATH_MUST_NAME_A_CERTIFICATE_FILE:${hostKey}`);
      continue;
    }
    if (requireFiles) {
      try {
        const metadata = fs.statSync(value);
        if (!metadata.isFile()) {
          contractErrors.push(`WECHAT_PAY_HOST_PATH_NOT_A_FILE:${hostKey}`);
        }
      } catch {
        contractErrors.push(`WECHAT_PAY_HOST_PATH_NOT_READABLE:${hostKey}`);
      }
    }
  }
  if (values.every(([, value]) => value) &&
      normalizeHostPath(values[0][1]) === normalizeHostPath(values[1][1])) {
    contractErrors.push("WECHAT_PAY_HOST_PATHS_MUST_BE_DISTINCT");
  }
  return contractErrors;
}

const serverSourceFiles = walk(
  "server/src",
  (file) => file.endsWith(".ts") && !/\.(?:spec|test)\.ts$/.test(file),
);
const serverSource = serverSourceFiles
  .filter((file) => !/[\\/]cli[\\/]/.test(file))
  .map(read)
  .join("\n");
const oneShotCliSource = serverSourceFiles
  .filter((file) => /[\\/]cli[\\/]/.test(file))
  .map(read)
  .join("\n");
const serverRuntimeKeys = collectMatches(serverSource, [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /(?:this\.)?(?:configService|config)\s*\.\s*get(?:<[^>]*>)?\s*\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
]);
const oneShotCliKeys = collectMatches(oneShotCliSource, [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
]);
for (const key of collectMatches(read("server/prisma/schema.prisma"), [
  /env\(["']([A-Z][A-Z0-9_]*)["']\)/g,
])) {
  serverRuntimeKeys.add(key);
}

const seedKeys = collectMatches(read("server/prisma/seed.ts"), [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
]);
const clientSource = walk(
  "client/src",
  (file) => /\.(?:ts|tsx)$/.test(file) && !/\.(?:spec|test)\.(?:ts|tsx)$/.test(file),
)
  .map(read)
  .join("\n");
const clientBuildKeys = collectMatches(clientSource, [/\b(VITE_[A-Z][A-Z0-9_]*)\b/g]);

const envExample = read(".env.example");
const envExampleKeys = collectMatches(envExample, [
  /^\s*#?\s*([A-Z][A-Z0-9_]*)=/gm,
]);
const compose = read("docker-compose.yml");
const operationsCompose = read("docker-compose.operations.yml");
const wechatPayCompose = read("docker-compose.wechat-pay.yml");
const releaseWorkflow = read(".github/workflows/release-images.yml");
const releaseProfileAuthoritySource = read("server/src/common/release/release-profile.ts");
const runtimeEnvironmentSource = read("server/src/common/config/runtime-environment.ts");
const releasePreflightSource = read("server/src/cli/release-preflight.ts");
const productionEvidenceSource = read("scripts/verify-production-evidence.mjs");
const productionRunbook = read("docs/PRODUCTION_RELEASE_RUNBOOK.md");
const serverComposeBlock = serviceBlock(compose, "server");
const serverComposeKeys = mappingKeys(serverComposeBlock, "environment");
const serverComposeValues = mappingValues(serverComposeBlock, "environment");
const serverVolumesBlock = sectionBody(serverComposeBlock, "volumes");
const serverVolumeEntries = sequenceEntries(serverComposeBlock, "volumes");
const clientComposeBlock = serviceBlock(compose, "client");
const backupComposeBlock = serviceBlock(compose, "backup");
const releasePreflightComposeBlock = serviceBlock(operationsCompose, "release-preflight");
const releasePreflightComposeValues = mappingValues(releasePreflightComposeBlock, "environment");
const bootstrapAdminComposeBlock = serviceBlock(operationsCompose, "bootstrap-admin");
const bootstrapAdminComposeValues = mappingValues(bootstrapAdminComposeBlock, "environment");
const clientComposeKeys = collectMatches(clientComposeBlock, [
  /^\s+(VITE_[A-Z][A-Z0-9_]*):/gm,
]);
const releaseBuildKeys = collectMatches(releaseWorkflow, [/^\s+(VITE_[A-Z][A-Z0-9_]*)=/gm]);
const composeInterpolationKeys = collectMatches(`${compose}\n${operationsCompose}\n${wechatPayCompose}`, [
  /\$\{([A-Z][A-Z0-9_]*)(?::[-?][^}]*)?\}/g,
]);
const dockerfileBuildKeys = collectMatches(read("client/Dockerfile"), [
  /^ARG\s+(VITE_[A-Z][A-Z0-9_]*)/gm,
]);

const internalServerKeys = new Set([
  "NODE_ENV",
  "PORT",
  "HOST",
  "PRODUCT_MEDIA_ROOT",
  "BACKUP_DIR",
  "BACKUP_HEALTH_GRACE_SECONDS",
]);
const operationalKeys = new Set([
  "MYSQL_ROOT_PASSWORD",
  "MYSQL_PASSWORD",
  "BACKUP_DB_READY_TIMEOUT_SECONDS",
  "BACKUP_INTERVAL_SECONDS",
  "BACKUP_HEALTH_GRACE_SECONDS",
  "DISK_WARN_PCT",
]);
const publishedRevisionCliKeys = new Set([
  "PAGE_PUBLISHED_REVISION_AUDIT_READ_ONLY_AUTHORIZED",
  "PAGE_PUBLISHED_REVISION_ENVIRONMENT_ID",
  "PAGE_PUBLISHED_REVISION_EXPECTED_DATABASE",
  "PAGE_PUBLISHED_REVISION_APPROVAL_REFERENCE",
  "PAGE_PUBLISHED_REVISION_BACKFILL_APPLY",
]);
const releasePreflightCliKeys = new Set([
  "RELEASE_PREFLIGHT_READ_ONLY_AUTHORIZED",
  "RELEASE_PREFLIGHT_ENVIRONMENT_ID",
  "RELEASE_PREFLIGHT_EXPECTED_DATABASE",
  "RELEASE_PREFLIGHT_APPROVAL_REFERENCE",
]);
const migrationCapabilityEvidenceKeys = new Set([
  "MIGRATION_TARGET_ENVIRONMENT_ID",
  "MIGRATION_EXPECTED_DATABASE",
  "MIGRATION_APPROVAL_REFERENCE_SHA256",
  "MIGRATION_ACCOUNT_CAPABILITY_EVIDENCE_SHA256",
  "MIGRATION_TRIGGER_POLICY_EVIDENCE_SHA256",
]);
const secretKeys = new Set([
  "MYSQL_ROOT_PASSWORD",
  "MYSQL_PASSWORD",
  "DATABASE_URL",
  "JWT_SECRET",
  "WECHAT_APP_SECRET",
  "KIMI_API_KEY",
  "SMTP_PASS",
  "ALIPAY_PRIVATE_KEY",
  "WECHAT_API_V3_KEY",
  "KUAIDI100_KEY",
  "ALIYUN_SMS_ACCESS_KEY_ID",
  "ALIYUN_SMS_ACCESS_KEY_SECRET",
  "BOOTSTRAP_ADMIN_PASSWORD",
  "DEMO_ADMIN_PASSWORD",
]);
const releaseFoundationKeys = new Set([
  "NOTIFICATION_DELIVERY_ENABLED",
  "PARTNER_APPLICATIONS_WRITE_ENABLED",
  "PAYMENT_GATEWAY_REFUNDS_ENABLED",
  "WECHAT_MCH_CERT_SERIAL_NO",
]);
const releaseDeploymentKeys = new Set([
  "SERVER_IMAGE_NAME", "SERVER_IMAGE_DIGEST",
  "CLIENT_IMAGE_NAME", "CLIENT_IMAGE_DIGEST",
  "OPERATIONS_IMAGE_NAME", "OPERATIONS_IMAGE_DIGEST",
  "RELEASE_GIT_SHA",
  "RELEASE_SOURCE",
  "MIGRATION_BUNDLE_SHA256",
]);
const wechatPaymentCertificatePathKeys = new Set([
  "WECHAT_PLATFORM_CERT_PATH",
  "WECHAT_MCH_PRIVATE_KEY_PATH",
]);

const errors = [];
const warnings = [];
const negativeChecks = [];
function requireSubset(label, expected, actual) {
  const missing = sorted([...expected].filter((key) => !actual.has(key)));
  if (missing.length) errors.push(`${label}: ${missing.join(", ")}`);
  return missing;
}

requireSubset(
  "server runtime 未显式注入到 compose",
  serverRuntimeKeys,
  serverComposeKeys,
);
requireSubset(
  "server runtime 未记录在 .env.example 或 compose 内部固定值",
  new Set([...serverRuntimeKeys].filter((key) => !internalServerKeys.has(key))),
  envExampleKeys,
);
requireSubset(
  "seed 环境变量未记录在 .env.example",
  new Set([...seedKeys].filter((key) => !internalServerKeys.has(key))),
  envExampleKeys,
);
requireSubset("one-shot CLI 环境变量未记录在 .env.example", oneShotCliKeys, envExampleKeys);
requireSubset(
  "PageDocument 发布指针 CLI 环境变量未记录在 .env.example",
  publishedRevisionCliKeys,
  envExampleKeys,
);
requireSubset(
  "正式发布前审计 CLI 环境变量未记录在 .env.example",
  releasePreflightCliKeys,
  envExampleKeys,
);
requireSubset(
  "生产 migration 账号能力证据未记录在 .env.example",
  migrationCapabilityEvidenceKeys,
  envExampleKeys,
);
requireSubset("client build 变量未记录在 .env.example", clientBuildKeys, envExampleKeys);
requireSubset("client build 变量未传入 Release Images build args", clientBuildKeys, releaseBuildKeys);
requireSubset("client build 变量未声明为 Dockerfile ARG", clientBuildKeys, dockerfileBuildKeys);
requireSubset(
  "发布基础关键变量未显式注入到 compose",
  releaseFoundationKeys,
  serverComposeKeys,
);
requireSubset(
  "发布基础关键变量未记录在 .env.example",
  releaseFoundationKeys,
  envExampleKeys,
);
requireSubset(
  "不可变镜像变量未被 compose 消费",
  new Set(["SERVER_IMAGE_NAME", "SERVER_IMAGE_DIGEST", "CLIENT_IMAGE_NAME", "CLIENT_IMAGE_DIGEST", "OPERATIONS_IMAGE_NAME", "OPERATIONS_IMAGE_DIGEST"]),
  composeInterpolationKeys,
);
const releaseVerifierKeys = collectMatches(read("scripts/verify-release-images.mjs"), [/process\.env\.([A-Z][A-Z0-9_]*)/g]);
requireSubset("发布身份变量未被发布预检消费", new Set(["RELEASE_GIT_SHA", "RELEASE_SOURCE", "MIGRATION_BUNDLE_SHA256"]), releaseVerifierKeys);
requireSubset(
  "不可变发布变量未记录在 .env.example",
  releaseDeploymentKeys,
  envExampleKeys,
);

const mediaStorageComposeContracts = new Map([
  ["PUBLIC_MEDIA_ROOT", "/app/uploads"],
  ["PAGE_MEDIA_ARCHIVE_ROOT", "/app/private-media/page-assets-archive"],
  ["PAYMENT_PROOF_MEDIA_ROOT", "/app/private-media/payment-proofs"],
  ["PRODUCT_MEDIA_ROOT", "/app/private-media/products"],
]);
for (const [key, expectedPath] of mediaStorageComposeContracts) {
  if (serverComposeValues.get(key) !== expectedPath) {
    errors.push(`server Compose 媒体路径必须固定且持久化: ${key}=${expectedPath}`);
  }
}
for (const expectedMount of [
  "uploads_data:/app/uploads",
  "private_media_data:/app/private-media",
]) {
  if (!serverVolumeEntries.includes(expectedMount)) {
    errors.push(`server Compose 缺少媒体持久卷挂载: ${expectedMount}`);
  }
}
if (serverComposeValues.get("BACKUP_INTERVAL_SECONDS") !==
    "${BACKUP_INTERVAL_SECONDS:?BACKUP_INTERVAL_SECONDS is required}") {
  errors.push("server Compose 必须向后台状态注入真实 BACKUP_INTERVAL_SECONDS，不得用 RPO 代替");
}

const releasePreflightRuntimeContracts = new Map([
  ["VITE_PUBLIC_SITE_ORIGIN", "${VITE_PUBLIC_SITE_ORIGIN:?VITE_PUBLIC_SITE_ORIGIN is required}"],
  ["CUSTOMER_COMMERCE_ENABLED", "${CUSTOMER_COMMERCE_ENABLED:-false}"],
  ["CUSTOMER_QUOTATION_ORDERING_ENABLED", "${CUSTOMER_QUOTATION_ORDERING_ENABLED:-false}"],
  ["PAYMENT_GATEWAY_TRANSACTIONS_ENABLED", "${PAYMENT_GATEWAY_TRANSACTIONS_ENABLED:-false}"],
  ["PAYMENT_GATEWAY_REFUNDS_ENABLED", "${PAYMENT_GATEWAY_REFUNDS_ENABLED:-false}"],
  ["PARTNER_APPLICATIONS_WRITE_ENABLED", "${PARTNER_APPLICATIONS_WRITE_ENABLED:-false}"],
]);
for (const [key, expectedValue] of releasePreflightRuntimeContracts) {
  if (releasePreflightComposeValues.get(key) !== expectedValue) {
    errors.push(`release-preflight Compose 必须与 server 消费同一运行合同: ${key}`);
  }
}

const bootstrapAdminTargetContracts = new Map([
  ["DATABASE_URL", "${BOOTSTRAP_DATABASE_URL:-}"],
  ["BOOTSTRAP_ADMIN_TARGET_CLASS", "${BOOTSTRAP_ADMIN_TARGET_CLASS:-}"],
  ["BOOTSTRAP_ADMIN_ENVIRONMENT_ID", "${BOOTSTRAP_ADMIN_ENVIRONMENT_ID:-}"],
  ["BOOTSTRAP_ADMIN_EXPECTED_DATABASE", "${BOOTSTRAP_ADMIN_EXPECTED_DATABASE:-}"],
  ["BOOTSTRAP_ADMIN_APPROVAL_REFERENCE", "${BOOTSTRAP_ADMIN_APPROVAL_REFERENCE:-}"],
]);
for (const [key, expectedValue] of bootstrapAdminTargetContracts) {
  if (bootstrapAdminComposeValues.get(key) !== expectedValue) {
    errors.push(`bootstrap-admin Compose 缺少失败关闭的目标绑定: ${key}`);
  }
}

const releaseFoundationComposeContracts = [
  {
    key: "NOTIFICATION_DELIVERY_ENABLED",
    pattern:
      /^\s{6}NOTIFICATION_DELIVERY_ENABLED:\s*"\$\{NOTIFICATION_DELIVERY_ENABLED:-false\}"\s*$/m,
    message: "通知外部投递消费者必须显式注入并安全默认 false",
  },
  {
    key: "PARTNER_APPLICATIONS_WRITE_ENABLED",
    pattern:
      /^\s{6}PARTNER_APPLICATIONS_WRITE_ENABLED:\s*"\$\{PARTNER_APPLICATIONS_WRITE_ENABLED:-false\}"\s*$/m,
    message: "合作申请写能力必须显式注入并安全默认 false",
  },
  {
    key: "PAYMENT_GATEWAY_REFUNDS_ENABLED",
    pattern:
      /^\s{6}PAYMENT_GATEWAY_REFUNDS_ENABLED:\s*"\$\{PAYMENT_GATEWAY_REFUNDS_ENABLED:-false\}"\s*$/m,
    message: "退款网关开关必须显式注入并安全默认 false",
  },
  {
    key: "WECHAT_MCH_CERT_SERIAL_NO",
    pattern:
      /^\s{6}WECHAT_MCH_CERT_SERIAL_NO:\s*"\$\{WECHAT_MCH_CERT_SERIAL_NO:-\}"\s*$/m,
    message: "微信商户 API 证书序列号必须显式注入并保持空默认值",
  },
];
for (const contract of releaseFoundationComposeContracts) {
  if (!contract.pattern.test(serverComposeBlock)) {
    errors.push(`${contract.message}: ${contract.key}`);
  }
}

const backupScript = read("server/scripts/backup.sh");
const backupHealthScript = read("server/scripts/check-backup-health.sh");
const serverDockerfile = read("server/Dockerfile");
const normalizedServerDockerfile = serverDockerfile.replace(/\\\r?\n\s*/g, " ");
const operationsScriptNames = [
  "backup.sh",
  "check-backup-health.sh",
  "restore.sh",
  "restore-drill.sh",
  "prune-backups.sh",
];
const operationsScriptCopy = `COPY ${operationsScriptNames.map((name) => `scripts/${name}`).join(" ")} /usr/local/bin/`;
const operationsScriptPermissions = `chmod 0555 ${operationsScriptNames.map((name) => `/usr/local/bin/${name}`).join(" ")}`;
const settingsService = read("server/src/modules/settings/settings.service.ts");
for (const [label, condition] of [
  ["备份脚本必须原子发布状态标记", backupScript.includes('mv -f -- "$STATUS_PARTIAL_PATH" "$STATUS_PATH"')],
  ["备份脚本必须记录最近退出码", backupScript.includes("LAST_EXIT_CODE")],
  ["备份脚本必须在 dump 前等待数据库就绪", backupScript.includes("mysqladmin ping") && backupScript.includes("BACKUP_DB_READY_TIMEOUT_SECONDS")],
  ["backup service 必须注入数据库就绪等待上限", backupComposeBlock.includes("BACKUP_DB_READY_TIMEOUT_SECONDS")],
  ["备份健康检查不得 source 状态文件", !/(?:^|\s)(?:source|\.)\s+["']?\$?STATUS_PATH/m.test(backupHealthScript)],
  ["备份健康检查必须要求 SUCCESS", backupHealthScript.includes('result" != "SUCCESS')],
  ["backup service 必须消费受签名 operations digest", backupComposeBlock.includes('image: "${OPERATIONS_IMAGE_NAME:?OPERATIONS_IMAGE_NAME is required}@sha256:${OPERATIONS_IMAGE_DIGEST:?OPERATIONS_IMAGE_DIGEST is required}"')],
  ["backup service 禁止 bind checkout 可执行脚本", !/\.\/server\/scripts\/(?:backup|check-backup-health|restore|restore-drill|prune-backups)\.sh/.test(backupComposeBlock)],
  ["operations 镜像必须逐项内置五份备份恢复脚本", normalizedServerDockerfile.includes(operationsScriptCopy)],
  ["operations 镜像内五份脚本必须只读可执行", normalizedServerDockerfile.includes(operationsScriptPermissions)],
  ["operations 镜像必须内置 MySQL 8 默认认证兼容客户端", normalizedServerDockerfile.includes("apt-get install -y --no-install-recommends default-mysql-client openssl")],
  ["backup service 必须声明健康检查", backupComposeBlock.includes("/bin/bash /usr/local/bin/check-backup-health.sh")],
  ["后台备份状态必须读取执行标记", settingsService.includes("backup-status.env")],
]) {
  if (!condition) errors.push(label);
}

const wechatCertificateMounts = serverVolumeEntries.filter((entry) =>
  /wechat|cert/i.test(entry),
);
const hasWechatCertificateMountInBase = /wechat|cert/i.test(serverVolumesBlock);
const hasReadOnlyWechatCertificateMountInBase = wechatCertificateMounts.some((entry) =>
  /:ro(?:\s|$)/.test(entry),
) || (
  /wechat|cert/i.test(serverVolumesBlock) &&
  /^\s{6,}read_only:\s*true\s*$/m.test(serverVolumesBlock)
);
if (hasWechatCertificateMountInBase) {
  errors.push("WECHAT_PAY_CERTIFICATES_MUST_NOT_BE_MOUNTED_BY_BASE_COMPOSE");
}

if (!releaseProfileAuthoritySource.includes('export const RELEASE_PROFILES = ["lead-generation", "commerce"] as const;') ||
    !releaseProfileAuthoritySource.includes("DEFAULT_RELEASE_PROFILE") ||
    !releaseProfileAuthoritySource.includes("COMMERCE_RELEASE_PROFILE")) {
  errors.push("发布档位权威合同未由服务端 RELEASE_PROFILES 常量统一定义");
}
if (!releasePreflightSource.includes("DEFAULT_RELEASE_PROFILE") ||
    !releasePreflightSource.includes("COMMERCE_RELEASE_PROFILE")) {
  errors.push("release-preflight 未消费发布档位权威常量");
}
if (!runtimeEnvironmentSource.includes('import { parseReleaseProfile } from "../release/release-profile";') ||
    !runtimeEnvironmentSource.includes("RELEASE_PROFILE: releaseProfile")) {
  errors.push("runtime 启动门禁未消费发布档位权威合同");
}
if (!productionEvidenceSource.includes('from "./release-profile-contract.mjs"') ||
    !productionEvidenceSource.includes("requireReleaseProfile(trusted.releaseProfile)") ||
    !productionEvidenceSource.includes("outcome: trusted.releaseProfile")) {
  errors.push("生产证据验证器或 feature-gates claim 未消费统一发布档位合同");
}
if (!/^RELEASE_PROFILE=lead-generation$/m.test(envExample) ||
    !serverComposeBlock.includes('RELEASE_PROFILE: "${RELEASE_PROFILE:-lead-generation}"')) {
  errors.push(".env.example 或 runtime Compose 未使用权威默认发布档位 lead-generation");
}
for (const profile of RELEASE_PROFILE_CONTRACT.profiles) {
  if (!productionRunbook.includes(`\`${profile}\``)) {
    errors.push(`生产 Runbook 缺少权威发布档位: ${profile}`);
  }
}
for (const forbiddenProfile of ["content-only", "transactional", "Commerce", ""]) {
  let rejected = false;
  try {
    requireReleaseProfile(forbiddenProfile);
  } catch {
    rejected = true;
  }
  if (!rejected) errors.push(`发布档位负向值未失败关闭: ${forbiddenProfile || "<empty>"}`);
  else negativeChecks.push(`release-profile:${forbiddenProfile || "empty"}`);
}
if (/new Set\(\["content-only", "transactional"\]\)/.test(productionEvidenceSource)) {
  errors.push("生产证据验证器仍包含旧发布档位枚举");
}

const wechatPaymentOverrideErrors = validateWechatPaymentOverride(wechatPayCompose);
errors.push(...wechatPaymentOverrideErrors);

function requireNegativeProbe(label, detectedErrors, expectedCode) {
  if (!detectedErrors.some((error) => error === expectedCode || error.startsWith(`${expectedCode}:`))) {
    errors.push(`环境合同负向探针未识别 ${label}: ${expectedCode}`);
  } else {
    negativeChecks.push(`wechat-pay:${label}`);
  }
}

const platformSourceLine = '        source: "${WECHAT_PLATFORM_CERT_HOST_PATH:?WECHAT_PLATFORM_CERT_HOST_PATH must be an absolute host file path}"';
const privateKeySourceLine = '        source: "${WECHAT_MCH_PRIVATE_KEY_HOST_PATH:?WECHAT_MCH_PRIVATE_KEY_HOST_PATH must be an absolute host file path}"';
requireNegativeProbe(
  "missing-host-path-binding",
  validateWechatPaymentOverride(wechatPayCompose.replace(platformSourceLine, '        source: ""')),
  "WECHAT_PAY_OVERRIDE_REQUIRED_HOST_PATH",
);
requireNegativeProbe(
  "same-source",
  validateWechatPaymentOverride(wechatPayCompose.replace(platformSourceLine, privateKeySourceLine)),
  "WECHAT_PAY_OVERRIDE_MOUNT_SOURCES_MUST_BE_DISTINCT",
);
requireNegativeProbe(
  "broad-target",
  validateWechatPaymentOverride(wechatPayCompose.replace(
    "        target: /run/secrets/wechat-pay/platform-cert.pem",
    "        target: /run/secrets/wechat-pay",
  )),
  "WECHAT_PAY_OVERRIDE_EXACT_FILE_TARGET_REQUIRED",
);
requireNegativeProbe(
  "writable-mount",
  validateWechatPaymentOverride(wechatPayCompose.replace("        read_only: true", "        read_only: false")),
  "WECHAT_PAY_OVERRIDE_READ_ONLY_REQUIRED",
);
requireNegativeProbe(
  "create-missing-host-path",
  validateWechatPaymentOverride(wechatPayCompose.replace("          create_host_path: false", "          create_host_path: true")),
  "WECHAT_PAY_OVERRIDE_CREATE_HOST_PATH_MUST_BE_FALSE",
);
requireNegativeProbe(
  "transaction-flag-in-override",
  validateWechatPaymentOverride(wechatPayCompose.replace(
    "      WECHAT_PLATFORM_CERT_PATH: /run/secrets/wechat-pay/platform-cert.pem",
    "      WECHAT_PLATFORM_CERT_PATH: /run/secrets/wechat-pay/platform-cert.pem\n      PAYMENT_GATEWAY_TRANSACTIONS_ENABLED: \"true\"",
  )),
  "WECHAT_PAY_OVERRIDE_MUST_NOT_ENABLE_TRANSACTIONS",
);

const safeHostPathFixture = {
  WECHAT_PLATFORM_CERT_HOST_PATH: "/srv/haichuan/secrets/wechat-platform-cert.pem",
  WECHAT_MCH_PRIVATE_KEY_HOST_PATH: "/srv/haichuan/secrets/wechat-mch-private-key.pem",
};
const safeHostPathFixtureErrors = validateWechatPaymentHostPaths(safeHostPathFixture);
if (safeHostPathFixtureErrors.length) {
  errors.push(`微信支付宿主文件路径正向合同失败: ${safeHostPathFixtureErrors.join(", ")}`);
}
requireNegativeProbe(
  "missing-host-path-value",
  validateWechatPaymentHostPaths({ ...safeHostPathFixture, WECHAT_PLATFORM_CERT_HOST_PATH: "" }),
  "WECHAT_PAY_HOST_PATH_REQUIRED",
);
requireNegativeProbe(
  "same-host-path-value",
  validateWechatPaymentHostPaths({
    ...safeHostPathFixture,
    WECHAT_PLATFORM_CERT_HOST_PATH: safeHostPathFixture.WECHAT_MCH_PRIVATE_KEY_HOST_PATH,
  }),
  "WECHAT_PAY_HOST_PATHS_MUST_BE_DISTINCT",
);
requireNegativeProbe(
  "broad-host-directory-value",
  validateWechatPaymentHostPaths({ ...safeHostPathFixture, WECHAT_PLATFORM_CERT_HOST_PATH: "/srv/haichuan/secrets" }),
  "WECHAT_PAY_HOST_PATH_MUST_NAME_A_CERTIFICATE_FILE",
);
requireNegativeProbe(
  "relative-host-path-value",
  validateWechatPaymentHostPaths({ ...safeHostPathFixture, WECHAT_PLATFORM_CERT_HOST_PATH: "./certs/platform.pem" }),
  "WECHAT_PAY_HOST_PATH_MUST_BE_ABSOLUTE",
);

const verifyWechatHostFiles = process.argv.includes("--wechat-pay-host-files");
if (verifyWechatHostFiles) {
  errors.push(...validateWechatPaymentHostPaths(process.env, { requireFiles: true }));
}

const certSerialExample = /^\s*WECHAT_MCH_CERT_SERIAL_NO=(.*)$/m.exec(envExample);
if (certSerialExample?.[1]?.trim()) {
  errors.push(".env.example 不得提供伪造的 WECHAT_MCH_CERT_SERIAL_NO 默认值");
}

for (const key of releaseFoundationKeys) {
  const composeDeclaration = new RegExp(`^\\s{6}${key}:.*(?:\\r?\\n|$)`, "m");
  const composeWithoutKey = serverComposeBlock.replace(composeDeclaration, "");
  const missingFromCompose = sorted(
    [...releaseFoundationKeys].filter(
      (requiredKey) => !mappingKeys(composeWithoutKey, "environment").has(requiredKey),
    ),
  );
  if (!missingFromCompose.includes(key)) {
    errors.push(`环境合同负向探针未识别 compose 关键变量缺失: ${key}`);
  } else {
    negativeChecks.push(`compose:${key}`);
  }

  const exampleDeclaration = new RegExp(`^\\s*#?\\s*${key}=.*(?:\\r?\\n|$)`, "m");
  const exampleWithoutKey = envExample.replace(exampleDeclaration, "");
  const exampleKeysWithoutKey = collectMatches(exampleWithoutKey, [
    /^\s*#?\s*([A-Z][A-Z0-9_]*)=/gm,
  ]);
  if (exampleKeysWithoutKey.has(key)) {
    errors.push(`环境合同负向探针未识别 .env.example 关键变量缺失: ${key}`);
  } else {
    negativeChecks.push(`env-example:${key}`);
  }
}

const knownExampleKeys = new Set([
  ...serverRuntimeKeys,
  ...seedKeys,
  ...oneShotCliKeys,
  ...clientBuildKeys,
  ...operationalKeys,
  ...publishedRevisionCliKeys,
  ...releasePreflightCliKeys,
  ...migrationCapabilityEvidenceKeys,
  ...releaseDeploymentKeys,
  ...composeInterpolationKeys,
  ...collectMatches(read("server/scripts/restore-drill.sh"), [/\$\{([A-Z][A-Z0-9_]*)/g]),
]);
const staleExampleKeys = sorted(
  [...envExampleKeys].filter((key) => !knownExampleKeys.has(key)),
);
if (staleExampleKeys.length) {
  errors.push(`.env.example 存在零消费变量: ${staleExampleKeys.join(", ")}`);
}

const nonRuntimeKeys = new Set([
  ...[...seedKeys].filter((key) => !serverRuntimeKeys.has(key)),
  ...[...oneShotCliKeys].filter((key) => !serverRuntimeKeys.has(key)),
  ...publishedRevisionCliKeys,
  ...releasePreflightCliKeys,
  ...migrationCapabilityEvidenceKeys,
]);
for (const key of nonRuntimeKeys) {
  if (serverComposeKeys.has(key)) {
    errors.push(`seed/one-shot 变量不得注入长期运行的 server service: ${key}`);
  }
}

for (const key of secretKeys) {
  if (!envExampleKeys.has(key)) continue;
  if (!nonRuntimeKeys.has(key) && !compose.includes(`\${${key}`)) {
    errors.push(`secret 未通过 compose 变量插值注入: ${key}`);
  }
  if (clientComposeBlock.includes(key) || read("client/Dockerfile").includes(key)) {
    errors.push(`secret 不得进入客户端构建: ${key}`);
  }
}

const summary = {
  serverRuntimeKeys: sorted(serverRuntimeKeys),
  serverComposeKeys: sorted(serverComposeKeys),
  mediaStorageComposeContracts: Object.fromEntries(mediaStorageComposeContracts),
  seedKeys: sorted(seedKeys),
  oneShotCliKeys: sorted(oneShotCliKeys),
  publishedRevisionCliKeys: sorted(publishedRevisionCliKeys),
  releasePreflightCliKeys: sorted(releasePreflightCliKeys),
  migrationCapabilityEvidenceKeys: sorted(migrationCapabilityEvidenceKeys),
  clientBuildKeys: sorted(clientBuildKeys),
  envExampleKeyCount: envExampleKeys.size,
  releaseFoundationKeys: sorted(releaseFoundationKeys),
  releaseDeploymentKeys: sorted(releaseDeploymentKeys),
  releaseProfileContract: RELEASE_PROFILE_CONTRACT,
  runtimeFileContracts: {
    wechatPaymentCertificatePathKeys: sorted(wechatPaymentCertificatePathKeys),
    baseComposeReadOnlyMounts: wechatCertificateMounts,
    baseComposeHasCertificateMount: hasWechatCertificateMountInBase,
    readyForRealWechatPayments: hasReadOnlyWechatCertificateMountInBase,
    explicitOverride: "docker-compose.wechat-pay.yml",
    overrideCertificateInterfaceReady: wechatPaymentOverrideErrors.length === 0,
    fixedContainerPaths: wechatCertificateMountContract.map(({ target }) => target),
    hostPathVerificationRequested: verifyWechatHostFiles,
  },
  negativeChecks,
  warnings,
  errors,
};

console.log(JSON.stringify(summary, null, 2));
if (errors.length) process.exitCode = 1;
