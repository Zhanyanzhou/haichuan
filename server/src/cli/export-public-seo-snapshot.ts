import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaService } from "../common/prisma/prisma.service";
import { PageModulesService } from "../modules/page-modules/page-modules.service";
import { MediaAuthorizationResolverService } from "../modules/upload/media-authorization-resolver.service";
import {
  parseTargetDatabaseIdentity,
  verifyTargetDatabaseAccess,
} from "./target-database-audit";
import {
  createPublicSeoExportInput,
  createPublicSeoLegalSourceFacts,
  PublicSeoSnapshotDatabase,
} from "./public-seo-snapshot-source";

function parseCommand(argv: string[]) {
  if (argv.length === 1 && argv[0] === "--print-legal-signoff-hashes") {
    return { mode: "legal-signoff-hashes" as const };
  }
  if (argv.length === 2 && argv[0] === "--output" && argv[1]) {
    return { mode: "export" as const, output: resolve(argv[1]) };
  }
  throw new Error("PUBLIC_SEO_EXPORT_COMMAND_INVALID");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function readLegalSources() {
  const projectRoot = resolve(__dirname, "../../..");
  const legalEntityPath = resolve(projectRoot, "client/src/config/legalEntity.ts");
  const privacyPath = resolve(projectRoot, "client/src/pages/public/Privacy/index.tsx");
  const businessInfoPath = resolve(projectRoot, "client/src/pages/public/BusinessInfo/index.tsx");
  const [legalEntity, privacy, businessInfo] = await Promise.all([
    readFile(legalEntityPath, "utf8"),
    readFile(privacyPath, "utf8"),
    readFile(businessInfoPath, "utf8"),
  ]);
  const legalEntityName = /export const LEGAL_ENTITY\s*=\s*\{[\s\S]*?\bname:\s*"([^"]{1,200})"/.exec(legalEntity)?.[1];
  if (!legalEntityName) throw new Error("PUBLIC_SEO_EXPORT_LEGAL_ENTITY_NAME_UNAVAILABLE");
  return createPublicSeoLegalSourceFacts({
    legalEntityName,
    legalEntitySource: legalEntity,
    privacyPageSource: privacy,
    businessInfoPageSource: businessInfo,
  });
}

export function createPublicSeoExportConfig(environment: NodeJS.ProcessEnv) {
  if (environment.PUBLIC_SEO_EXPORT_READ_ONLY_AUTHORIZED !== "1") {
    throw new Error("PUBLIC_SEO_EXPORT_READ_ONLY_AUTHORIZATION_REQUIRED");
  }
  const identity = parseTargetDatabaseIdentity({
    environmentId: environment.PUBLIC_SEO_SOURCE_ENVIRONMENT_ID,
    expectedDatabase: environment.PUBLIC_SEO_EXPECTED_DATABASE,
    approvalReference: environment.PUBLIC_SEO_APPROVAL_REFERENCE,
    databaseUrl: environment.DATABASE_URL,
    errorPrefix: "PUBLIC_SEO_EXPORT",
  });
  const expectedOrigin = environment.PUBLIC_SEO_EXPECTED_ORIGIN?.trim() ?? "";
  const expectedDatabaseHost = environment.PUBLIC_SEO_EXPECTED_DATABASE_HOST?.trim().toLowerCase() ?? "";
  const releaseProfile = environment.PUBLIC_SEO_RELEASE_PROFILE?.trim();
  if (!expectedOrigin) throw new Error("PUBLIC_SEO_EXPORT_EXPECTED_ORIGIN_REQUIRED");
  if (!expectedDatabaseHost || expectedDatabaseHost.length > 253) {
    throw new Error("PUBLIC_SEO_EXPORT_EXPECTED_DATABASE_HOST_REQUIRED");
  }
  let actualDatabaseHost = "";
  try {
    actualDatabaseHost = new URL(environment.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    throw new Error("PUBLIC_SEO_EXPORT_DATABASE_URL_INVALID");
  }
  if (actualDatabaseHost !== expectedDatabaseHost) {
    throw new Error("PUBLIC_SEO_EXPORT_DATABASE_HOST_MISMATCH");
  }
  if (releaseProfile !== "lead-generation" && releaseProfile !== "commerce") {
    throw new Error("PUBLIC_SEO_EXPORT_RELEASE_PROFILE_REQUIRED");
  }
  return {
    identity,
    source: {
      expectedOrigin,
      sourceEnvironmentId: identity.environmentId,
      expectedDatabase: identity.expectedDatabase,
      databaseHostHash: sha256(actualDatabaseHost),
      approvalReferenceHash: identity.approvalReferenceHash,
      releaseProfile,
    },
  } as const;
}

function safeErrorCode(error: unknown): string {
  if (
    error instanceof Error
    && /^PUBLIC_SEO_EXPORT_[A-Z0-9_]+(?::[A-Z0-9_,.-]+)?$/.test(error.message)
  ) return error.message;
  return "PUBLIC_SEO_EXPORT_FAILED";
}

async function main() {
  const command = parseCommand(process.argv.slice(2));
  const legalSources = await readLegalSources();
  if (command.mode === "legal-signoff-hashes") {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      privacyPolicyReviewReferenceSuffix: `sha256:${legalSources.hashes.privacy}`,
      legalEntityReviewReferenceSuffix: `sha256:${legalSources.hashes.businessInfo}`,
    }, null, 2)}\n`);
    return;
  }
  const config = createPublicSeoExportConfig(process.env);
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    await verifyTargetDatabaseAccess(
      prisma,
      config.identity,
      "read-only",
      "PUBLIC_SEO_EXPORT",
    );
    const pageModules = new PageModulesService(
      prisma,
      new MediaAuthorizationResolverService(prisma),
    );
    const source = await createPublicSeoExportInput(
      prisma as unknown as PublicSeoSnapshotDatabase,
      {
        ...config.source,
        legalSourceHashes: legalSources.hashes,
        legalEntityName: legalSources.legalEntityName,
      },
      (pageKey, puckData, metadata) =>
        pageModules.validatePageDocument(pageKey, puckData, metadata),
    );
    await writeFile(command.output, `${JSON.stringify(source, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    process.stdout.write(`PUBLIC_SEO_EXPORT_OK routes=${source.routes.length} sourceHash=${source.sourceSnapshotHashBefore}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${safeErrorCode(error)}\n`);
    process.exitCode = 1;
  });
}
