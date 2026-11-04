// 发布前静默保存拿到的版本时间，可能在随后的只读校验窗口里被同一份草稿的
// 后续写入推进。内容指纹和审核状态仍一致时，用服务端当前版本时间发布；
// 内容或审核结论变了则保持冲突，不覆盖远端。

export type PublishDraftIdentity = {
  updatedAt?: string | null;
  contentHash?: string | null;
  reviewStatus?: string | null;
};

export type PublishDraftToken =
  | { action: "publish"; updatedAt: string; contentHash: string }
  | { action: "conflict" };

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

export function resolvePublishDraftToken(input: {
  persistedUpdatedAt: string;
  persistedContentHash: string;
  persistedReviewStatus?: string | null;
  remote: PublishDraftIdentity | null;
}): PublishDraftToken {
  const remoteUpdatedAt = input.remote?.updatedAt;
  const remoteContentHash = input.remote?.contentHash;
  if (!hasText(remoteUpdatedAt) || !hasText(remoteContentHash)) {
    return {
      action: "publish",
      updatedAt: input.persistedUpdatedAt,
      contentHash: input.persistedContentHash,
    };
  }

  const persistedReviewStatus = input.persistedReviewStatus ?? "DRAFT";
  const remoteReviewStatus = input.remote?.reviewStatus;
  const reviewDiverged = hasText(remoteReviewStatus)
    && remoteReviewStatus !== persistedReviewStatus;
  if (remoteContentHash !== input.persistedContentHash || reviewDiverged) {
    return { action: "conflict" };
  }

  return {
    action: "publish",
    updatedAt: remoteUpdatedAt,
    contentHash: remoteContentHash,
  };
}
