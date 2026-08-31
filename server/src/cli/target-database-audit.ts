import { createHash } from "node:crypto";

export interface TargetDatabaseIdentity {
  environmentId: string;
  expectedDatabase: string;
  approvalReferenceHash: string;
}

export interface TargetDatabaseAuditDatabase {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
}

type TargetDatabaseAccessMode = "read-only" | "update";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function parseTargetDatabaseIdentity(input: {
  environmentId: string | undefined;
  expectedDatabase: string | undefined;
  approvalReference: string | undefined;
  databaseUrl: string | undefined;
  errorPrefix: string;
}): TargetDatabaseIdentity {
  const environmentId = input.environmentId?.trim() ?? "";
  const expectedDatabase = input.expectedDatabase?.trim() ?? "";
  const approvalReference = input.approvalReference?.trim() ?? "";
  const databaseUrl = input.databaseUrl?.trim() ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(environmentId)) {
    throw new Error(`${input.errorPrefix}_ENVIRONMENT_ID_REQUIRED`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_$-]{0,63}$/.test(expectedDatabase)) {
    throw new Error(`${input.errorPrefix}_EXPECTED_DATABASE_REQUIRED`);
  }
  if (approvalReference.length < 3 || approvalReference.length > 200) {
    throw new Error(`${input.errorPrefix}_APPROVAL_REFERENCE_REQUIRED`);
  }

  let configuredDatabase: string;
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== "mysql:") {
      throw new Error(`${input.errorPrefix}_DATABASE_MUST_BE_MYSQL`);
    }
    configuredDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === `${input.errorPrefix}_DATABASE_MUST_BE_MYSQL`
    ) {
      throw error;
    }
    throw new Error(`${input.errorPrefix}_DATABASE_URL_INVALID`);
  }
  if (configuredDatabase !== expectedDatabase) {
    throw new Error(`${input.errorPrefix}_DATABASE_NAME_MISMATCH`);
  }
  return {
    environmentId,
    expectedDatabase,
    approvalReferenceHash: sha256(approvalReference),
  };
}

function normalizeGrantScope(scope: string): string {
  return scope.replace(/`/g, "").trim();
}

export function evaluateTargetDatabaseGrants(
  statements: readonly string[],
  expectedDatabase: string,
  mode: TargetDatabaseAccessMode,
): { ok: boolean; rejected: string[] } {
  const allowedPrivileges = new Set(
    mode === "update"
      ? ["USAGE", "SELECT", "SHOW VIEW", "UPDATE"]
      : ["USAGE", "SELECT", "SHOW VIEW"],
  );
  const requiredPrivileges = new Set(
    mode === "update" ? ["SELECT", "UPDATE"] : ["SELECT"],
  );
  const expectedScope = `${expectedDatabase}.*`;
  const observedPrivileges = new Set<string>();
  const rejected: string[] = [];

  for (const statement of statements) {
    const normalized = statement.replace(/\s+/g, " ").trim();
    if (/\bWITH GRANT OPTION\b/i.test(normalized)) {
      rejected.push("GRANT_OPTION");
      continue;
    }
    const match = /^GRANT (.+?) ON (.+?) TO /i.exec(normalized);
    if (!match) {
      rejected.push("ROLE_OR_UNKNOWN_GRANT");
      continue;
    }
    const privileges = match[1]
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
    const scope = normalizeGrantScope(match[2]);
    for (const privilege of privileges) observedPrivileges.add(privilege);
    if (privileges.some((privilege) => !allowedPrivileges.has(privilege))) {
      rejected.push("WRITE_OR_ADMIN_PRIVILEGE");
    }
    const onlyUsage = privileges.length > 0 && privileges.every(
      (privilege) => privilege === "USAGE",
    );
    const scopeIsExpectedDatabase = scope === expectedScope ||
      scope.startsWith(`${expectedDatabase}.`);
    if ((onlyUsage && scope !== "*.*" && !scopeIsExpectedDatabase) ||
        (!onlyUsage && !scopeIsExpectedDatabase)) {
      rejected.push("CROSS_DATABASE_SCOPE");
    }
  }
  for (const privilege of requiredPrivileges) {
    if (!observedPrivileges.has(privilege)) {
      rejected.push(`MISSING_${privilege}_PRIVILEGE`);
    }
  }
  return {
    ok: rejected.length === 0,
    rejected: [...new Set(rejected)].sort(),
  };
}

export async function verifyTargetDatabaseAccess(
  database: TargetDatabaseAuditDatabase,
  identity: TargetDatabaseIdentity,
  mode: TargetDatabaseAccessMode,
  errorPrefix: string,
) {
  const connected = await database.$queryRawUnsafe<Array<{ databaseName: string | null }>>(
    "SELECT DATABASE() AS databaseName",
  );
  if (connected[0]?.databaseName !== identity.expectedDatabase) {
    throw new Error(`${errorPrefix}_CONNECTED_DATABASE_MISMATCH`);
  }

  const grantRows = await database.$queryRawUnsafe<Array<Record<string, unknown>>>(
    "SHOW GRANTS FOR CURRENT_USER()",
  );
  const statements = grantRows.flatMap((row) =>
    Object.values(row).filter((value): value is string => typeof value === "string"),
  );
  const grants = evaluateTargetDatabaseGrants(
    statements,
    identity.expectedDatabase,
    mode,
  );
  if (!grants.ok) {
    const suffix = mode === "update"
      ? "DATABASE_ACCOUNT_NOT_LEAST_PRIVILEGE"
      : "DATABASE_ACCOUNT_NOT_READ_ONLY";
    throw new Error(`${errorPrefix}_${suffix}:${grants.rejected.join(",")}`);
  }
  return {
    mode: mode === "update" ? "AUTHORIZED_WRITE" as const : "READ_ONLY" as const,
    grantsVerifiedReadOnly: mode === "read-only",
    grantsVerifiedLeastPrivilege: true,
    databaseScopeVerified: true,
  };
}
