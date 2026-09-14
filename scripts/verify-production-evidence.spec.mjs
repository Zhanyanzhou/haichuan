import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import "./prepare-production-evidence-signing.spec.mjs";
import "./verify-production-evidence-workflow.spec.mjs";

import { validateProductionEvidenceStructure, verifyProductionEvidence } from "./verify-production-evidence.mjs";

const sha = (character) => character.repeat(64);
const gitSha = "a".repeat(40);
const source = "https://github.com/example/haichuan";
function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

function createFixture(releaseProfile = "lead-generation") {
  const root = mkdtempSync(join(tmpdir(), "haichuan-production-evidence-"));
  const files = new Map();
  const artifact = (name, content) => {
    const serialized = typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`;
    const absolutePath = join(root, name);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, serialized);
    const descriptor = { path: name, sha256: hash(serialized) };
    files.set(name, serialized);
    return descriptor;
  };
  const image = (component, character) => ({
    image: `ghcr.io/example/haichuan-${component}`,
    digest: `sha256:${sha(character)}`,
    reference: `ghcr.io/example/haichuan-${component}@sha256:${sha(character)}`,
    signatureBundle: artifact(`attestations/${component}-image.sigstore.json`, { mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json" }),
    provenanceBundle: artifact(`attestations/${component}-provenance.sigstore.json`, { mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json" }),
    sbomBundle: artifact(`attestations/${component}-sbom.sigstore.json`, { mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json" }),
    provenancePredicateType: "https://slsa.dev/provenance/v1",
    sbomPredicateType: "https://spdx.dev/Document",
  });
  const manifest = {
    schemaVersion: 6,
    releaseStage: "production",
    imageTag: `sha-${gitSha}`,
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
      signingSystem: "sigstore-cosign-keyless",
      cosignVersion: "v3.1.3",
      bundleMediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
      signerWorkflow: "github.com/example/haichuan/.github/workflows/release-images.yml",
      signerIdentity: "https://github.com/example/haichuan/.github/workflows/release-images.yml@refs/heads/main",
      certificateOidcIssuer: "https://token.actions.githubusercontent.com",
      sourceRef: "refs/heads/main",
      sourceDigest: gitSha,
      imageSignaturesVerified: true,
      imageAttestationsVerified: true,
      provenancePredicateType: "https://slsa.dev/provenance/v1",
      sbomPredicateType: "https://spdx.dev/Document",
      manifestPredicateType: "https://slsa.dev/provenance/v1",
    },
    publicSeo: {
      sourceStage: "production",
      snapshotHash: sha("f"),
      prerenderManifestSha256: sha("0"),
      sourceArtifactId: 456,
      sourceArtifactDigest: `sha256:${sha("9")}`,
      sourceKind: "approved-snapshot",
      contentReady: true,
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
  writeFileSync(evidenceBundlePath, '{"mediaType":"application/vnd.dev.sigstore.bundle.v0.3+json"}\n');
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
    const subject = args.at(-1);
    if (args[0] === "verify") {
      const digest = subject.match(/@(sha256:[a-f0-9]{64})$/)?.[1];
      return {
        exitCode: 0,
        stdout: `${JSON.stringify([{ critical: { image: { "docker-manifest-digest": digest } } }])}\n`,
        stderr: "",
      };
    }
    if (args[0] === "verify-blob-attestation") {
      if (!subject.endsWith("release-manifest.json")) return { exitCode: 0, stdout: "", stderr: "" };
      const manifest = JSON.parse(readFileSync(subject, "utf8"));
      const manifestSha256 = hash(readFileSync(subject));
      const statement = {
        _type: "https://in-toto.io/Statement/v1",
        predicateType: "https://slsa.dev/provenance/v1",
        subject: [{ digest: { sha256: manifestSha256 } }],
        predicate: {
          buildDefinition: {
            buildType: `${manifest.source}/blob/${manifest.gitSha}/.github/workflows/release-images.yml#release-manifest-v6`,
            externalParameters: {
              gitSha: manifest.gitSha,
              sourceRef: manifest.attestationPolicy.sourceRef,
              qualityGateRunId: manifest.qualityGate.runId,
              schemaVersion: manifest.schemaVersion,
              releaseStage: manifest.releaseStage,
              imageTag: manifest.imageTag,
            },
            resolvedDependencies: [
              { uri: manifest.source, digest: { gitCommit: manifest.gitSha } },
              ...["server", "client", "operations"].map((component) => ({
                uri: manifest[component].image,
                digest: { sha256: manifest[component].digest.slice("sha256:".length) },
              })),
            ],
          },
          runDetails: { builder: { id: manifest.attestationPolicy.signerIdentity } },
        },
      };
      return {
        exitCode: 0,
        stdout: `${JSON.stringify({ payloadType: "application/vnd.in-toto+json", payload: Buffer.from(JSON.stringify(statement)).toString("base64"), signatures: [] })}\n`,
        stderr: "",
      };
    }
    if (args[0] !== "verify-attestation") return { exitCode: 0, stdout: "", stderr: "" };
    const subjectSha256 = subject.match(/@sha256:([a-f0-9]{64})$/)?.[1];
    const component = subject.match(/haichuan-(server|client|operations)@/)?.[1];
    const predicateName = args[args.indexOf("--type") + 1];
    const predicateType = predicateName === "spdxjson"
      ? "https://spdx.dev/Document"
      : "https://slsa.dev/provenance/v1";
    const predicate = predicateName === "spdxjson"
      ? { spdxVersion: "SPDX-2.3", SPDXID: "SPDXRef-DOCUMENT" }
      : {
          buildDefinition: {
            externalParameters: {
              component,
              releaseStage: "production",
              imageTag: `sha-${gitSha}`,
              source,
              sourceRef: "refs/heads/main",
              gitSha,
            },
          },
          runDetails: {
            builder: {
              id: "https://github.com/example/haichuan/.github/workflows/release-images.yml@refs/heads/main",
            },
          },
        };
    const statement = {
      _type: "https://in-toto.io/Statement/v1",
      predicateType,
      subject: [{ digest: { sha256: subjectSha256 } }],
      predicate,
    };
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({ payloadType: "application/vnd.in-toto+json", payload: Buffer.from(JSON.stringify(statement)).toString("base64"), signatures: [] })}\n`,
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

test("production evidence rejects a stage-bound preproduction release manifest", () => {
  withFixture((fixture) => {
    const descriptor = fixture.evidence.release.manifest;
    const manifest = JSON.parse(fixture.files.get(descriptor.path));
    manifest.releaseStage = "preproduction";
    manifest.imageTag = `preproduction-sha-${manifest.gitSha}`;
    manifest.publicSeo.sourceStage = "preproduction";
    const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
    writeFileSync(join(fixture.root, descriptor.path), serialized);
    descriptor.sha256 = hash(serialized);
    assert.throws(
      () => validateProductionEvidenceStructure(fixture.evidence, fixture.trusted),
      (error) => error?.message === "RELEASE_MANIFEST_STAGE_MISMATCH",
    );
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
    assert.equal(result.verifiedAttestationCount, 11);
    assert.deepEqual(result.verifiedSubjects, [
      "production-evidence", "release-manifest",
      "server-signature", "server-provenance", "server-sbom",
      "client-signature", "client-provenance", "client-sbom",
      "operations-signature", "operations-provenance", "operations-sbom",
    ]);
    assert.equal(calls.length, 11);
    for (const call of calls) {
      assert.equal(call.command, "cosign");
      assert.ok(Array.isArray(call.args));
      assert.equal(call.options.shell, false);
      assert.equal(call.args[call.args.indexOf("--certificate-github-workflow-sha") + 1], fixture.trusted.releaseGitSha);
      assert.equal(call.args[call.args.indexOf("--certificate-github-workflow-ref") + 1], fixture.trusted.sourceRef);
      assert.equal(call.args[call.args.indexOf("--certificate-github-workflow-repository") + 1], fixture.trusted.repository);
      assert.equal(call.args[call.args.indexOf("--certificate-oidc-issuer") + 1], "https://token.actions.githubusercontent.com");
    }
    assert.equal(
      calls[0].args[calls[0].args.indexOf("--certificate-identity") + 1],
      `https://${fixture.trusted.evidenceSignerWorkflow}@${fixture.trusted.sourceRef}`,
    );
    assert.ok(calls.slice(1).every(({ args }) =>
      args[args.indexOf("--certificate-identity") + 1] ===
        `https://${fixture.trusted.manifestSignerWorkflow}@${fixture.trusted.sourceRef}`));
    assert.deepEqual(calls.slice(2).map(({ args }) => args[0]), [
      "verify", "verify-attestation", "verify-attestation",
      "verify", "verify-attestation", "verify-attestation",
      "verify", "verify-attestation", "verify-attestation",
    ]);
    for (const call of calls.slice(2)) {
      const bundlePath = call.args[call.args.indexOf("--bundle") + 1];
      assert.ok(bundlePath.startsWith(fixture.root));
      assert.match(bundlePath, /attestations[\\/](?:server|client|operations)-(?:image|provenance|sbom)\.sigstore\.json$/);
    }
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

