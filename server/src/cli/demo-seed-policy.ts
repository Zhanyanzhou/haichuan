import {
  ACCOUNT_PASSWORD_MAX_LENGTH,
  ACCOUNT_PASSWORD_MESSAGE,
  ACCOUNT_PASSWORD_MIN_LENGTH,
} from "../modules/users/staff-password-policy";

export type DemoSeedEnvironment = {
  NODE_ENV?: string;
  ALLOW_DEMO_SEED?: string;
  DEMO_ADMIN_PASSWORD?: string;
};

export class DemoSeedPolicyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DemoSeedPolicyError";
  }
}

export function resolveDemoSeedConfig(environment: DemoSeedEnvironment) {
  const nodeEnvironment = environment.NODE_ENV?.trim().toLowerCase();
  if (nodeEnvironment === "production") {
    throw new DemoSeedPolicyError(
      "demo-seed-production-forbidden",
      "Demo Seed 禁止在 NODE_ENV=production 环境运行",
    );
  }

  if (environment.ALLOW_DEMO_SEED?.trim().toLowerCase() !== "true") {
    throw new DemoSeedPolicyError(
      "demo-seed-opt-in-required",
      "必须显式设置 ALLOW_DEMO_SEED=true 才能写入 Demo 数据",
    );
  }

  const adminPassword = environment.DEMO_ADMIN_PASSWORD ?? "";
  if (
    adminPassword.length < ACCOUNT_PASSWORD_MIN_LENGTH
    || adminPassword.length > ACCOUNT_PASSWORD_MAX_LENGTH
  ) {
    throw new DemoSeedPolicyError(
      "demo-seed-password-invalid",
      `DEMO_ADMIN_PASSWORD ${ACCOUNT_PASSWORD_MESSAGE}`,
    );
  }

  return { adminPassword };
}
