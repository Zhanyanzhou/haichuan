import { createHash } from "node:crypto";
import type { MediaReferenceOrigin } from "@prisma/client";
import type {
  MediaReferenceInput,
  MediaReferenceIssue,
} from "../upload/media-authorization-resolver.service";
import { CONTENT_TEMPLATE_MANAGED_MEDIA_AUTHORIZATION_POLICY } from "./content-template-contract";

export interface PublicationMediaReference extends MediaReferenceInput {
  origin: MediaReferenceOrigin;
  dynamicTemplateVersionId?: number;
}

export interface ResolvedPublicationMediaItem {
  url: string;
  context: { path?: string; sourceType?: string; sourceId?: string };
  assetId?: number;
  lifecycleRevision?: number;
  authorizationRevision?: number | null;
  publicUseEpoch?: number | null;
  eligibility: { eligible: boolean; reasons: readonly string[] };
}

export interface MediaPublicationResolution {
  items: ResolvedPublicationMediaItem[];
  issues: MediaReferenceIssue[];
  eligible: boolean;
  mode: "SHADOW" | "ENFORCE";
}

export function createMediaPublicationReferenceKey(referencePath: string): string {
  return createHash("sha256").update(referencePath.trim(), "utf8").digest("hex");
}

export function buildMediaPublicationManifestRows(
  references: readonly PublicationMediaReference[],
  resolution: MediaPublicationResolution,
) {
  const referenceByPath = new Map(
    references.map((reference) => [reference.path?.trim() ?? "", reference]),
  );
  return resolution.items.flatMap((item) => {
    const referencePath = item.context.path?.trim() ?? "";
    const reference = referenceByPath.get(referencePath);
    if (
      !reference
      || !Number.isInteger(item.assetId)
      || !Number.isInteger(item.lifecycleRevision)
      || !Number.isInteger(item.authorizationRevision)
      || !Number.isInteger(item.publicUseEpoch)
      || Number(item.lifecycleRevision) <= 0
      || Number(item.authorizationRevision) <= 0
      || Number(item.publicUseEpoch) < 0
      || !item.eligibility.eligible
    ) return [];
    return [{
      assetId: Number(item.assetId),
      referenceKey: createMediaPublicationReferenceKey(referencePath),
      referencePath,
      origin: reference.origin,
      assetLifecycleRevision: Number(item.lifecycleRevision),
      authorizationRevision: Number(item.authorizationRevision),
      publicUseEpoch: Number(item.publicUseEpoch),
      ...(Number.isInteger(reference.dynamicTemplateVersionId)
        ? { dynamicTemplateVersionId: Number(reference.dynamicTemplateVersionId) }
        : {}),
    }];
  });
}

export function buildManagedMediaShadowReport(
  resolution: MediaPublicationResolution,
) {
  const authorizationWarningCount = resolution.issues.filter(
    (issue) => issue.severity === "WARNING",
  ).length;
  const errorCount = resolution.issues.filter(
    (issue) => issue.severity === "ERROR",
  ).length;
  return {
    enforcementPublicationGateVersion:
      CONTENT_TEMPLATE_MANAGED_MEDIA_AUTHORIZATION_POLICY.enforcementPublicationGateVersion,
    shadowPublicationGateVersion:
      CONTENT_TEMPLATE_MANAGED_MEDIA_AUTHORIZATION_POLICY.shadowPublicationGateVersion,
    enforcementEligible: errorCount === 0,
    shadowEligible: resolution.items.every((item) => item.eligibility.eligible),
    referenceCount: resolution.items.length,
    errorCount,
    authorizationWarningCount,
  } as const;
}

/** 清单只记录发布时有效的集中授权；已继承授权后按当前事实失败关闭。 */
export function isCurrentResolutionCompatibleWithManifest(
  manifest: {
    assetId: number;
    assetLifecycleRevision: number;
    authorizationRevision: number;
    publicUseEpoch: number;
  },
  item: ResolvedPublicationMediaItem,
): boolean {
  if (
    item.assetId !== manifest.assetId
    || item.lifecycleRevision !== manifest.assetLifecycleRevision
    || item.authorizationRevision !== manifest.authorizationRevision
    || (item.publicUseEpoch ?? 0) !== manifest.publicUseEpoch
  ) return false;
  return item.eligibility.eligible;
}
