import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveReleaseIdentity,
  sanitizeReleaseSource,
} from "./release-identity";

test("发布身份只暴露完整摘要和去凭证来源", () => {
  const identity = resolveReleaseIdentity({
    RELEASE_GIT_SHA: "A".repeat(40),
    RELEASE_SOURCE: "https://github.com/example/jewelry?token=secret#fragment",
    MIGRATION_BUNDLE_SHA256: "B".repeat(64),
  });

  assert.deepEqual(identity, {
    revision: "a".repeat(40),
    source: "https://github.com/example/jewelry",
    migrationBundleSha256: "b".repeat(64),
    complete: true,
  });
});

test("非法或含用户凭证的发布字段安全退化", () => {
  assert.equal(
    sanitizeReleaseSource("https://user:password@example.test/repository"),
    "unknown",
  );
  assert.deepEqual(resolveReleaseIdentity({
    RELEASE_GIT_SHA: "main",
    RELEASE_SOURCE: "source with spaces and token=secret",
    MIGRATION_BUNDLE_SHA256: "short",
  }), {
    revision: "unknown",
    source: "unknown",
    migrationBundleSha256: "unknown",
    complete: false,
  });
});

test("本地构建身份明确标记为非完整发布身份", () => {
  assert.deepEqual(resolveReleaseIdentity({
    BUILD_REVISION: "local",
    BUILD_SOURCE: "local",
    MIGRATION_BUNDLE_SHA256: "local",
  }), {
    revision: "local",
    source: "local",
    migrationBundleSha256: "local",
    complete: false,
  });
});

