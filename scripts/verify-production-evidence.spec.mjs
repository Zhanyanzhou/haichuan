import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateProductionEvidenceStructure, verifyProductionEvidence } from "./verify-production-evidence.mjs";

const sha = (character) => character.repeat(64);
const gitSha = "a".repeat(40);
const source = "https://github.com/example/haichuan";
const image = (component, character) => ({
  image: `ghcr.io/example/haichuan-${component}`,
  digest: `sha256:${sha(character)}`,
  reference: `ghcr.io/example/haichuan-${component}@sha256:${sha(character)}`,
  provenancePredicateType: "https://slsa.dev/provenance/v1",
  sbomPredicateType: "https://spdx.dev/Document/v2.3",
});

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

function createFixture(releaseProfile = "lead-generation") {
  const root = mkdtempSync(join(tmpdir(), "haichuan-production-evidence-"));
  const files = new Map();
  const artifact = (name, content) => {
    const serialized = typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`;
    writeFileSync(join(root, name), serialized);
    const descriptor = { path: name, sha256: hash(serialized) };
    files.set(name, serialized);
    return descriptor;
  };
  const manifest = {
    schemaVersion: 3,
    gitSha,
    migrationBundleSha256: sha("b"),
    source,
    qualityGate: {
      workflow: "quality.yml",
      runId: 123,
      runUrl: `${source}/actions/runs/123`,
      headSha: gitSha,
      event: "push",
      conclusion: "success",
    },
    attestationPolicy: {
      signerWorkflow: "github.com/example/haichuan/.github/workflows/release-images.yml",
      sourceDigest: gitSha,
      imageAttestationsVerified: true,
      provenancePredicateType: "https://slsa.dev/provenance/v1",
      sbomPredicateType: "https://spdx.dev/Document/v2.3",
      manifestPredicateType: "https://slsa.dev/provenance/v1",
    },
    publicSeo: {
      snapshotHash: sha("f"),
      prerenderManifestSha256: sha("0"),
      sourceArtifactId: 456,
      sourceArtifactDigest: `sha256:${sha("9")}`,
    },
    server: image("server", "c"),
    client: image("client", "d"),
    operations: {
      ...image("operations", "e"),
      runtimeExecutables: [
        "/usr/local/bin/backup.sh",
        "/usr/local/bin/check-backup-health.sh",
        "/usr/local/bin/restore.sh",
        "/usr/local/bin/restore-drill.sh",
        "/usr/local/bin/prune-backups.sh",
      ],
    },
  };
  const manifestDescriptor = artifact("release-manifest.json", manifest);
  const manifestAttestationBundle = artifact("release-manifest.attestation.json", { mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json" });
  const receipt = (name, kind, provider, outcome, subjectSha256 = manifestDescriptor.sha256) => artifact(`${name}.json`, {
    schemaVersion: 1,
    kind,
    provider,
    outcome,
    observedAt: "2026-09-06T10:00:00Z",
    environmentIdSha256: sha("1"),
    approvalReferenceSha256: sha("2"),
    releaseGitSha: gitSha,
    manifestSha256: manifestDescriptor.sha256,
    subjectSha256,
  });
  const preflightReport = artifact("preflight-report.json", "preflight report\n");
  const rollbackRunbook = artifact("rollback-runbook.md", "# rollback\n");
  const externalServices = ["email", "sms", "logistics", "payment-gateway", "wechat", "object-storage"]
    .map((name) => {
      const status = releaseProfile === "commerce" && name === "payment-gateway" ? "verified" : "disabled";
      return {
        name,
        status,
        receipt: receipt(
          `external-${name}`,
          `external-service-${name}`,
          status === "verified" ? "external-service-audit" : "release-policy",
          status,
        ),
      };
    });
  const evidence = {
    schemaVersion: 3,
    generatedAt: "2026-09-06T10:00:00Z",
    environment: {
      approvalReferenceSha256: sha("2"),
      releaseOwner: "release-owner",
      rollbackOwner: "rollback-owner",
      incidentOwner: "incident-owner",
    },
    release: {
      manifest: manifestDescriptor,
      manifestAttestationBundle,
      runtimeIdentityReceipt: receipt("runtime-identity", "runtime-identity", "docker-cli", "verified"),
      composeContractReceipt: receipt("compose-contract", "compose-contract", "docker-compose", "verified"),
    },
    database: {
      migrationStatus: "up-to-date",
      preflightReport,
      preflightReceipt: receipt("database-preflight", "database-preflight", "release-preflight-cli", "up-to-date", preflightReport.sha256),
    },
    admin: {
      activeSuperAdminCount: 1,
      initializationOutcome: "existing-account-verified",
      receipt: receipt("admin", "admin-initialization", "release-preflight-cli", "existing-account-verified"),
    },
    storage: { receipt: receipt("storage", "persistent-storage", "docker-cli", "verified") },
    recovery: {
      rpoSeconds: 86400,
      rtoSeconds: 3600,
      latestBackupAgeSeconds: 120,
      detectionSeconds: 30,
      targetPreparationSeconds: 120,
      databaseRestoreSeconds: 600,
      serviceRecoverySeconds: 300,
      trafficCutoverSeconds: 30,
      consistencyMode: "quiesced",
      receipts: {
        backupManifest: receipt("backup-manifest", "backup-manifest", "backup-cli", "verified"),
        restoreDrill: receipt("restore-drill", "restore-drill", "restore-drill-cli", "verified"),
        writeQuiesce: receipt("write-quiesce", "write-quiesce", "release-operator", "verified"),
        offsiteReplication: receipt("offsite-replication", "offsite-replication", "backup-provider", "verified"),
      },
    },
    edge: { receipt: receipt("edge", "edge-security", "edge-audit", "verified") },
    observability: { receipt: receipt("observability", "observability-alert-drill", "monitor-audit", "verified") },
    featureGates: { receipt: receipt("feature-gates", "feature-gates", "release-preflight-cli", releaseProfile) },
    externalServices,
    rollback: {
      runbook: rollbackRunbook,
      receipt: receipt("rollback", "rollback-runbook", "release-operator", "verified", rollbackRunbook.sha256),
    },
  };
  const trusted = {
    evidenceRoot: root,
    environmentIdSha256: sha("1"),
    approvalReferenceSha256: sha("2"),
    releaseGitSha: gitSha,
    migrationBundleSha256: sha("b"),
    releaseSource: source,
    releaseProfile,
    repository: "example/haichuan",
    sourceRef: "refs/heads/main",
    manifestSignerWorkflow: "github.com/example/haichuan/.github/workflows/release-images.yml",
    evidenceSignerWorkflow: "github.com/example/haichuan/.github/workflows/production-evidence.yml",
  };
  const evidenceBundlePath = join(root, "production-evidence.attestation.json");
  writeFileSync(evidenceBundlePath, "{}\n");
  const writeEvidence = () => {
    const evidencePath = join(root, "production-evidence.json");
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    return evidencePath;
  };
  return { root, files, evidence, trusted, evidenceBundlePath, writeEvidence, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function withFixture(callback, releaseProfile) {
  const fixture = createFixture(releaseProfile);
  try {
    callback(fixture);
  } finally {
    fixture.cleanup();
  }
}

async function withFixtureAsync(callback, releaseProfile) {
  const fixture = createFixture(releaseProfile);
  try {
    await callback(fixture);
  } finally {
    fixture.cleanup();
  }
}

function successfulExecutor(calls = []) {
  return async (command, args, options) => {
    calls.push({ command, args, options });
    const subject = args[2];
    const predicateType = args[args.indexOf("--predicate-type") + 1];
    const subjectSha256 = subject.startsWith("oci://")
      ? subject.match(/@sha256:([a-f0-9]{64})$/)?.[1]
      : hash(readFileSync(subject));
    return {
      exitCode: 0,
      stdout: JSON.stringify([{
        verificationResult: {
          statement: { predicateType, subject: [{ digest: { sha256: subjectSha256 } }] },
        },
      }]),
      stderr: "",
    };
  };
}

function expectCode(fixture, mutator, code) {
  mutator(fixture);
  assert.throws(() => validateProductionEvidenceStructure(fixture.evidence, fixture.trusted), (error) => error?.message === code);
}

test("accepts the pure structure and hash layer before cryptographic verification", () => {
  withFixture(({ evidence, trusted }) => {
    const result = validateProductionEvidenceStructure(evidence, trusted);
    assert.equal(result.manifest.gitSha, gitSha);
    assert.equal(result.manifestSha256, evidence.release.manifest.sha256);
  });
});

test("rejects manifest identity copied from the untrusted manifest itself", () => {
  withFixture((fixture) => {
    fixture.trusted.releaseGitSha = "f".repeat(40);
    assert.throws(() => validateProductionEvidenceStructure(fixture.evidence, fixture.trusted), (error) => error?.message === "RELEASE_MANIFEST_GIT_SHA_MISMATCH");
  });
});

test("binds every signed claim to the trusted environment and approval", () => {
  withFixture((fixture) => {
    fixture.trusted.environmentIdSha256 = sha("8");
    assert.throws(
      () => validateProductionEvidenceStructure(fixture.evidence, fixture.trusted),
      (error) => error?.message === "PRODUCTION_EVIDENCE_RECEIPT_ENVIRONMENT_MISMATCH:release.runtimeIdentity",
    );
  });
  withFixture((fixture) => {
    fixture.evidence.environment.approvalReferenceSha256 = sha("8");
    assert.throws(
      () => validateProductionEvidenceStructure(fixture.evidence, fixture.trusted),
      (error) => error?.message === "PRODUCTION_EVIDENCE_APPROVAL_MISMATCH",
    );
  });
});

test("rejects boolean self-declarations and every unknown evidence field", () => {
  withFixture((fixture) => expectCode(fixture, ({ evidence }) => {
    evidence.release.runtimeIdentityVerified = true;
  }, "PRODUCTION_EVIDENCE_RELEASE_SCHEMA_INVALID:runtimeIdentityVerified"));
});

test("rejects unknown fields in the referenced manifest schema", () => {
  withFixture((fixture) => {
    const descriptor = fixture.evidence.release.manifest;
    const manifest = JSON.parse(fixture.files.get(descriptor.path));
    manifest.untrustedExpectedGitSha = gitSha;
    const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
    writeFileSync(join(fixture.root, descriptor.path), serialized);
    descriptor.sha256 = hash(serialized);
    assert.throws(
      () => validateProductionEvidenceStructure(fixture.evidence, fixture.trusted),
      (error) => error?.message === "PRODUCTION_EVIDENCE_MANIFEST_SCHEMA_INVALID:untrustedExpectedGitSha",
    );
  });
});

test("recomputes artifact hashes and rejects tampering", () => {
  withFixture((fixture) => expectCode(fixture, ({ root, evidence }) => {
    writeFileSync(join(root, evidence.database.preflightReport.path), "tampered\n");
  }, "PRODUCTION_EVIDENCE_ARTIFACT_HASH_MISMATCH:database.preflightReport"));
});

test("rejects artifact traversal outside the evidence root", () => {
  withFixture((fixture) => expectCode(fixture, ({ evidence }) => {
    evidence.database.preflightReport.path = "../outside.json";
  }, "PRODUCTION_EVIDENCE_ARTIFACT_OUTSIDE_ROOT:database.preflightReport"));
});

test("rejects a receipt that is not cross-bound to the manifest", () => {
  withFixture((fixture) => {
    const descriptor = fixture.evidence.edge.receipt;
    const receipt = JSON.parse(fixture.files.get(descriptor.path));
    receipt.manifestSha256 = sha("9");
    const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
    writeFileSync(join(fixture.root, descriptor.path), serialized);
    descriptor.sha256 = hash(serialized);
    assert.throws(() => validateProductionEvidenceStructure(fixture.evidence, fixture.trusted), (error) => error?.message === "PRODUCTION_EVIDENCE_RECEIPT_MANIFEST_MISMATCH:edge");
  });
});

test("fails closed when the manifest attestation bundle is missing", () => {
  withFixture((fixture) => expectCode(fixture, ({ evidence }) => {
    delete evidence.release.manifestAttestationBundle;
  }, "PRODUCTION_EVIDENCE_ARTIFACT_SCHEMA_INVALID:release.manifestAttestationBundle"));
});

test("normalizes sensitive keys and covers snake, kebab, credential and auth forms", () => {
  for (const key of ["api_token", "private-key", "serviceCredential", "auth_header"]) {
    withFixture((fixture) => {
      fixture.evidence.environment[key] = "forbidden";
      assert.throws(
        () => validateProductionEvidenceStructure(fixture.evidence, fixture.trusted),
        (error) => error?.message === `PRODUCTION_EVIDENCE_SENSITIVE_KEY_FORBIDDEN:evidence.environment.${key}`,
      );
    });
  }
});

test("rejects unknown fields inside provider receipts", () => {
  withFixture((fixture) => {
    const descriptor = fixture.evidence.edge.receipt;
    const receipt = JSON.parse(fixture.files.get(descriptor.path));
    receipt.note = "not part of the receipt contract";
    const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
    writeFileSync(join(fixture.root, descriptor.path), serialized);
    descriptor.sha256 = hash(serialized);
    assert.throws(() => validateProductionEvidenceStructure(fixture.evidence, fixture.trusted), (error) => error?.message === "PRODUCTION_EVIDENCE_RECEIPT_SCHEMA_INVALID:edge:note");
  });
});

test("rejects unmet RPO and end-to-end RTO", () => {
  withFixture((fixture) => expectCode(fixture, ({ evidence }) => {
    evidence.recovery.latestBackupAgeSeconds = 86401;
  }, "PRODUCTION_EVIDENCE_RPO_NOT_MET"));
  withFixture((fixture) => expectCode(fixture, ({ evidence }) => {
    evidence.recovery.serviceRecoverySeconds = 3001;
  }, "PRODUCTION_EVIDENCE_RTO_NOT_MET"));
});

test("requires the exact, unique external-service set", () => {
  withFixture((fixture) => expectCode(fixture, ({ evidence }) => {
    evidence.externalServices.pop();
  }, "PRODUCTION_EVIDENCE_EXTERNAL_SERVICE_MISSING:object-storage"));
  withFixture((fixture) => expectCode(fixture, ({ evidence }) => {
    evidence.externalServices.push(evidence.externalServices[0]);
  }, "PRODUCTION_EVIDENCE_EXTERNAL_SERVICE_DUPLICATED:email"));
  withFixture((fixture) => expectCode(fixture, ({ evidence }) => {
    evidence.externalServices[0].name = "unknown-provider";
  }, "PRODUCTION_EVIDENCE_EXTERNAL_SERVICE_UNEXPECTED:unknown-provider"));
});

test("commerce profile cannot disable the required payment service", () => {
  withFixture((fixture) => {
    const payment = fixture.evidence.externalServices.find(({ name }) => name === "payment-gateway");
    payment.status = "disabled";
    assert.throws(() => validateProductionEvidenceStructure(fixture.evidence, fixture.trusted), (error) => error?.message === "PRODUCTION_EVIDENCE_COMMERCE_PAYMENT_SERVICE_NOT_VERIFIED");
  }, "commerce");
});

test("production evidence rejects legacy and unknown release profiles", () => {
  for (const releaseProfile of ["content-only", "transactional", "Commerce", "unknown"]) {
    withFixture((fixture) => {
      fixture.trusted.releaseProfile = releaseProfile;
      assert.throws(
        () => validateProductionEvidenceStructure(fixture.evidence, fixture.trusted),
        { message: "PRODUCTION_EVIDENCE_RELEASE_PROFILE_INVALID" },
      );
    });
  }
});

test("disabled statuses require policy receipts", () => {
  withFixture((fixture) => {
    const email = fixture.evidence.externalServices.find(({ name }) => name === "email");
    const descriptor = email.receipt;
    const receipt = JSON.parse(fixture.files.get(descriptor.path));
    receipt.provider = "external-service-audit";
    const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
    writeFileSync(join(fixture.root, descriptor.path), serialized);
    descriptor.sha256 = hash(serialized);
    assert.throws(() => validateProductionEvidenceStructure(fixture.evidence, fixture.trusted), (error) => error?.message === "PRODUCTION_EVIDENCE_RECEIPT_PROVIDER_MISMATCH:externalServices.email");
  });
});

test("accepts not-applicable only when a policy receipt records that outcome", () => {
  withFixture((fixture) => {
    const logistics = fixture.evidence.externalServices.find(({ name }) => name === "logistics");
    logistics.status = "not-applicable";
    const descriptor = logistics.receipt;
    const receipt = JSON.parse(fixture.files.get(descriptor.path));
    receipt.outcome = "not-applicable";
    const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
    writeFileSync(join(fixture.root, descriptor.path), serialized);
    descriptor.sha256 = hash(serialized);
    assert.doesNotThrow(() => validateProductionEvidenceStructure(fixture.evidence, fixture.trusted));
  });
});

test("orchestrator verifies signed evidence, manifest and all OCI provenance/SBOM subjects", async () => {
  await withFixtureAsync(async (fixture) => {
    const calls = [];
    const result = await verifyProductionEvidence(fixture.evidence, fixture.trusted, {
      evidencePath: fixture.writeEvidence(),
      evidenceBundlePath: fixture.evidenceBundlePath,
      executor: successfulExecutor(calls),
    });
    assert.equal(result.verifiedAttestationCount, 8);
    assert.deepEqual(result.verifiedSubjects, [
      "production-evidence", "release-manifest", "server-provenance", "server-sbom",
      "client-provenance", "client-sbom", "operations-provenance", "operations-sbom",
    ]);
    assert.equal(calls.length, 8);
    for (const call of calls) {
      assert.equal(call.command, "gh");
      assert.ok(Array.isArray(call.args));
      assert.equal(call.options.shell, false);
      assert.ok(call.args.includes("--source-ref"));
      assert.ok(call.args.includes("--source-digest"));
      assert.ok(call.args.includes("--signer-workflow"));
      assert.equal(call.args[call.args.indexOf("--repo") + 1], fixture.trusted.repository);
      assert.equal(call.args[call.args.indexOf("--source-digest") + 1], fixture.trusted.releaseGitSha);
      assert.equal(call.args[call.args.indexOf("--source-ref") + 1], fixture.trusted.sourceRef);
    }
    assert.equal(calls[0].args[calls[0].args.indexOf("--signer-workflow") + 1], fixture.trusted.evidenceSignerWorkflow);
    assert.ok(calls.slice(1).every(({ args }) => args[args.indexOf("--signer-workflow") + 1] === fixture.trusted.manifestSignerWorkflow));
    assert.ok(calls.slice(2).every(({ args }) => args.includes("--bundle-from-oci")));
  });
});

test("forged receipt plus recomputed descriptor hash still fails without a matching evidence attestation", async () => {
  await withFixtureAsync(async (fixture) => {
    const descriptor = fixture.evidence.edge.receipt;
    const receipt = JSON.parse(fixture.files.get(descriptor.path));
    receipt.observedAt = "2026-09-06T10:05:00Z";
    const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
    writeFileSync(join(fixture.root, descriptor.path), serialized);
    descriptor.sha256 = hash(serialized);
    const evidencePath = fixture.writeEvidence();
    assert.doesNotThrow(() => validateProductionEvidenceStructure(fixture.evidence, fixture.trusted));
    await assert.rejects(
      verifyProductionEvidence(fixture.evidence, fixture.trusted, {
        evidencePath,
        evidenceBundlePath: fixture.evidenceBundlePath,
        executor: async () => ({ exitCode: 1, stdout: "", stderr: "subject digest mismatch" }),
      }),
      (error) => error?.message === "PRODUCTION_EVIDENCE_ATTESTATION_VERIFY_FAILED:production-evidence",
    );
  });
});

test("unsigned production claims fail closed when the top-level evidence bundle is absent", async () => {
  await withFixtureAsync(async (fixture) => {
    rmSync(fixture.evidenceBundlePath);
    await assert.rejects(
      verifyProductionEvidence(fixture.evidence, fixture.trusted, {
        evidencePath: fixture.writeEvidence(),
        evidenceBundlePath: fixture.evidenceBundlePath,
        executor: successfulExecutor(),
      }),
      (error) => error?.message === "PRODUCTION_EVIDENCE_ATTESTATION_BUNDLE_INVALID",
    );
  });
});

test("missing or tampered manifest bundle fails closed before gh verification", async () => {
  await withFixtureAsync(async (fixture) => {
    writeFileSync(join(fixture.root, fixture.evidence.release.manifestAttestationBundle.path), "tampered\n");
    await assert.rejects(
      verifyProductionEvidence(fixture.evidence, fixture.trusted, {
        evidencePath: fixture.writeEvidence(),
        evidenceBundlePath: fixture.evidenceBundlePath,
        executor: successfulExecutor(),
      }),
      (error) => error?.message === "PRODUCTION_EVIDENCE_ARTIFACT_HASH_MISMATCH:release.manifestAttestationBundle",
    );
  });
});

test("a rehashed forged manifest bundle still fails cryptographic verification", async () => {
  await withFixtureAsync(async (fixture) => {
    const descriptor = fixture.evidence.release.manifestAttestationBundle;
    const forgedBundle = '{"forged":true}\n';
    writeFileSync(join(fixture.root, descriptor.path), forgedBundle);
    descriptor.sha256 = hash(forgedBundle);
    const fallback = successfulExecutor();
    let callIndex = 0;
    const executor = async (command, args, options) => {
      callIndex += 1;
      if (callIndex === 2) return { exitCode: 1, stdout: "", stderr: "invalid signature" };
      return fallback(command, args, options);
    };
    await assert.rejects(
      verifyProductionEvidence(fixture.evidence, fixture.trusted, {
        evidencePath: fixture.writeEvidence(),
        evidenceBundlePath: fixture.evidenceBundlePath,
        executor,
      }),
      (error) => error?.message === "PRODUCTION_EVIDENCE_ATTESTATION_VERIFY_FAILED:release-manifest",
    );
  });
});

test("wrong repository, signer workflow, source SHA or source ref fails closed", async () => {
  withFixture((fixture) => {
    fixture.trusted.repository = "other/haichuan";
    assert.throws(
      () => validateProductionEvidenceStructure(fixture.evidence, fixture.trusted),
      (error) => error?.message === "PRODUCTION_EVIDENCE_EXPECTED_REPOSITORY_MISMATCH",
    );
  });
  withFixture((fixture) => {
    fixture.trusted.manifestSignerWorkflow = "github.com/example/haichuan/.github/workflows/other.yml";
    assert.throws(
      () => validateProductionEvidenceStructure(fixture.evidence, fixture.trusted),
      (error) => error?.message === "PRODUCTION_EVIDENCE_EXPECTED_MANIFEST_SIGNER_INVALID",
    );
  });
  withFixture((fixture) => {
    fixture.trusted.evidenceSignerWorkflow = "github.com/other/haichuan/.github/workflows/production-evidence.yml";
    assert.throws(
      () => validateProductionEvidenceStructure(fixture.evidence, fixture.trusted),
      (error) => error?.message === "PRODUCTION_EVIDENCE_EXPECTED_EVIDENCE_SIGNER_INVALID",
    );
  });
  withFixture((fixture) => {
    fixture.trusted.releaseGitSha = "f".repeat(40);
    assert.throws(
      () => validateProductionEvidenceStructure(fixture.evidence, fixture.trusted),
      (error) => error?.message === "RELEASE_MANIFEST_GIT_SHA_MISMATCH",
    );
  });
  await withFixtureAsync(async (fixture) => {
    fixture.trusted.sourceRef = "refs/heads/release/wrong";
    await assert.rejects(
      verifyProductionEvidence(fixture.evidence, fixture.trusted, {
        evidencePath: fixture.writeEvidence(),
        evidenceBundlePath: fixture.evidenceBundlePath,
        executor: async () => ({ exitCode: 1, stdout: "", stderr: "source ref mismatch" }),
      }),
      (error) => error?.message === "PRODUCTION_EVIDENCE_ATTESTATION_VERIFY_FAILED:production-evidence",
    );
  });
});

test("one OCI provenance or SBOM failure rejects the complete production evidence", async () => {
  await withFixtureAsync(async (fixture) => {
    const fallback = successfulExecutor();
    const executor = async (command, args, options) => {
      if (args[2].includes("-operations@") && args.includes("https://spdx.dev/Document/v2.3")) {
        return { exitCode: 1, stdout: "", stderr: "SBOM attestation missing" };
      }
      return fallback(command, args, options);
    };
    await assert.rejects(
      verifyProductionEvidence(fixture.evidence, fixture.trusted, {
        evidencePath: fixture.writeEvidence(),
        evidenceBundlePath: fixture.evidenceBundlePath,
        executor,
      }),
      (error) => error?.message === "PRODUCTION_EVIDENCE_ATTESTATION_VERIFY_FAILED:operations-sbom",
    );
  });
});

test("command-injection text is rejected and never reaches an executor or shell", async () => {
  await withFixtureAsync(async (fixture) => {
    fixture.trusted.sourceRef = "refs/heads/main;whoami";
    let called = false;
    await assert.rejects(
      verifyProductionEvidence(fixture.evidence, fixture.trusted, {
        evidencePath: fixture.writeEvidence(),
        evidenceBundlePath: fixture.evidenceBundlePath,
        executor: async () => {
          called = true;
          return { exitCode: 0, stdout: "[]", stderr: "" };
        },
      }),
      (error) => error?.message === "PRODUCTION_EVIDENCE_EXPECTED_SOURCE_REF_INVALID",
    );
    assert.equal(called, false);
  });
});

test("missing gh executable fails closed", async () => {
  await withFixtureAsync(async (fixture) => {
    await assert.rejects(
      verifyProductionEvidence(fixture.evidence, fixture.trusted, {
        evidencePath: fixture.writeEvidence(),
        evidenceBundlePath: fixture.evidenceBundlePath,
        executor: async () => {
          throw Object.assign(new Error("not found"), { code: "ENOENT" });
        },
      }),
      (error) => error?.message === "PRODUCTION_EVIDENCE_GH_CLI_MISSING",
    );
  });
});

test("runbook command exposes every independent trust anchor required by the verifier", () => {
  const runbook = readFileSync(new URL("../docs/PRODUCTION_RELEASE_RUNBOOK.md", import.meta.url), "utf8");
  for (const flag of [
    "--evidence", "--evidence-root", "--evidence-bundle", "--environment-id-sha256",
    "--approval-reference-sha256", "--release-git-sha", "--migration-bundle-sha256",
    "--release-source", "--release-profile", "--repo", "--source-ref",
    "--manifest-signer-workflow", "--evidence-signer-workflow",
  ]) {
    assert.ok(runbook.includes(flag), `runbook is missing ${flag}`);
  }
  assert.match(runbook, /JSON receipt 只是一条结构化 claim，不具备独立证明力/);
  assert.match(runbook, /不能接受操作者上传的自报 JSON 后直接签名/);
});
