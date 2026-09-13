import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createMediaPublicationReferenceKey } from "../modules/page-modules/media-publication-manifest";

export type MediaAuthorizationBackfillReferenceClassification =
  | "EXACT_ASSET"
  | "LEGACY_FILE"
  | "STATIC_BUNDLE"
  | "EXTERNAL"
  | "MISSING"
  | "AMBIGUOUS"
  | "UNSAFE";

type LegacyBackfillClassification =
  | "READY"
  | "AUTHORIZATION_GAP"
  | "INELIGIBLE"
  | "UNREGISTERED"
  | "UNMANAGED"
  | "DANGEROUS";

export interface MediaAuthorizationBackfillCandidate {
  ownerType: "DYNAMIC_TEMPLATE_VERSION" | "PAGE_DOCUMENT_REVISION";
  ownerId: number;
  referencePath: string;
  url: string;
  assetId?: number;
  /** 新快照应使用引用来源分类；classification 仅兼容第一版 dry-run 输入。 */
  referenceClassification?: MediaAuthorizationBackfillReferenceClassification;
  classification?: MediaAuthorizationBackfillReferenceClassification | LegacyBackfillClassification;
  eligible?: boolean | null;
  reasonCodes?: readonly string[];
  authorizationState?: string | null;
}

export interface MediaAuthorizationBackfillPlanEntry {
  ownerType: MediaAuthorizationBackfillCandidate["ownerType"];
  ownerId: number;
  referencePath: string;
  referenceKey: string;
  url: string;
  assetId: number | null;
  referenceClassification: MediaAuthorizationBackfillReferenceClassification;
  eligibilityStatus: "ELIGIBLE" | "INELIGIBLE" | "UNKNOWN";
  eligibilityReasonCodes: string[];
  authorizationState: string | null;
}

export interface MediaAuthorizationBackfillPlan {
  mode: "dry-run";
  planVersion: 2;
  planHash: string;
  counts: Record<MediaAuthorizationBackfillReferenceClassification, number>;
  eligibilityCounts: Record<MediaAuthorizationBackfillPlanEntry["eligibilityStatus"], number>;
  entries: MediaAuthorizationBackfillPlanEntry[];
}

const REFERENCE_CLASSIFICATIONS = new Set<MediaAuthorizationBackfillReferenceClassification>([
  "EXACT_ASSET",
  "LEGACY_FILE",
  "STATIC_BUNDLE",
  "EXTERNAL",
  "MISSING",
  "AMBIGUOUS",
  "UNSAFE",
]);

function normalizeReferenceClassification(
  candidate: MediaAuthorizationBackfillCandidate,
  assetId: number | null,
): MediaAuthorizationBackfillReferenceClassification {
  const value = candidate.referenceClassification ?? candidate.classification;
  if (REFERENCE_CLASSIFICATIONS.has(value as MediaAuthorizationBackfillReferenceClassification)) {
    return value as MediaAuthorizationBackfillReferenceClassification;
  }
  switch (value) {
    case "READY": return assetId ? "EXACT_ASSET" : "STATIC_BUNDLE";
    case "AUTHORIZATION_GAP": return assetId ? "EXACT_ASSET" : "LEGACY_FILE";
    case "INELIGIBLE": return assetId ? "EXACT_ASSET" : "AMBIGUOUS";
    case "UNREGISTERED": return "MISSING";
    case "UNMANAGED": return "EXTERNAL";
    case "DANGEROUS": return "UNSAFE";
    default: throw new Error("backfill 引用来源分类无效");
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildMediaAuthorizationBackfillPlan(
  candidates: readonly MediaAuthorizationBackfillCandidate[],
): MediaAuthorizationBackfillPlan {
  const entries = candidates.map((candidate): MediaAuthorizationBackfillPlanEntry => {
    if (!Number.isInteger(candidate.ownerId) || candidate.ownerId <= 0) {
      throw new Error("backfill ownerId 必须是正整数");
    }
    const referencePath = candidate.referencePath.trim();
    const url = candidate.url.trim();
    if (!referencePath || !url) throw new Error("backfill 引用路径和 URL 不能为空");
    const assetId = Number.isInteger(candidate.assetId) && Number(candidate.assetId) > 0
      ? Number(candidate.assetId)
      : null;
    const referenceClassification = normalizeReferenceClassification(candidate, assetId);
    if (referenceClassification === "EXACT_ASSET" && !assetId) {
      throw new Error("EXACT_ASSET 分类必须提供有效 assetId");
    }
    const eligibilityStatus = candidate.eligible === true
      ? "ELIGIBLE"
      : candidate.eligible === false
        ? "INELIGIBLE"
        : "UNKNOWN";
    return {
      ownerType: candidate.ownerType,
      ownerId: candidate.ownerId,
      referencePath,
      referenceKey: createMediaPublicationReferenceKey(referencePath),
      url,
      assetId,
      referenceClassification,
      eligibilityStatus,
      eligibilityReasonCodes: [...new Set(candidate.reasonCodes ?? [])].sort(),
      authorizationState: candidate.authorizationState?.trim() || null,
    };
  }).sort((left, right) => (
    left.ownerType.localeCompare(right.ownerType)
    || left.ownerId - right.ownerId
    || left.referencePath.localeCompare(right.referencePath)
    || left.url.localeCompare(right.url)
  ));
  const unique = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.ownerType}:${entry.ownerId}:${entry.referenceKey}`;
    if (unique.has(key)) throw new Error(`backfill 输入包含重复引用：${entry.referencePath}`);
    unique.add(key);
  }
  const counts: MediaAuthorizationBackfillPlan["counts"] = {
    EXACT_ASSET: 0,
    LEGACY_FILE: 0,
    STATIC_BUNDLE: 0,
    EXTERNAL: 0,
    MISSING: 0,
    AMBIGUOUS: 0,
    UNSAFE: 0,
  };
  entries.forEach((entry) => { counts[entry.referenceClassification] += 1; });
  const eligibilityCounts: MediaAuthorizationBackfillPlan["eligibilityCounts"] = {
    ELIGIBLE: 0,
    INELIGIBLE: 0,
    UNKNOWN: 0,
  };
  entries.forEach((entry) => { eligibilityCounts[entry.eligibilityStatus] += 1; });
  const hashPayload = { planVersion: 2, counts, eligibilityCounts, entries };
  return {
    mode: "dry-run",
    planVersion: 2,
    planHash: createHash("sha256").update(canonicalJson(hashPayload), "utf8").digest("hex"),
    counts,
    eligibilityCounts,
    entries,
  };
}

export function parseMediaAuthorizationBackfillArgs(args: readonly string[]): {
  inputPath: string;
} {
  if (args.includes("--apply")) {
    throw new Error("第一阶段回填只支持 dry-run，禁止 --apply 和数据库写入");
  }
  const inputIndex = args.indexOf("--input");
  const inputPath = inputIndex >= 0 ? args[inputIndex + 1]?.trim() : "";
  if (!inputPath) {
    throw new Error("请用 --input <snapshot.json> 提供只读候选快照");
  }
  return { inputPath };
}

function main(): void {
  const { inputPath } = parseMediaAuthorizationBackfillArgs(process.argv.slice(2));
  const parsed = JSON.parse(readFileSync(inputPath, "utf8")) as unknown;
  if (!Array.isArray(parsed)) throw new Error("回填输入必须是候选数组");
  const plan = buildMediaAuthorizationBackfillPlan(
    parsed as MediaAuthorizationBackfillCandidate[],
  );
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
