import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const serverSource = walk(
  "server/src",
  (file) => file.endsWith(".ts") && !/\.(?:spec|test)\.ts$/.test(file),
)
  .map(read)
  .join("\n");
const serverRuntimeKeys = collectMatches(serverSource, [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /(?:this\.)?(?:configService|config)\s*\.\s*get(?:<[^>]*>)?\s*\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
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
const serverComposeBlock = serviceBlock(compose, "server");
const serverComposeKeys = mappingKeys(serverComposeBlock, "environment");
const serverVolumesBlock = sectionBody(serverComposeBlock, "volumes");
const serverVolumeEntries = sequenceEntries(serverComposeBlock, "volumes");
const clientComposeBlock = serviceBlock(compose, "client");
const clientComposeKeys = collectMatches(clientComposeBlock, [
  /^\s+(VITE_[A-Z][A-Z0-9_]*):/gm,
]);
const dockerfileBuildKeys = collectMatches(read("client/Dockerfile"), [
  /^ARG\s+(VITE_[A-Z][A-Z0-9_]*)/gm,
]);

const internalServerKeys = new Set([
  "NODE_ENV",
  "PORT",
  "HOST",
  "PRODUCT_MEDIA_ROOT",
  "PRODUCT_MEDIA_ROOT_LEGACY",
  "BACKUP_DIR",
]);
const operationalKeys = new Set([
  "MYSQL_ROOT_PASSWORD",
  "MYSQL_PASSWORD",
  "BACKUP_INTERVAL_SECONDS",
  "DISK_WARN_PCT",
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
]);
const releaseFoundationKeys = new Set([
  "NOTIFICATION_DELIVERY_ENABLED",
  "PAYMENT_GATEWAY_REFUNDS_ENABLED",
  "WECHAT_MCH_CERT_SERIAL_NO",
]);
const wechatPaymentCertificatePathKeys = new Set([
  "WECHAT_PLATFORM_CERT_PATH",
  "WECHAT_MCH_PRIVATE_KEY_PATH",
]);

const errors = [];
const warnings = [];
function requireSubset(label, expected, actual) {
  const missing = sorted([...expected].filter((key) => !actual.has(key)));
  if (missing.length) errors.push(`${label}: ${missing.join(", ")}`);
  return missing;
}

requireSubset("server runtime 未显式注入到 compose", serverRuntimeKeys, serverComposeKeys);
requireSubset(
  "server runtime 未记录在 .env.example 或 compose 内部固定值",
  new Set([...serverRuntimeKeys].filter((key) => !internalServerKeys.has(key))),
  envExampleKeys,
);
requireSubset("seed 环境变量未记录在 .env.example", seedKeys, envExampleKeys);
requireSubset("client build 变量未记录在 .env.example", clientBuildKeys, envExampleKeys);
requireSubset("client build 变量未传入 compose build args", clientBuildKeys, clientComposeKeys);
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

const releaseFoundationComposeContracts = [
  {
    key: "NOTIFICATION_DELIVERY_ENABLED",
    pattern:
      /^\s{6}NOTIFICATION_DELIVERY_ENABLED:\s*\$\{NOTIFICATION_DELIVERY_ENABLED:-"false"\}\s*$/m,
    message: "通知外部投递消费者必须显式注入并安全默认 false",
  },
  {
    key: "PAYMENT_GATEWAY_REFUNDS_ENABLED",
    pattern:
      /^\s{6}PAYMENT_GATEWAY_REFUNDS_ENABLED:\s*\$\{PAYMENT_GATEWAY_REFUNDS_ENABLED:-"false"\}\s*$/m,
    message: "退款网关开关必须显式注入并安全默认 false",
  },
  {
    key: "WECHAT_MCH_CERT_SERIAL_NO",
    pattern:
      /^\s{6}WECHAT_MCH_CERT_SERIAL_NO:\s*\$\{WECHAT_MCH_CERT_SERIAL_NO:-""\}\s*$/m,
    message: "微信商户 API 证书序列号必须显式注入并保持空默认值",
  },
];
for (const contract of releaseFoundationComposeContracts) {
  if (!contract.pattern.test(serverComposeBlock)) {
    errors.push(`${contract.message}: ${contract.key}`);
  }
}

const wechatCertificateMounts = serverVolumeEntries.filter((entry) =>
  /wechat|cert/i.test(entry),
);
const hasReadOnlyWechatCertificateMount = wechatCertificateMounts.some((entry) =>
  /:ro(?:\s|$)/.test(entry),
) || (
  /wechat|cert/i.test(serverVolumesBlock) &&
  /^\s{6,}read_only:\s*true\s*$/m.test(serverVolumesBlock)
);
if (!hasReadOnlyWechatCertificateMount) {
  warnings.push(
    "微信支付证书路径变量已映射，但 server service 未声明证书只读挂载；真实支付不可启用",
  );
}

const certSerialExample = /^\s*WECHAT_MCH_CERT_SERIAL_NO=(.*)$/m.exec(envExample);
if (certSerialExample?.[1]?.trim()) {
  errors.push(".env.example 不得提供伪造的 WECHAT_MCH_CERT_SERIAL_NO 默认值");
}

const negativeChecks = [];
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
  ...clientBuildKeys,
  ...operationalKeys,
]);
const staleExampleKeys = sorted(
  [...envExampleKeys].filter((key) => !knownExampleKeys.has(key)),
);
if (staleExampleKeys.length) {
  errors.push(`.env.example 存在零消费变量: ${staleExampleKeys.join(", ")}`);
}

for (const key of secretKeys) {
  if (!envExampleKeys.has(key)) continue;
  if (!compose.includes(`\${${key}`)) {
    errors.push(`secret 未通过 compose 变量插值注入: ${key}`);
  }
  if (clientComposeBlock.includes(key) || read("client/Dockerfile").includes(key)) {
    errors.push(`secret 不得进入客户端构建: ${key}`);
  }
}

const summary = {
  serverRuntimeKeys: sorted(serverRuntimeKeys),
  serverComposeKeys: sorted(serverComposeKeys),
  clientBuildKeys: sorted(clientBuildKeys),
  envExampleKeyCount: envExampleKeys.size,
  releaseFoundationKeys: sorted(releaseFoundationKeys),
  runtimeFileContracts: {
    wechatPaymentCertificatePathKeys: sorted(wechatPaymentCertificatePathKeys),
    readOnlyMounts: wechatCertificateMounts,
    readyForRealWechatPayments: hasReadOnlyWechatCertificateMount,
  },
  negativeChecks,
  warnings,
  errors,
};

console.log(JSON.stringify(summary, null, 2));
if (errors.length) process.exitCode = 1;
