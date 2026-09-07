export type ReleaseIdentity = {
  revision: string;
  source: string;
  migrationBundleSha256: string;
  complete: boolean;
};

const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const SAFE_SOURCE_PATTERN = /^[A-Za-z0-9._/@:+-]{1,200}$/;

function releaseDigest(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string") return "unknown";
  const candidate = value.trim();
  if (candidate === "local") return candidate;
  return pattern.test(candidate) ? candidate.toLowerCase() : "unknown";
}

export function sanitizeReleaseSource(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  const candidate = value.trim();
  if (!candidate) return "unknown";
  if (/^https?:\/\//i.test(candidate)) {
    try {
      const url = new URL(candidate);
      if (url.username || url.password) return "unknown";
      const sanitized = `${url.protocol}//${url.host}${url.pathname}`;
      return sanitized.length <= 200 ? sanitized : "unknown";
    } catch {
      return "unknown";
    }
  }
  return SAFE_SOURCE_PATTERN.test(candidate) ? candidate : "unknown";
}

export function resolveReleaseIdentity(
  environment: NodeJS.ProcessEnv = process.env,
): ReleaseIdentity {
  const revision = releaseDigest(
    environment.RELEASE_GIT_SHA ?? environment.BUILD_REVISION,
    GIT_SHA_PATTERN,
  );
  const migrationBundleSha256 = releaseDigest(
    environment.MIGRATION_BUNDLE_SHA256,
    SHA256_PATTERN,
  );
  const source = sanitizeReleaseSource(
    environment.RELEASE_SOURCE ?? environment.BUILD_SOURCE,
  );
  return {
    revision,
    source,
    migrationBundleSha256,
    complete:
      GIT_SHA_PATTERN.test(revision) &&
      SHA256_PATTERN.test(migrationBundleSha256) &&
      source !== "unknown" &&
      source !== "local",
  };
}

