import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { PageModulesService } from "./page-modules.service";
import { MediaAuthorizationResolverService, type MediaFileVerificationScope } from "../upload/media-authorization-resolver.service";
import {
  CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY,
  createContentTemplatePublicationAttestation,
} from "./content-template-contract";
import { createMediaPublicationReferenceKey } from "./media-publication-manifest";
import { definitionFixture } from "./dynamic-template-test-fixture";
import { calculateDynamicTemplateDefinitionChecksum } from "./dynamic-template-definition-integrity";
import { DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY } from "./dynamic-template-instance";

test("同一读取仍重新核对授权，文件登记变化时不复用之前的校验", async () => {
  const asset = {
    id: 19, storageKey: "page-assets/scope.png", checksumSha256: "a".repeat(64),
    lifecycleRevision: 1, status: "READY", accessLevel: "PUBLIC",
    authorization: { revision: 1, publicUseEpoch: 1, reviewStatus: "APPROVED", revocationStatus: "ACTIVE",
      publicWebUseAllowed: true, validFrom: null, validUntil: null },
  };
  const resolver = new MediaAuthorizationResolverService({
    mediaAsset: { findMany: async () => [asset] },
  } as never);
  let hashes = 0;
  (resolver as unknown as { verifyManagedFile(): Promise<unknown> }).verifyManagedFile = async () => {
    hashes += 1;
    return { issue: null, sourceBytes: 10 };
  };
  const fileVerificationScope: MediaFileVerificationScope = new Map();
  const read = () => resolver.resolveReferences([{ url: "/uploads/page-assets/scope.png" }], { fileVerificationScope });
  assert.equal((await read()).eligible, true);
  assert.equal((await read()).eligible, true);
  assert.equal(hashes, 1);
  asset.checksumSha256 = "b".repeat(64);
  assert.equal((await read()).eligible, true);
  assert.equal(hashes, 2);
  asset.lifecycleRevision += 1;
  assert.equal((await read()).eligible, true);
  assert.equal(hashes, 3);
  asset.authorization.revocationStatus = "REVOKED";
  assert.equal((await read()).eligible, false);
  assert.equal(hashes, 3, "授权失效优先失败关闭，不使用缓存成功结果覆盖授权判断");
});

test("模板解析在请求内复用查询，下一次读取仍拒绝已损坏的版本定义", async () => {
  const definition = definitionFixture();
  let definitionChecksum = calculateDynamicTemplateDefinitionChecksum(definition);
  let queries = 0;
  const service = new PageModulesService({
    dynamicTemplateVersion: { findMany: async () => {
      queries += 1;
      return [{ version: 1, schemaVersion: definition.schemaVersion, definition, definitionChecksum,
        template: { templateId: definition.templateId } }];
    } },
  } as never);
  type Scope = { byDb: WeakMap<object, unknown> };
  const internals = service as unknown as {
    hydrateDynamicTemplateDefinitions(data: unknown, db: unknown, scope: Scope): Promise<Record<string, unknown>>;
    collectMediaRightsIssues(db: unknown, data: unknown, metadata: unknown, key: string, scope: Scope): Promise<unknown>;
    prisma: unknown;
  };
  const data = { content: [{ type: "动态模板实例", props: {
    id: "read-scope-instance", templateId: definition.templateId, templateVersion: 1,
    instanceSchemaVersion: 1, contentBySlotId: {},
  } }] };
  const scope: Scope = { byDb: new WeakMap() };
  const first = await internals.hydrateDynamicTemplateDefinitions(data, undefined, scope);
  await internals.collectMediaRightsIssues(internals.prisma, data, {}, "home", scope);
  const returned = await internals.hydrateDynamicTemplateDefinitions(data, undefined, scope);
  assert.equal(queries, 1);
  assert.equal(returned, first);
  assert.equal(Object.keys(first[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY] as object).length, 1);
  definitionChecksum = "corrupted";
  const next = await internals.hydrateDynamicTemplateDefinitions(data, undefined, {
    byDb: new WeakMap(),
  });
  assert.equal(queries, 2);
  assert.deepEqual(next[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY], {});
  const otherDb = {
    dynamicTemplateVersion: { findMany: async () => {
      queries += 1;
      return [];
    } },
  };
  const fromOtherDb = await internals.hydrateDynamicTemplateDefinitions(data, otherDb, scope);
  assert.equal(queries, 3, "相同操作scope不得串用另一个数据库客户端的模板结果");
  assert.deepEqual(fromOtherDb[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY], {});
  const otherSnapshot = { ...data };
  await internals.hydrateDynamicTemplateDefinitions(otherSnapshot, undefined, scope);
  assert.equal(queries, 4, "不同文档对象也必须独立解析");
});

