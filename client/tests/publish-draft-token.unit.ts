import { expect, test } from "@playwright/test";
import { resolvePublishDraftToken } from "../src/pages/admin/HomepageConfig/publishDraftToken";

const persisted = {
  persistedUpdatedAt: "2026-11-04T07:00:00.000Z",
  persistedContentHash: "a".repeat(64),
  persistedReviewStatus: "DRAFT",
};

test("读不到远端版本时仍使用刚保存的发布令牌", () => {
  expect(resolvePublishDraftToken({ ...persisted, remote: null })).toEqual({
    action: "publish",
    updatedAt: persisted.persistedUpdatedAt,
    contentHash: persisted.persistedContentHash,
  });
  expect(resolvePublishDraftToken({
    ...persisted,
    remote: { updatedAt: "2026-11-04T07:00:01.000Z" },
  })).toEqual({
    action: "publish",
    updatedAt: persisted.persistedUpdatedAt,
    contentHash: persisted.persistedContentHash,
  });
});

test("同一内容和审核状态只刷新版本时间", () => {
  expect(resolvePublishDraftToken({
    ...persisted,
    remote: {
      updatedAt: "2026-11-04T07:00:02.123Z",
      contentHash: persisted.persistedContentHash,
      reviewStatus: "DRAFT",
    },
  })).toEqual({
    action: "publish",
    updatedAt: "2026-11-04T07:00:02.123Z",
    contentHash: persisted.persistedContentHash,
  });
});

test("远端未带回审核状态时不把同一内容判成冲突", () => {
  expect(resolvePublishDraftToken({
    ...persisted,
    remote: {
      updatedAt: "2026-11-04T07:00:03.000Z",
      contentHash: persisted.persistedContentHash,
    },
  }).action).toBe("publish");
});

test("内容指纹或审核结论变化时保持冲突", () => {
  expect(resolvePublishDraftToken({
    ...persisted,
    remote: {
      updatedAt: "2026-11-04T07:00:04.000Z",
      contentHash: "b".repeat(64),
      reviewStatus: "DRAFT",
    },
  })).toEqual({ action: "conflict" });

  expect(resolvePublishDraftToken({
    ...persisted,
    remote: {
      updatedAt: "2026-11-04T07:00:04.000Z",
      contentHash: persisted.persistedContentHash,
      reviewStatus: "CHANGES_REQUESTED",
    },
  })).toEqual({ action: "conflict" });
});
