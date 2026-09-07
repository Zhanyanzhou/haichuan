import assert from "node:assert/strict";
import test from "node:test";

import {
  RELEASE_PROFILE_CONTRACT,
  isReleaseProfile,
  requireReleaseProfile,
} from "./release-profile-contract.mjs";

test("release profile authority exposes only lead-generation and commerce", () => {
  assert.deepEqual(RELEASE_PROFILE_CONTRACT.profiles, ["lead-generation", "commerce"]);
  assert.equal(RELEASE_PROFILE_CONTRACT.defaultProfile, "lead-generation");
  assert.equal(RELEASE_PROFILE_CONTRACT.commerceProfile, "commerce");
});

test("legacy and unknown release profiles fail closed", () => {
  for (const profile of ["content-only", "transactional", "", "Commerce", undefined]) {
    assert.equal(isReleaseProfile(profile), false);
    assert.throws(() => requireReleaseProfile(profile), {
      message: "PRODUCTION_EVIDENCE_RELEASE_PROFILE_INVALID",
    });
  }
});