test("top-level production evidence rejects a legacy bundle before invoking Cosign", async () => {
  await withFixtureAsync(async (fixture) => {
    writeFileSync(fixture.evidenceBundlePath, '{"mediaType":"application/vnd.dev.cosign.bundle+json"}\n');
    let called = false;
    await assert.rejects(
      verifyProductionEvidence(fixture.evidence, fixture.trusted, {
        evidencePath: fixture.writeEvidence(),
        evidenceBundlePath: fixture.evidenceBundlePath,
        executor: async () => {
          called = true;
          return { exitCode: 0, stdout: "", stderr: "" };
        },
      }),
      (error) => error?.message === "PRODUCTION_EVIDENCE_ATTESTATION_BUNDLE_FORMAT_INVALID",
    );
    assert.equal(called, false);
  });
});

test("a forged top-level object with only the standard mediaType still requires Cosign proof", async () => {
  await withFixtureAsync(async (fixture) => {
    writeFileSync(fixture.evidenceBundlePath, '{"mediaType":"application/vnd.dev.sigstore.bundle.v0.3+json"}\n');
    await assert.rejects(
      verifyProductionEvidence(fixture.evidence, fixture.trusted, {
        evidencePath: fixture.writeEvidence(),
        evidenceBundlePath: fixture.evidenceBundlePath,
        executor: async () => ({ exitCode: 1, stdout: "", stderr: "invalid protobuf bundle" }),
      }),
      (error) => error?.message === "PRODUCTION_EVIDENCE_ATTESTATION_VERIFY_FAILED:production-evidence",
    );
  });
});

