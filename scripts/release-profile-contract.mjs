import { readFileSync } from "node:fs";

const authorityPath = new URL("../server/src/common/release/release-profile.ts", import.meta.url);
const authoritySource = readFileSync(authorityPath, "utf8");
const profilesMatch = /export const RELEASE_PROFILES = (\[[^\]\r\n]+\]) as const;/.exec(authoritySource);

if (!profilesMatch) throw new Error("RELEASE_PROFILE_AUTHORITY_MISSING");

let profiles;
try {
  profiles = JSON.parse(profilesMatch[1]);
} catch {
  throw new Error("RELEASE_PROFILE_AUTHORITY_INVALID");
}

if (JSON.stringify(profiles) !== JSON.stringify(["lead-generation", "commerce"])) {
  throw new Error("RELEASE_PROFILE_AUTHORITY_INVALID");
}

export const RELEASE_PROFILE_CONTRACT = Object.freeze({
  profiles: Object.freeze([...profiles]),
  defaultProfile: profiles[0],
  commerceProfile: profiles[1],
});

export function isReleaseProfile(value) {
  return RELEASE_PROFILE_CONTRACT.profiles.includes(value);
}

export function requireReleaseProfile(value) {
  if (!isReleaseProfile(value)) throw new Error("PRODUCTION_EVIDENCE_RELEASE_PROFILE_INVALID");
  return value;
}
