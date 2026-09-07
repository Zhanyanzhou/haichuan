import { resolveCorsOrigins } from "./cors-origins";
import { parseReleaseProfile } from "../release/release-profile";

type Environment = Record<string, unknown>;

const PRODUCTION = "production";
const JWT_MIN_BYTES = 32;
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
  const validated = {
    ...environment,
    NODE_ENV: nodeEnvironment,
    JWT_SECRET: jwtSecret,
    RELEASE_PROFILE: releaseProfile,
  };

  if (nodeEnvironment !== PRODUCTION) return validated;

  const databaseUrl = requiredString(environment, "DATABASE_URL");
  assertProductionDatabaseUrl(databaseUrl);
  const corsOrigin = requiredString(environment, "CORS_ORIGIN");
  assertNotPlaceholder("CORS_ORIGIN", corsOrigin);
  resolveCorsOrigins(nodeEnvironment, corsOrigin);

  return { ...validated, DATABASE_URL: databaseUrl, CORS_ORIGIN: corsOrigin };
}