test("missing or tampered manifest bundle fails closed before Cosign verification", async () => {
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

test("a manifest-bound image sidecar must be a standard Sigstore protobuf bundle", () => {
  withFixture((fixture) => {
    const descriptor = fixture.evidence.release.manifest;
    const manifestPath = join(fixture.root, descriptor.path);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const bundleDescriptor = manifest.server.signatureBundle;
    const bundlePath = join(fixture.root, bundleDescriptor.path);
    writeFileSync(bundlePath, `${JSON.stringify({ mediaType: "application/vnd.dev.cosign.simplesigning.v1+json" })}\n`);
    bundleDescriptor.sha256 = hash(readFileSync(bundlePath));
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
    descriptor.sha256 = hash(readFileSync(manifestPath));
    assert.throws(
      () => validateProductionEvidenceStructure(fixture.evidence, fixture.trusted),
      (error) => error?.message === "PRODUCTION_EVIDENCE_SIGSTORE_BUNDLE_FORMAT_INVALID:server:signature",
    );
  });
});

test("a forged image sidecar with only the standard mediaType fails its own Cosign verification", async () => {
  await withFixtureAsync(async (fixture) => {
    const fallback = successfulExecutor();
    await assert.rejects(
      verifyProductionEvidence(fixture.evidence, fixture.trusted, {
        evidencePath: fixture.writeEvidence(),
        evidenceBundlePath: fixture.evidenceBundlePath,
        executor: async (command, args, options) => {
          const bundlePath = args[args.indexOf("--bundle") + 1];
          if (args[0] === "verify" && /server-image\.sigstore\.json$/.test(bundlePath)) {
            return { exitCode: 1, stdout: "", stderr: "invalid protobuf bundle" };
          }
          return fallback(command, args, options);
        },
      }),
      (error) => error?.message === "PRODUCTION_EVIDENCE_ATTESTATION_VERIFY_FAILED:server-signature",
    );
  });
});

test("a rehashed forged manifest bundle still fails cryptographic verification", async () => {
  await withFixtureAsync(async (fixture) => {
    const descriptor = fixture.evidence.release.manifestAttestationBundle;
    const forgedBundle = '{"mediaType":"application/vnd.dev.sigstore.bundle.v0.3+json","forged":true}\n';
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

test("verified manifest DSSE must bind builder, release facts and all resolved dependencies", async () => {
  await withFixtureAsync(async (fixture) => {
    const fallback = successfulExecutor();
    const corruptManifestOutput = async (field) => {
      await assert.rejects(
        verifyProductionEvidence(fixture.evidence, fixture.trusted, {
          evidencePath: fixture.writeEvidence(),
          evidenceBundlePath: fixture.evidenceBundlePath,
          executor: async (command, args, options) => {
            const result = await fallback(command, args, options);
            if (args[0] !== "verify-blob-attestation" || !args.at(-1).endsWith("release-manifest.json")) return result;
            const envelope = JSON.parse(result.stdout);
            const statement = JSON.parse(Buffer.from(envelope.payload, "base64").toString("utf8"));
            if (field === "builder") statement.predicate.runDetails.builder.id = "https://github.com/other/workflow";
            if (field === "dependencies") statement.predicate.buildDefinition.resolvedDependencies.pop();
            envelope.payload = Buffer.from(JSON.stringify(statement)).toString("base64");
            return { ...result, stdout: `${JSON.stringify(envelope)}\n` };
          },
        }),
        (error) => error?.message === (field === "builder"
          ? "PRODUCTION_EVIDENCE_MANIFEST_PROVENANCE_CONTENT_MISMATCH"
          : "PRODUCTION_EVIDENCE_MANIFEST_PROVENANCE_DEPENDENCIES_MISMATCH"),
      );
    };
    await corruptManifestOutput("builder");
    await corruptManifestOutput("dependencies");
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
      (error) => error?.message === "PRODUCTION_EVIDENCE_MANIFEST_SOURCE_REF_MISMATCH",
    );
  });
});

test("one OCI provenance or SBOM failure rejects the complete production evidence", async () => {
  await withFixtureAsync(async (fixture) => {
    const fallback = successfulExecutor();
    const executor = async (command, args, options) => {
      if (args.at(-1).includes("-operations@") && args.includes("spdxjson")) {
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

test("missing cosign executable fails closed", async () => {
  await withFixtureAsync(async (fixture) => {
    await assert.rejects(
      verifyProductionEvidence(fixture.evidence, fixture.trusted, {
        evidencePath: fixture.writeEvidence(),
        evidenceBundlePath: fixture.evidenceBundlePath,
        executor: async () => {
          throw Object.assign(new Error("not found"), { code: "ENOENT" });
        },
      }),
      (error) => error?.message === "PRODUCTION_EVIDENCE_COSIGN_CLI_MISSING",
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
