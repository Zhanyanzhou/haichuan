import { Prisma, Role, Status } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  STAFF_PASSWORD_MAX_LENGTH,
  STAFF_PASSWORD_MIN_LENGTH,
} from "../modules/users/staff-password-policy";

const PASSWORD_HASH_ROUNDS = 12;

type BootstrapTransaction = {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
  user: {
    findUnique(args: unknown): Promise<{ id: number } | null>;
    create(args: unknown): Promise<{
      id: number;
      role: Role;
      status: Status;
    }>;
  };
  operationLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type BootstrapDatabase = {
  $transaction<T>(
    action: (transaction: BootstrapTransaction) => Promise<T>,
    options: {
      isolationLevel: Prisma.TransactionIsolationLevel;
      maxWait: number;
      timeout: number;
    },
  ): Promise<T>;
};

export type FirstAdminInput = {
  username: string;
  password: string;
  realName?: string;
};

export class FirstAdminBootstrapError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FirstAdminBootstrapError";
  }
}

export function validateFirstAdminInput(input: FirstAdminInput) {
  const username = input.username?.trim() ?? "";
  if (
    !/^[A-Za-z][A-Za-z0-9._-]{2,49}$/.test(username)
    || ["admin", "root", "superadmin"].includes(username.toLowerCase())
  ) {
    throw new FirstAdminBootstrapError(
      "bootstrap-username-invalid",
      "管理员用户名必须为 3-50 位，以字母开头且只包含字母、数字、点、下划线或连字符，并且不能使用通用管理员名称",
    );
  }

  const password = input.password ?? "";
  if (
    password.length < STAFF_PASSWORD_MIN_LENGTH
    || password.length > STAFF_PASSWORD_MAX_LENGTH
  ) {
    throw new FirstAdminBootstrapError(
      "bootstrap-password-invalid",
      `管理员密码长度必须为 ${STAFF_PASSWORD_MIN_LENGTH}-${STAFF_PASSWORD_MAX_LENGTH} 位`,
    );
  }

  const realName = input.realName?.trim();
  if (realName && realName.length > 50) {
    throw new FirstAdminBootstrapError(
      "bootstrap-real-name-invalid",
      "管理员姓名不能超过 50 个字符",
    );
  }

  return { username, password, realName: realName || undefined };
}

export async function bootstrapFirstAdmin(
  database: BootstrapDatabase,
  input: FirstAdminInput,
  hashPassword: (password: string, rounds: number) => Promise<string> = bcrypt.hash,
) {
  const normalized = validateFirstAdminInput(input);
  const passwordHash = await hashPassword(
    normalized.password,
    PASSWORD_HASH_ROUNDS,
  );

  return database.$transaction(async (transaction) => {
    // 锁定当前 SUPER_ADMIN 范围。空集合时 InnoDB 通过 next-key lock 串行化并发首建；
    // 同一事务完成检查、创建与审计，失败不会留下半成品账号。
    const activeSuperAdmins = await transaction.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`
        SELECT id
        FROM users
        WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE'
        FOR UPDATE
      `,
    );
    const existingUsername = await transaction.user.findUnique({
      where: { username: normalized.username },
      select: { id: true },
    });
    if (existingUsername) {
      throw new FirstAdminBootstrapError(
        "bootstrap-username-conflict",
        "目标用户名已存在，拒绝覆盖、提权或修改密码",
      );
    }

    if (activeSuperAdmins.length > 0) {
      throw new FirstAdminBootstrapError(
        "bootstrap-active-super-admin-exists",
        "系统已存在启用中的超级管理员，拒绝重复初始化或改密",
      );
    }

    const user = await transaction.user.create({
      data: {
        username: normalized.username,
        password: passwordHash,
        realName: normalized.realName,
        role: Role.SUPER_ADMIN,
        status: Status.ACTIVE,
      },
      select: { id: true, role: true, status: true },
    });

    await transaction.operationLog.create({
      data: {
        userId: user.id,
        action: "bootstrap",
        module: "user",
        targetId: user.id,
        detail: JSON.stringify({ source: "one-shot-cli", version: 1 }),
      },
    });

    return {
      created: true as const,
      userId: user.id,
      role: user.role,
      status: user.status,
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 5_000,
    timeout: 15_000,
  });
}

export function readFirstAdminInput(
  environment: NodeJS.ProcessEnv,
): FirstAdminInput {
  return {
    username: environment.BOOTSTRAP_ADMIN_USERNAME ?? "",
    password: environment.BOOTSTRAP_ADMIN_PASSWORD ?? "",
    realName: environment.BOOTSTRAP_ADMIN_REAL_NAME,
  };
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const result = await bootstrapFirstAdmin(
      prisma as unknown as BootstrapDatabase,
      readFirstAdminInput({
        BOOTSTRAP_ADMIN_USERNAME: process.env.BOOTSTRAP_ADMIN_USERNAME,
        BOOTSTRAP_ADMIN_PASSWORD: process.env.BOOTSTRAP_ADMIN_PASSWORD,
        BOOTSTRAP_ADMIN_REAL_NAME: process.env.BOOTSTRAP_ADMIN_REAL_NAME,
      }),
    );
    console.log(JSON.stringify({
      ok: true,
      code: "first-admin-created",
      userId: result.userId,
      role: result.role,
      status: result.status,
    }));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const known = error instanceof FirstAdminBootstrapError;
    console.error(JSON.stringify({
      ok: false,
      code: known ? error.code : "bootstrap-execution-failed",
      message: known ? error.message : "首管理员初始化失败；未输出底层异常或连接信息",
    }));
    process.exitCode = 1;
  });
}