test("公开与后台读取预检复用单次解析，后续请求重新验证篡改、撤销和发布状态", async () => {
  const temporaryRoot = join(process.cwd(), "../.codex-tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(join(temporaryRoot, "page-read-perf-"));
  const previousRoot = process.env.PUBLIC_MEDIA_ROOT;
  process.env.PUBLIC_MEDIA_ROOT = root;
  try {
    const storageKey = "page-assets/performance.png";
    const url = `/uploads/${storageKey}`;
    const bytes = Buffer.from("synthetic-public-page-performance-fixture");
    await mkdir(join(root, "page-assets"));
    await writeFile(join(root, storageKey), bytes);
    const asset = {
      id: 31, storageKey, status: "READY", accessLevel: "PUBLIC", lifecycleRevision: 2,
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      authorization: {
        revision: 4, publicUseEpoch: 3, reviewStatus: "APPROVED", revocationStatus: "ACTIVE",
        publicWebUseAllowed: true, validFrom: null, validUntil: null,
      },
    };
    const referencePath = "metadata.ogImage";
    const manifest = [{
      assetId: asset.id, referencePath, referenceKey: createMediaPublicationReferenceKey(referencePath),
      assetLifecycleRevision: 2, authorizationRevision: 4, publicUseEpoch: 3,
      asset: { storageKey },
    }];
    const prisma = {
      mediaAsset: { findMany: async () => [asset] },
      pageDocumentRevisionMediaAsset: { findMany: async () => manifest },
    };
    const resolver = new MediaAuthorizationResolverService(prisma as never);
    const resolverInternals = resolver as unknown as {
      verifyManagedFile(key: string, checksum: string): Promise<unknown>;
    };
    const verify = resolverInternals.verifyManagedFile.bind(resolver);
    let hashes = 0;
    resolverInternals.verifyManagedFile = (...args) => { hashes += 1; return verify(...args); };
    const puckData = { content: [], root: { props: {} } };
    const snapshot = {
      pageKey: "home", locale: "zh-CN", status: "PUBLISHED", publishedRevisionId: 7,
      puckData, metadata: {
        ogImage: url,
        [CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY]: createContentTemplatePublicationAttestation(),
      },
      publishedAt: new Date(), updatedAt: new Date(), version: 1,
    };
    const service = new PageModulesService(prisma as never, resolver);
    // 隔离数据库快照与无关的组成规则，媒体清单、整页解析和公开/后台读取预检走真实实现。
    const internals = service as unknown as {
      getPublishedPageDocumentSnapshot(): Promise<unknown>;
      getLocalizedPublishedPageSnapshot(): Promise<unknown>;
      collectContentTemplateIssues(): unknown[];
      collectPuckDataErrors(): Promise<unknown[]>;
      collectSiteSettingsReadinessIssues(): Promise<unknown[]>;
      readPublishedImageFacts(): Promise<unknown>;
      loadDynamicTemplateDefinitions(data: unknown, db: unknown): Promise<unknown>;
      withAuthorizedStaffRead(actor: unknown, operation: (db: unknown) => Promise<unknown>): Promise<unknown>;
      resolvePagePublicationMedia(db: unknown, data: unknown, metadata: unknown, key: string,
        scope: { byDb: WeakMap<object, unknown> }): Promise<unknown>;
    };
    let published = true;
    internals.getPublishedPageDocumentSnapshot = async () => published ? snapshot : null;
    internals.getLocalizedPublishedPageSnapshot = async () => published ? snapshot : null;
    internals.collectContentTemplateIssues = () => [];
    internals.collectPuckDataErrors = async () => [];
    internals.collectSiteSettingsReadinessIssues = async () => [];
    internals.readPublishedImageFacts = async () => ({});
    const hydrate = internals.loadDynamicTemplateDefinitions.bind(service);
    let hydrations = 0;
    internals.loadDynamicTemplateDefinitions = (...args) => { hydrations += 1; return hydrate(...args); };

    for (const read of [
      () => service.getPublishedPageDocument("home"),
      () => service.getLocalizedPublishedPageDocument("home", "zh-CN"),
    ]) {
      const before = hashes;
      const beforeHydrations = hydrations;
      assert.equal((await read())?.status, "PUBLISHED");
      assert.equal(hashes - before, 1, "清单与整页校验共享文件校验，下一次读取重新哈希");
      assert.equal(hydrations - beforeHydrations, 1, "媒体引用、来源检查及最终响应共用模板解析");
    }
    const transaction = { ...prisma };
    let staffChecks = 0;
    internals.withAuthorizedStaffRead = async (_actor, operation) => {
      staffChecks += 1;
      return operation(transaction);
    };
    const operations = [
      async () => (await service.getPublishedPageDocumentForAdmin("home"))?.publicationReadiness.valid,
      async () => {
        const response = await service.getLocalizedPublishedPageDocumentForAdmin("home", "zh-CN", 17);
        return response && "publicationReadiness" in response ? response.publicationReadiness.valid : false;
      },
      async () => (await service.validatePageDocument("home", puckData, snapshot.metadata)).valid,
      async () => (await service.validateLocalizedPageDocument("home", "zh-CN", puckData, snapshot.metadata, 17)).valid,
      async () => (await service.validatePageDocumentSnapshot(transaction as never, "home", puckData, snapshot.metadata)).valid,
    ];
    for (const operation of operations) {
      for (let request = 0; request < 2; request += 1) {
        const before = hashes;
        const beforeHydrations = hydrations;
        assert.equal(await operation(), true);
        assert.equal(hashes - before, 1, "每一次后台读取/预检重新检查原文件");
        assert.equal(hydrations - beforeHydrations, 1, "同一次后台读取/预检只解析一次模板");
      }
    }
    assert.equal(staffChecks, 4, "本地化后台读取和预检每轮仍进入授权包装器");
    const dbScope = { byDb: new WeakMap<object, unknown>() };
    const beforeDbReads = hashes;
    await internals.resolvePagePublicationMedia(prisma, puckData, snapshot.metadata, "home", dbScope);
    await internals.resolvePagePublicationMedia(transaction, puckData, snapshot.metadata, "home", dbScope);
    assert.equal(hashes - beforeDbReads, 2, "同scope不同db不得复用原文件校验结果");
    const beforeTamper = hashes;
    await writeFile(join(root, storageKey), "tampered");
    assert.equal((await service.getLocalizedPublishedPageDocument("home", "zh-CN"))?.status, "INVALID");
    assert.equal(hashes, beforeTamper + 1, "新请求仍检查源文件，而不是复用上次成功");
    await writeFile(join(root, storageKey), bytes);
    asset.authorization.publicUseEpoch += 1;
    assert.equal((await service.getPublishedPageDocument("home"))?.status, "INVALID");
    asset.authorization.publicUseEpoch = 3;
    asset.authorization.revocationStatus = "REVOKED";
    assert.equal((await service.getLocalizedPublishedPageDocument("home", "zh-CN"))?.status, "INVALID");
    published = false;
    assert.equal(await service.getPublishedPageDocument("home"), null);
    assert.equal(await service.getLocalizedPublishedPageDocument("home", "zh-CN"), null);
  } finally {
    if (previousRoot === undefined) delete process.env.PUBLIC_MEDIA_ROOT;
    else process.env.PUBLIC_MEDIA_ROOT = previousRoot;
    await rm(root, { recursive: true, force: true });
  }
});
