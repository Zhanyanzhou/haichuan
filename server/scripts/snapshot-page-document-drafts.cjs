const { createHash } = require("node:crypto");
const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

require("dotenv").config({ quiet: true });

const DEFAULT_PAGE_KEYS = ["home", "products", "about", "custom", "contact"];
const prisma = new PrismaClient();

function contentHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 16);
}

function resolveOutputPath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupRoot = path.resolve(__dirname, "../../.codex-artifacts/page-document-backups");
  const outputPath = path.resolve(backupRoot, `${timestamp}.json`);

  if (!outputPath.startsWith(`${backupRoot}${path.sep}`)) {
    throw new Error("PageDocument backup path escaped the workspace backup directory");
  }
  return { backupRoot, outputPath };
}

async function main() {
  const pageKeys = process.argv.slice(2).length > 0
    ? [...new Set(process.argv.slice(2))]
    : DEFAULT_PAGE_KEYS;
  const documents = await prisma.pageDocument.findMany({
    where: { pageKey: { in: pageKeys } },
    orderBy: { pageKey: "asc" },
  });
  const missingPageKeys = pageKeys.filter(
    (pageKey) => !documents.some((document) => document.pageKey === pageKey),
  );
  if (missingPageKeys.length > 0) {
    throw new Error(`Missing PageDocument drafts: ${missingPageKeys.join(", ")}`);
  }

  const documentIds = documents.map((document) => document.id);
  const [revisions, schemes] = await Promise.all([
    prisma.pageDocumentRevision.findMany({
      where: { documentId: { in: documentIds } },
      orderBy: [{ documentId: "asc" }, { version: "asc" }],
    }),
    prisma.pageScheme.findMany({
      where: { pageKey: { in: pageKeys } },
      orderBy: [{ pageKey: "asc" }, { updatedAt: "asc" }],
    }),
  ]);

  const { backupRoot, outputPath } = resolveOutputPath();
  const snapshot = {
    format: "haichuan-page-document-draft-snapshot-v1",
    createdAt: new Date().toISOString(),
    pageKeys,
    documents,
    revisions,
    schemes,
  };
  await mkdir(backupRoot, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });

  console.log(JSON.stringify({
    outputPath,
    documentCount: documents.length,
    revisionCount: revisions.length,
    schemeCount: schemes.length,
    hashes: Object.fromEntries(
      documents.map((document) => [document.pageKey, contentHash(document.puckData)]),
    ),
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
