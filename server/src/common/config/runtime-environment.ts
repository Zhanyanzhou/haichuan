import { resolveCorsOrigins } from "./cors-origins";
import {
  isPartnerApplicationsWriteEnabled,
  parseReleaseProfile,
  resolvePartnerAgreementContract,
} from "../release/release-profile";
import {
  parsePaymentProviderMode,
  parsePaymentSimulatorScenario,
} from "../payment-gateway/payment-provider-mode";
import { parsePaymentSimulatorBaseUrl } from "../payment-gateway/payment-simulator.protocol";

type Environment = Record<string, unknown>;

const PRODUCTION = "production";
const JWT_MIN_BYTES = 32;
const PAYMENT_SIMULATOR_SECRET_MIN_BYTES = 32;
const LIVE_PAYMENT_CREDENTIAL_KEYS = [
  "ALIPAY_APP_ID",
  "ALIPAY_PRIVATE_KEY",
  "ALIPAY_PUBLIC_KEY",
  "WECHAT_PAY_APP_ID",
  "WECHAT_MCH_ID",
  "WECHAT_MCH_CERT_SERIAL_NO",
  "WECHAT_PLATFORM_CERT_PATH",
  "WECHAT_MCH_PRIVATE_KEY_PATH",
  "WECHAT_API_V3_KEY",
] as const;
const KNOWN_PLACEHOLDER_FRAGMENTS = [
  "change-me",
  "changeme",
  "replace-me",
  "example",
  "sample",
  "placeholder",
  "not-a-real-secret",
  "test-only",
  "请",
  "你的",
] as const;

function optionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requiredString(environment: Environment, name: string): string {
  const value = optionalString(environment[name]);
  if (!value) throw new Error(`${name} 环境变量未设置`);
  return value;
}

function assertNotPlaceholder(name: string, value: string): void {
  const normalized = value.toLowerCase();
  if (KNOWN_PLACEHOLDER_FRAGMENTS.some((fragment) => normalized.includes(fragment))) {
    throw new Error(`${name} 不能使用示例或测试占位值`);
  }
}

export function resolveJwtSecret(value: unknown, nodeEnvironment: unknown): string {
  const secret = optionalString(value);
  if (!secret) throw new Error("JWT_SECRET 环境变量未设置");
  if (nodeEnvironment === PRODUCTION) {
    assertNotPlaceholder("JWT_SECRET", secret);
    if (Buffer.byteLength(secret, "utf8") < JWT_MIN_BYTES) {
      throw new Error(`JWT_SECRET 生产配置至少需要 ${JWT_MIN_BYTES} 字节`);
    }
  }
  return secret;
}

function assertProductionDatabaseUrl(value: string): void {
  assertNotPlaceholder("DATABASE_URL", value);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL 生产配置格式无效");
  }
  if (
    url.protocol !== "mysql:" ||
    !url.username ||
    !url.password ||
    !url.hostname ||
    !url.pathname ||
    url.pathname === "/"
  ) {
    throw new Error("DATABASE_URL 生产配置格式无效");
  }
}

/** ConfigModule 的唯一启动期配置门禁；错误只包含变量名，不回显实际值。 */
export function validateRuntimeEnvironment(environment: Environment): Environment {
  const nodeEnvironment = optionalString(environment.NODE_ENV) || "development";
  const jwtSecret = resolveJwtSecret(environment.JWT_SECRET, nodeEnvironment);
  const releaseProfile = parseReleaseProfile(optionalString(environment.RELEASE_PROFILE) || undefined);
  const paymentProviderMode = parsePaymentProviderMode(
    optionalString(environment.PAYMENT_PROVIDER_MODE) || undefined,
  );
  let paymentSimulatorScenario: string | undefined;
  let paymentSimulatorBaseUrl: string | undefined;
  if (paymentProviderMode === "simulator") {
    if (nodeEnvironment === PRODUCTION) {
      throw new Error("PAYMENT_PROVIDER_MODE=simulator 禁止用于生产环境");
    }
    if (
      LIVE_PAYMENT_CREDENTIAL_KEYS.some((key) =>
        Boolean(optionalString(environment[key])),
      )
    ) {
      throw new Error("支付 simulator 模式不得配置真实支付凭据");
    }
    const simulatorSecret = requiredString(
      environment,
      "PAYMENT_SIMULATOR_SIGNING_SECRET",
    );
    assertNotPlaceholder("PAYMENT_SIMULATOR_SIGNING_SECRET", simulatorSecret);
    if (
      Buffer.byteLength(simulatorSecret, "utf8") <
      PAYMENT_SIMULATOR_SECRET_MIN_BYTES
    ) {
      throw new Error(
        `PAYMENT_SIMULATOR_SIGNING_SECRET 至少需要 ${PAYMENT_SIMULATOR_SECRET_MIN_BYTES} 字节`,
      );
    }
    paymentSimulatorScenario = parsePaymentSimulatorScenario(
      optionalString(environment.PAYMENT_SIMULATOR_SCENARIO),
    );
    paymentSimulatorBaseUrl = parsePaymentSimulatorBaseUrl(
      optionalString(environment.PAYMENT_SIMULATOR_BASE_URL),
    );
  }
  const analyticsIngestionEnabled = optionalString(environment.ANALYTICS_INGESTION_ENABLED) === "true";
  const analyticsRetentionEnabled = optionalString(environment.ANALYTICS_RETENTION_ENABLED) === "true";
  if (analyticsIngestionEnabled && !analyticsRetentionEnabled) {
    throw new Error(
      "ANALYTICS_RETENTION_ENABLED 必须在 ANALYTICS_INGESTION_ENABLED=true 时设为 true",
    );
  }
  if (
    isPartnerApplicationsWriteEnabled(optionalString(environment.PARTNER_APPLICATIONS_WRITE_ENABLED))
    && !resolvePartnerAgreementContract(
      optionalString(environment.PARTNER_AGREEMENT_VERSION),
      optionalString(environment.PARTNER_AGREEMENT_SHA256),
      optionalString(environment.PARTNER_AGREEMENT_STATUS),
    )
  ) {
    throw new Error(
      "PARTNER_APPLICATIONS_WRITE_ENABLED=true 时必须绑定 published 状态、正式 PARTNER_AGREEMENT_VERSION 与 PARTNER_AGREEMENT_SHA256",
    );
  }
  const validated = {
    ...environment,
    NODE_ENV: nodeEnvironment,
    JWT_SECRET: jwtSecret,
    RELEASE_PROFILE: releaseProfile,
    PAYMENT_PROVIDER_MODE: paymentProviderMode,
    ...(paymentSimulatorScenario
      ? { PAYMENT_SIMULATOR_SCENARIO: paymentSimulatorScenario }
      : {}),
    ...(paymentSimulatorBaseUrl
      ? { PAYMENT_SIMULATOR_BASE_URL: paymentSimulatorBaseUrl }
      : {}),
  };

  if (nodeEnvironment !== PRODUCTION) return validated;

  const databaseUrl = requiredString(environment, "DATABASE_URL");
  assertProductionDatabaseUrl(databaseUrl);
  const corsOrigin = requiredString(environment, "CORS_ORIGIN");
  assertNotPlaceholder("CORS_ORIGIN", corsOrigin);
  resolveCorsOrigins(nodeEnvironment, corsOrigin);

  return { ...validated, DATABASE_URL: databaseUrl, CORS_ORIGIN: corsOrigin };
}
