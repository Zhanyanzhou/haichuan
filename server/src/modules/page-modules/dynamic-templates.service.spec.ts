import assert from "node:assert/strict";
import test from "node:test";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import { DynamicTemplatesController } from "./dynamic-templates.controller";
import { DynamicTemplatesService } from "./dynamic-templates.service";
import { definitionFixture } from "./dynamic-template-test-fixture";
import { PageModulesModule } from "./page-modules.module";
import { PageModulesService } from "./page-modules.service";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createStatefulService() {
  const calls: Array<{ operation: string; args: any }> = [];
  let template: any = null;
  let draft: any = null;
  const versions: any[] = [];
  let pageDocuments: any[] = [];
  let pageSchemes: any[] = [];
  let nextTemplateId = 1;
  let nextDraftId = 11;
  let nextVersionId = 21;

  const dynamicTemplateDraft = {
    findUnique: async (args: any) => {
      calls.push({ operation: "draft.findUnique", args: clone(args) });
      return draft && draft.id === args.where.id ? clone(draft) : null;
    },
    updateMany: async (args: any) => {
      calls.push({ operation: "draft.updateMany", args: clone(args) });
      if (!draft || draft.id !== args.where.id || draft.revision !== args.where.revision) return { count: 0 };
      draft = {
        ...draft,
        ...args.data,
        revision: draft.revision + Number(args.data.revision?.increment ?? 0),
      };
      return { count: 1 };
    },
    update: async (args: any) => {
      calls.push({ operation: "draft.update", args: clone(args) });
      if (!draft || draft.id !== args.where.id) throw new Error("missing draft");
      draft = {
        ...draft,
        ...args.data,
        revision: draft.revision + Number(args.data.revision?.increment ?? 0),
      };
      return clone(draft);
    },
  };
  const dynamicTemplateVersion = {
    count: async (args: any) => {
      calls.push({ operation: "version.count", args: clone(args) });
      return versions.filter((item) => item.dynamicTemplateId === args.where.dynamicTemplateId).length;
    },
    findUnique: async (args: any) => {
      calls.push({ operation: "version.findUnique", args: clone(args) });
      const key = args.where.dynamicTemplateId_version;
      return clone(versions.find((item) => (
        item.dynamicTemplateId === key.dynamicTemplateId && item.version === key.version
      )) ?? null);
    },
    create: async (args: any) => {
      calls.push({ operation: "version.create", args: clone(args) });
      const created = {
        id: nextVersionId++,
        publishedAt: new Date("2026-08-28T12:00:00.000Z"),
        ...clone(args.data),
      };
      versions.push(created);
      return clone(created);
    },
    findMany: async (args: any) => {
      calls.push({ operation: "version.findMany", args: clone(args) });
      return clone(versions.filter((item) => item.dynamicTemplateId === args.where.dynamicTemplateId)
        .sort((left, right) => right.version - left.version));
    },
  };
  const matchesTemplateWhere = (candidate: any, where: any): boolean => {
    if (!where) return true;
    if (Array.isArray(where.OR) && !where.OR.some((clause: any) => matchesTemplateWhere(candidate, clause))) {
      return false;
    }
    for (const key of ["id", "templateId", "ownerId", "sourceType", "sourceReference", "status", "visibility"] as const) {
      if (where[key] !== undefined && where[key] !== candidate[key]) return false;
    }
    if (typeof where.publishedVersion === "number" && where.publishedVersion !== candidate.publishedVersion) {
      return false;
    }
    if (where.publishedVersion?.gt !== undefined && candidate.publishedVersion <= where.publishedVersion.gt) {
      return false;
    }
    return true;
  };
  const dynamicTemplate = {
    create: async (args: any) => {
      calls.push({ operation: "template.create", args: clone(args) });
      const draftInput = args.data.draft.create;
      template = {
        id: nextTemplateId++,
        publishedVersion: 0,
        archivedAt: null,
        ...clone(args.data),
      };
      delete template.draft;
      draft = {
        id: nextDraftId++,
        dynamicTemplateId: template.id,
        baseVersion: null,
        ...clone(draftInput),
      };
      return clone({ ...template, draft });
    },
    findFirst: async (args: any) => {
      calls.push({ operation: "template.findFirst", args: clone(args) });
      if (!template) return null;
      if (!matchesTemplateWhere(template, args.where)) return null;
      return clone({ ...template, ...(args.include?.draft ? { draft } : {}) });
    },
    findMany: async (args: any) => {
      calls.push({ operation: "template.findMany", args: clone(args) });
      if (!template) return [];
      if (!matchesTemplateWhere(template, args.where)) return [];
      return [clone({
        ...template,
        ...(args.include?.draft ? { draft } : {}),
        ...(args.include?.versions ? { versions: versions.slice().sort((a, b) => b.version - a.version).slice(0, 1) } : {}),
      })];
    },
    updateMany: async (args: any) => {
      calls.push({ operation: "template.updateMany", args: clone(args) });
      if (!template) return { count: 0 };
      if (!matchesTemplateWhere(template, args.where)) return { count: 0 };
      template = { ...template, ...clone(args.data) };
      return { count: 1 };
    },
    update: async (args: any) => {
      calls.push({ operation: "template.update", args: clone(args) });
      if (!template || template.id !== args.where.id) throw new Error("missing template");
      template = { ...template, ...clone(args.data) };
      return clone(template);
    },
    findUnique: async (args: any) => {
      calls.push({ operation: "template.findUnique", args: clone(args) });
      if (!template || template.id !== args.where.id) return null;
      return clone({ ...template, ...(args.include?.draft ? { draft } : {}) });
    },
    deleteMany: async (args: any) => {
      calls.push({ operation: "template.deleteMany", args: clone(args) });
      if (!template || !matchesTemplateWhere(template, args.where)) return { count: 0 };
      template = null;
      draft = null;
      return { count: 1 };
    },
  };
  const prisma: any = {
    dynamicTemplate,
    dynamicTemplateDraft,
    dynamicTemplateVersion,
    dynamicTemplateActivation: {
      count: async (args: any) => {
        calls.push({ operation: "activation.count", args: clone(args) });
        return 0;
      },
    },
    pageDocument: {
      findMany: async (args: any) => {
        calls.push({ operation: "pageDocument.findMany", args: clone(args) });
        return clone(pageDocuments);
      },
    },
    pageScheme: {
      findMany: async (args: any) => {
        calls.push({ operation: "pageScheme.findMany", args: clone(args) });
        return clone(pageSchemes);
      },
    },
    operationLog: {
      create: async (args: any) => {
        calls.push({ operation: "operationLog.create", args: clone(args) });
        return { id: calls.length, ...clone(args.data) };
      },
    },
  };
  prisma.$transaction = async (callback: (tx: any) => Promise<unknown>) => callback(prisma);
  return {
    service: new DynamicTemplatesService(prisma as unknown as PrismaService),
    calls,
    setPageDocuments: (documents: any[]) => {
      pageDocuments = clone(documents);
    },
    setPageSchemes: (schemes: any[]) => {
      pageSchemes = clone(schemes);
    },
    setTemplateIdentity: (identity: { ownerId: number | null; sourceType: "SYSTEM" | "CUSTOM" }) => {
      if (!template) throw new Error("template not created");
      template = { ...template, ...identity };
    },
    corruptDraftChecksum: () => {
      if (!draft) throw new Error("draft not created");
      draft.definitionChecksum = "0".repeat(64);
    },
    corruptVersionChecksum: (version: number) => {
      const target = versions.find((item) => item.version === version);
      if (!target) throw new Error("version not created");
      target.definitionChecksum = "f".repeat(64);
    },
    setDraftDefinition: (definition: unknown) => {
      if (!draft) throw new Error("draft not created");
      draft.definition = clone(definition);
    },
    getState: () => ({ template: clone(template), draft: clone(draft), versions: clone(versions) }),
  };
}

test("正式版本向 EDITOR 开放，设计操作只允许超级管理员且旧发布写路径不能跨模块绕过", () => {
  assert.deepEqual(
    Reflect.getMetadata(ROLES_KEY, DynamicTemplatesController),
    ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  );
  const prototype = DynamicTemplatesController.prototype;
  assert.equal(Reflect.getMetadata(ROLES_KEY, prototype.listCatalog), undefined);
  assert.equal(Reflect.getMetadata(ROLES_KEY, prototype.listPublished), undefined);
  assert.equal(Reflect.getMetadata(ROLES_KEY, prototype.getPublishedVersion), undefined);
  for (const method of [
    prototype.listMine,
    prototype.create,
    prototype.getDraft,
    prototype.updateDraft,
    prototype.saveAs,
    prototype.publish,
    prototype.listVersions,
    prototype.archive,
    prototype.restore,
    prototype.deleteDraft,
  ]) {
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, method), ["SUPER_ADMIN"]);
  }
  assert.equal((prototype as any).previewActivationImpact, undefined);
  assert.equal((prototype as any).activate, undefined);
  assert.equal((DynamicTemplatesService.prototype as any).previewActivationImpact, undefined);
  assert.equal((DynamicTemplatesService.prototype as any).activate, undefined);
  const publishCalls: unknown[] = [];
  const controller = new DynamicTemplatesController({
    publish: async (...args: unknown[]) => {
      publishCalls.push(args);
      return { templateId: "tpl_publish", version: 2 };
    },
  } as unknown as DynamicTemplatesService, {} as PageModulesService);
  void controller.publish("tpl_publish", { expectedRevision: 3 }, { user: { id: 17 } } as any);
  assert.deepEqual(publishCalls, [[17, "tpl_publish", { expectedRevision: 3 }]]);
  assert.deepEqual(
    Reflect.getMetadata(MODULE_METADATA.EXPORTS, PageModulesModule),
    [PageModulesService],
  );
});

test("统一母模板目录一次返回正式、可编辑和只读兼容来源，并只向超级管理员返回可编辑草稿", async () => {
  const listMineCalls: number[] = [];
  const controller = new DynamicTemplatesController({
    listPublished: async () => [{ templateId: "tpl_published" }],
    listMine: async (ownerId: number) => {
      listMineCalls.push(ownerId);
      return [{ templateId: "tpl_editable" }];
    },
  } as unknown as DynamicTemplatesService, {
    getSystemContentTemplates: async () => [{ contractKey: "hero" }],
    getPersonalContentTemplates: async (ownerId: number) => [{ id: ownerId }],
  } as unknown as PageModulesService);

  const superAdminCatalog = await controller.listCatalog({
    user: { id: 17, role: "SUPER_ADMIN" },
  } as any);
  assert.deepEqual(
    superAdminCatalog.items.map((item) => item.kind),
    ["published", "editable", "system-compatibility", "personal-compatibility"],
  );
  assert.deepEqual(listMineCalls, [17]);

  const adminCatalog = await controller.listCatalog({
    user: { id: 23, role: "ADMIN" },
  } as any);
  assert.deepEqual(
    adminCatalog.items.map((item) => item.kind),
    ["published", "system-compatibility", "personal-compatibility"],
  );
  assert.deepEqual(listMineCalls, [17]);
});

test("创建母模板只写当前所有者私有草稿并保存服务端校验摘要", async () => {
  const { service, calls } = createStatefulService();
  const definition = definitionFixture();
  const created = await service.create(17, {
    definition,
    versionNote: " 首个结构草稿 ",
  });
  assert.equal(created.ownerId, 17);
  assert.equal(created.visibility, "PRIVATE");
  assert.equal(created.status, "ACTIVE");
  assert.equal(created.publishedVersion, 0);
  assert.ok(created.draft);
  assert.equal(created.draft.revision, 1);
  assert.equal(created.draft.versionNote, "首个结构草稿");
  assert.match(created.draft.definitionChecksum, /^[a-f0-9]{64}$/);
  const createCall = calls.find((call) => call.operation === "template.create");
  assert.equal(createCall?.args.data.ownerId, 17);
  assert.equal(createCall?.args.data.sourceType, "CUSTOM");
});

test("旧系统兼容来源由超级管理员适配为唯一 SYSTEM 母模板草稿，个人来源仍归当前账号", async () => {
  const systemHarness = createStatefulService();
  const systemDefinition = definitionFixture();
  const system = await systemHarness.service.create(17, {
    definition: systemDefinition,
    sourceReference: "legacy_system_hero",
  });
  assert.equal(system.ownerId, null);
  assert.equal(system.sourceType, "SYSTEM");
  assert.equal(system.visibility, "PRIVATE");
  assert.equal(system.sourceReference, "legacy_system_hero");

  const duplicate = definitionFixture();
  duplicate.templateId = "tpl_duplicate_system_hero";
  duplicate.name = "重复首屏系统替代";
  await assert.rejects(
    () => systemHarness.service.create(17, {
      definition: duplicate,
      sourceReference: "legacy_system_hero",
    }),
    ConflictException,
  );

  const personalHarness = createStatefulService();
  const personal = await personalHarness.service.create(17, {
    definition: definitionFixture(),
    sourceReference: "legacy_personal_42",
  });
  assert.equal(personal.ownerId, 17);
  assert.equal(personal.sourceType, "CUSTOM");
  assert.equal(personal.sourceReference, "legacy_personal_42");

  const invalidHarness = createStatefulService();
  await assert.rejects(
    () => invalidHarness.service.create(17, {
      definition: definitionFixture(),
      sourceReference: "legacy_system_unknown",
    }),
    BadRequestException,
  );
});

test("统一目录向超级管理员开放 ownerId 为空的 SYSTEM V2，同时保持账号 CUSTOM 模板隔离", async () => {
  const systemHarness = createStatefulService();
  const definition = definitionFixture();
  await systemHarness.service.create(17, { definition });
  systemHarness.setTemplateIdentity({ ownerId: null, sourceType: "SYSTEM" });

  const listed = await systemHarness.service.listMine(99);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].sourceType, "SYSTEM");
  assert.equal(listed[0].ownerId, null);
  const opened = await systemHarness.service.getDraft(99, definition.templateId);
  assert.equal(opened.templateId, definition.templateId);

  const changed = definitionFixture();
  changed.name = "统一系统模板｜超级管理员草稿";
  const updated = await systemHarness.service.updateDraft(99, definition.templateId, {
    expectedRevision: 1,
    definition: changed,
  });
  assert.equal(updated?.draft?.revision, 2);
  await systemHarness.service.archive(99, definition.templateId);
  assert.equal(systemHarness.getState().template.status, "ARCHIVED");
  await systemHarness.service.restore(99, definition.templateId);
  assert.equal(systemHarness.getState().template.status, "ACTIVE");

  const customHarness = createStatefulService();
  await customHarness.service.create(17, { definition: definitionFixture() });
  assert.equal((await customHarness.service.listMine(99)).length, 0);
  await assert.rejects(
    () => customHarness.service.getDraft(99, definition.templateId),
    NotFoundException,
  );
});

test("草稿更新绑定所有者、锁定 templateId 并使用乐观 revision", async () => {
  const { service, getState } = createStatefulService();
  const definition = definitionFixture();
  await service.create(17, { definition });
  const changed = definitionFixture();
  changed.name = "服务端母模板校验｜调整版";
  const updated = await service.updateDraft(17, definition.templateId, {
    expectedRevision: 1,
    definition: changed,
    versionNote: "调整标题",
  });
  assert.equal(updated?.draft?.revision, 2);
  assert.equal(getState().template.name, changed.name);
  await assert.rejects(
    () => service.updateDraft(17, definition.templateId, {
      expectedRevision: 1,
      definition: changed,
    }),
    ConflictException,
  );

  const foreignIdentity = definitionFixture();
  foreignIdentity.templateId = "tpl_other_identity";
  await assert.rejects(
    () => service.updateDraft(17, definition.templateId, {
      expectedRevision: 2,
      definition: foreignIdentity,
    }),
    BadRequestException,
  );
  await assert.rejects(() => service.getDraft(99, definition.templateId), NotFoundException);
});

test("持久化快照允许解锁后修改或修改后锁定合并为一次保存", async () => {
  const { service, getState } = createStatefulService();
  const locked = definitionFixture();
  locked.nodes.node_container.authoring = { structureLocked: true };
  await service.create(17, { definition: locked });

  const unlockedAndChanged = structuredClone(locked);
  delete unlockedAndChanged.nodes.node_container.authoring;
  unlockedAndChanged.nodes.node_heading.responsive.desktop.order = 4;
  const changedAfterUnlock = await service.updateDraft(17, locked.templateId, {
    expectedRevision: 1,
    definition: unlockedAndChanged,
  });
  assert.equal(changedAfterUnlock?.draft?.revision, 2);
  assert.equal(getState().draft.revision, 2);
  assert.equal(getState().draft.definition.nodes.node_container.authoring, undefined);
  assert.equal(getState().draft.definition.nodes.node_heading.responsive.desktop.order, 4);

  const changedAndLocked = structuredClone(unlockedAndChanged);
  changedAndLocked.nodes.node_heading.responsive.desktop.order = 5;
  changedAndLocked.nodes.node_container.authoring = { structureLocked: true };
  const lockedAfterChange = await service.updateDraft(17, locked.templateId, {
    expectedRevision: 2,
    definition: changedAndLocked,
  });
  assert.equal(lockedAfterChange?.draft?.revision, 3);
  assert.equal(getState().draft.revision, 3);
  assert.deepEqual(
    getState().draft.definition.nodes.node_container.authoring,
    { structureLocked: true },
  );
  assert.equal(getState().draft.definition.nodes.node_heading.responsive.desktop.order, 5);
});

test("持久化快照拒绝持续锁保护的变化且其他锁变化不能掩盖", async () => {
  const { service, getState } = createStatefulService();
  const locked = definitionFixture();
  locked.nodes.node_container.authoring = { structureLocked: true };
  await service.create(17, { definition: locked });

  const assertStructureLocked = async (
    submittedDefinition: typeof locked,
    expectedRevision: number,
  ) => {
    await assert.rejects(
      () => service.updateDraft(17, locked.templateId, {
        expectedRevision,
        definition: submittedDefinition,
      }),
      (error: unknown) => {
        assert.ok(error instanceof BadRequestException);
        assert.equal((error.getResponse() as any).code, "TEMPLATE_STRUCTURE_LOCKED");
        return true;
      },
    );
    assert.equal(getState().draft.revision, expectedRevision);
  };

  const stillLockedAndChanged = structuredClone(locked);
  stillLockedAndChanged.nodes.node_heading.responsive.desktop.order = 4;
  await assertStructureLocked(stillLockedAndChanged, 1);

  const persistentLockWithNewNestedLock = structuredClone(locked);
  persistentLockWithNewNestedLock.nodes.node_heading.authoring = { structureLocked: true };
  persistentLockWithNewNestedLock.nodes.node_heading.responsive.desktop.order = 4;
  await assertStructureLocked(persistentLockWithNewNestedLock, 1);

  const lockedWithNestedLock = structuredClone(locked);
  lockedWithNestedLock.nodes.node_heading.authoring = { structureLocked: true };
  const nestedLockUpdate = await service.updateDraft(17, locked.templateId, {
    expectedRevision: 1,
    definition: lockedWithNestedLock,
  });
  assert.equal(nestedLockUpdate?.draft?.revision, 2);

  const persistentLockWithRemovedNestedLock = structuredClone(lockedWithNestedLock);
  delete persistentLockWithRemovedNestedLock.nodes.node_heading.authoring;
  persistentLockWithRemovedNestedLock.nodes.node_heading.responsive.desktop.order = 4;
  await assertStructureLocked(persistentLockWithRemovedNestedLock, 2);
});

test("发布生成不可变正式版本、开放 STAFF 读取并保留下一版草稿", async () => {
  const { service, getState, calls } = createStatefulService();
  const definition = definitionFixture();
  definition.nodes.node_container.authoring = { structureLocked: true };
  await service.create(17, {
    definition,
    versionNote: "首版",
    sourceReference: "legacy_system_hero",
  });
  const first = await service.publish(17, definition.templateId, { expectedRevision: 1 });
  assert.equal(first.version, 1);
  assert.equal(getState().template.visibility, "STAFF");
  assert.equal(getState().template.publishedVersion, 1);
  assert.equal(getState().draft.baseVersion, 1);
  assert.equal(getState().draft.revision, 2);
  assert.equal(getState().versions.length, 1);
  assert.equal(getState().versions[0].versionNote, "首版");
  assert.deepEqual(
    (getState().versions[0].definition as any).nodes.node_container.authoring,
    { structureLocked: true },
  );
  const firstDraftClaim = calls.findIndex((call) => call.operation === "draft.updateMany");
  const firstVersionAdvance = calls.findIndex((call) => call.operation === "template.updateMany");
  const firstVersionInsert = calls.findIndex((call) => call.operation === "version.create");
  assert.ok(firstDraftClaim >= 0 && firstDraftClaim < firstVersionAdvance);
  assert.ok(firstVersionAdvance < firstVersionInsert);
  const firstAudit = calls.find((call) => call.operation === "operationLog.create");
  assert.equal(firstAudit?.args.data.action, "TEMPLATE_VERSION_PUBLISHED");
  assert.deepEqual(JSON.parse(firstAudit?.args.data.detail), {
    schemaVersion: 1,
    event: "TEMPLATE_VERSION_PUBLISHED",
    actor: 17,
    timestamp: "2026-08-28T12:00:00.000Z",
    templateId: definition.templateId,
    fromVersion: 0,
    toVersion: 1,
    result: "succeeded",
  });

  await assert.rejects(
    () => service.publish(17, definition.templateId, { expectedRevision: 2 }),
    BadRequestException,
  );

  const changed = structuredClone(definition);
  changed.name = "服务端母模板校验｜第二版";
  await service.updateDraft(17, definition.templateId, {
    expectedRevision: 2,
    definition: changed,
    versionNote: "第二版结构",
  });
  const second = await service.publish(17, definition.templateId, {
    expectedRevision: 3,
    versionNote: " ",
  });
  assert.equal(second.version, 2);
  assert.equal(getState().versions.length, 2);
  assert.equal((getState().versions[0].definition as any).name, definition.name);
  assert.equal((getState().versions[1].definition as any).name, changed.name);
  assert.equal(getState().versions[1].versionNote, null);

  const published = await service.listPublished();
  assert.equal(published.length, 1);
  assert.equal(published[0].version, 2);
  assert.equal(published[0].sourceReference, "legacy_system_hero");
  assert.equal((published[0].definition as any).name, changed.name);
});

test("发布模板 v2 不读取或修改 PageDocument、PageDocumentRevision、PageScheme，旧实例继续引用 v1", async () => {
  const { service, calls, setPageDocuments, getState } = createStatefulService();
  const definition = definitionFixture();
  await service.create(17, { definition });
  await service.publish(17, definition.templateId, { expectedRevision: 1 });
  const pageDocument = {
    id: 81,
    pageKey: "home",
    updatedAt: "2026-08-30T08:00:00.000Z",
    puckData: {
      content: [{
        type: "动态模板实例",
        props: {
          instanceId: "instance-v1",
          templateId: definition.templateId,
          templateVersion: 1,
        },
      }],
      zones: {},
      root: { props: {} },
    },
  };
  setPageDocuments([pageDocument]);
  const changed = definitionFixture();
  changed.name = "发布隔离 v2";
  await service.updateDraft(17, definition.templateId, {
    expectedRevision: 2,
    definition: changed,
  });
  const beforePublishCallCount = calls.length;

  const result = await service.publish(17, definition.templateId, { expectedRevision: 3 });

  assert.equal(result.version, 2);
  assert.equal(getState().versions.length, 2);
  const publishCalls = calls.slice(beforePublishCallCount);
  assert.equal(publishCalls.some((call) => call.operation.startsWith("pageDocument.")), false);
  assert.equal(publishCalls.some((call) => call.operation.startsWith("pageDocumentRevision.")), false);
  assert.equal(publishCalls.some((call) => call.operation.startsWith("pageScheme.")), false);
  assert.equal(pageDocument.puckData.content[0].props.templateVersion, 1);
  assert.equal(pageDocument.updatedAt, "2026-08-30T08:00:00.000Z");
});

test("另存为创建全新 templateId，归档仅改变生命周期且不删除版本", async () => {
  const { service, getState, calls } = createStatefulService();
  const definition = definitionFixture();
  await service.create(17, { definition });
  const copy = await service.saveAs(17, definition.templateId, {
    name: "服务端母模板校验｜副本",
    versionNote: "派生副本",
  });
  assert.notEqual(copy.templateId, definition.templateId);
  assert.match(copy.templateId, /^tpl_/);
  assert.equal(copy.sourceReference, definition.templateId);
  assert.ok(copy.draft);
  assert.equal((copy.draft.definition as any).templateId, copy.templateId);

  await service.publish(17, copy.templateId, { expectedRevision: 1 });
  await service.archive(17, copy.templateId);
  assert.equal(getState().template.status, "ARCHIVED");
  assert.equal(getState().versions.length, 1);
  assert.equal((await service.listPublished()).length, 0);
  const archivedVersion = await service.getPublishedVersion(copy.templateId, 1);
  assert.equal(archivedVersion.version, 1);
  assert.equal(archivedVersion.status, "ARCHIVED");
  await service.restore(17, copy.templateId);
  assert.equal(getState().template.status, "ACTIVE");
  const lifecycleAudits = calls
    .filter((call) => call.operation === "operationLog.create")
    .filter((call) => ["TEMPLATE_ARCHIVED", "TEMPLATE_RESTORED"].includes(call.args.data.action));
  assert.deepEqual(lifecycleAudits.map((call) => call.args.data.action), [
    "TEMPLATE_ARCHIVED",
    "TEMPLATE_RESTORED",
  ]);
  assert.deepEqual(
    lifecycleAudits.map((call) => {
      const detail = JSON.parse(call.args.data.detail);
      return {
        action: call.args.data.action,
        module: call.args.data.module,
        targetId: call.args.data.targetId,
        actor: detail.actor,
        event: detail.event,
        templateId: detail.templateId,
        fromStatus: detail.fromStatus,
        toStatus: detail.toStatus,
        publishedVersion: detail.publishedVersion,
        result: detail.result,
        hasTimestamp: typeof detail.timestamp === "string",
      };
    }),
    [
      {
        action: "TEMPLATE_ARCHIVED",
        module: "page-builder-template",
        targetId: getState().template.id,
        actor: 17,
        event: "TEMPLATE_ARCHIVED",
        templateId: copy.templateId,
        fromStatus: "ACTIVE",
        toStatus: "ARCHIVED",
        publishedVersion: 1,
        result: "succeeded",
        hasTimestamp: true,
      },
      {
        action: "TEMPLATE_RESTORED",
        module: "page-builder-template",
        targetId: getState().template.id,
        actor: 17,
        event: "TEMPLATE_RESTORED",
        templateId: copy.templateId,
        fromStatus: "ARCHIVED",
        toStatus: "ACTIVE",
        publishedVersion: 1,
        result: "succeeded",
        hasTimestamp: true,
      },
    ],
  );
});

test("新母模板不持久化内容，历史内容只允许原样兼容或显式清空", async () => {
  const direct = createStatefulService();
  const withDefaultContent = definitionFixture();
  withDefaultContent.defaultContent = { slot_heading: "历史默认标题" };
  await assert.rejects(
    () => direct.service.create(17, { definition: withDefaultContent }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.equal((error.getResponse() as any).code, "TEMPLATE_CONTENT_MUST_BE_EMPTY");
      return true;
    },
  );
  const withPreviewContent = definitionFixture();
  withPreviewContent.previewContent = { slot_heading: "历史预览标题" };
  await assert.rejects(
    () => direct.service.create(17, { definition: withPreviewContent }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.equal((error.getResponse() as any).code, "TEMPLATE_CONTENT_MUST_BE_EMPTY");
      return true;
    },
  );
  const withLegacyEmptyPolicy = definitionFixture();
  withLegacyEmptyPolicy.slots.slot_heading.emptyPolicy = "use-default";
  await assert.rejects(
    () => direct.service.create(17, { definition: withLegacyEmptyPolicy }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.equal((error.getResponse() as any).code, "TEMPLATE_LEGACY_EMPTY_POLICY_NOT_ALLOWED");
      return true;
    },
  );

  const currentPolicy = createStatefulService();
  const currentDefinition = definitionFixture();
  await currentPolicy.service.create(17, { definition: currentDefinition });
  const addedLegacyPolicy = structuredClone(currentDefinition);
  addedLegacyPolicy.slots.slot_heading.emptyPolicy = "use-default";
  await assert.rejects(
    () => currentPolicy.service.updateDraft(17, currentDefinition.templateId, {
      expectedRevision: 1,
      definition: addedLegacyPolicy,
    }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.equal((error.getResponse() as any).code, "TEMPLATE_LEGACY_EMPTY_POLICY_IS_READ_ONLY");
      return true;
    },
  );

  const historical = createStatefulService();
  const definition = definitionFixture();
  await historical.service.create(17, { definition });
  const historicalDefinition = definitionFixture();
  historicalDefinition.defaultContent = { slot_heading: "历史默认标题" };
  historicalDefinition.previewContent = { slot_heading: "历史预览标题" };
  historicalDefinition.slots.slot_heading.emptyPolicy = "use-default";
  historical.setDraftDefinition(historicalDefinition);

  const preserved = structuredClone(historicalDefinition);
  preserved.name = "只修改模板名称";
  await historical.service.updateDraft(17, definition.templateId, {
    expectedRevision: 1,
    definition: preserved,
  });
  assert.deepEqual(historical.getState().draft.definition.defaultContent, {
    slot_heading: "历史默认标题",
  });

  const modified = structuredClone(preserved);
  modified.defaultContent.slot_heading = "试图改写历史内容";
  await assert.rejects(
    () => historical.service.updateDraft(17, definition.templateId, {
      expectedRevision: 2,
      definition: modified,
    }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.equal((error.getResponse() as any).code, "TEMPLATE_CONTENT_IS_READ_ONLY");
      return true;
    },
  );

  const cleared = structuredClone(preserved);
  cleared.defaultContent = {};
  cleared.previewContent = {};
  cleared.slots.slot_heading.emptyPolicy = "hide";
  await historical.service.updateDraft(17, definition.templateId, {
    expectedRevision: 2,
    definition: cleared,
  });
  assert.deepEqual(historical.getState().draft.definition.defaultContent, {});
  assert.deepEqual(historical.getState().draft.definition.previewContent, {});
  assert.equal(historical.getState().draft.definition.slots.slot_heading.emptyPolicy, "hide");

  const restoredLegacyPolicy = structuredClone(cleared);
  restoredLegacyPolicy.slots.slot_heading.emptyPolicy = "use-default";
  await assert.rejects(
    () => historical.service.updateDraft(17, definition.templateId, {
      expectedRevision: 3,
      definition: restoredLegacyPolicy,
    }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.equal((error.getResponse() as any).code, "TEMPLATE_LEGACY_EMPTY_POLICY_IS_READ_ONLY");
      return true;
    },
  );

  const copied = createStatefulService();
  await copied.service.create(17, { definition: definitionFixture() });
  copied.setDraftDefinition(historicalDefinition);
  const copy = await copied.service.saveAs(17, definition.templateId, {
    name: "不携带历史内容的副本",
  });
  assert.ok(copy.draft);
  assert.deepEqual((copy.draft.definition as any).defaultContent, {});
  assert.deepEqual((copy.draft.definition as any).previewContent, {});
  assert.equal((copy.draft.definition as any).slots.slot_heading.emptyPolicy, "hide");
});

test("仅回收站中从未发布且未被页面引用的 CUSTOM 草稿可以永久删除", async () => {
  const deletable = createStatefulService();
  const definition = definitionFixture();
  const created = await deletable.service.create(17, { definition });
  assert.equal(created.canDelete, false);
  assert.equal(created.deleteBlockers[0].code, "NOT_IN_TRASH");
  const reopened = await deletable.service.getDraft(17, definition.templateId);
  assert.equal(reopened.canDelete, false);
  assert.equal(reopened.deleteBlockers[0].code, "NOT_IN_TRASH");
  const catalog = await deletable.service.listMine(17);
  assert.equal(catalog[0].canDelete, false);
  assert.equal(catalog[0].deleteBlockers[0].code, "NOT_IN_TRASH");
  await assert.rejects(
    () => deletable.service.deleteDraft(17, definition.templateId),
    ConflictException,
  );
  await deletable.service.archive(17, definition.templateId);
  const trashCatalog = await deletable.service.listMine(17);
  assert.equal(trashCatalog[0].canDelete, true);
  assert.deepEqual(trashCatalog[0].deleteBlockers, []);
  assert.deepEqual(await deletable.service.deleteDraft(17, definition.templateId), {
    templateId: definition.templateId,
    deleted: true,
  });
  const deleteAudit = deletable.calls.find((call) => (
    call.operation === "operationLog.create"
    && call.args.data.action === "TEMPLATE_DRAFT_DELETED"
  ));
  assert.equal(deleteAudit?.args.data.module, "page-builder-template");
  assert.deepEqual({
    ...JSON.parse(deleteAudit?.args.data.detail),
    timestamp: "<timestamp>",
  }, {
    schemaVersion: 1,
    event: "TEMPLATE_DRAFT_DELETED",
    actor: 17,
    timestamp: "<timestamp>",
    templateId: definition.templateId,
    fromStatus: "ARCHIVED",
    toStatus: "DELETED",
    publishedVersion: 0,
    result: "succeeded",
  });
  assert.equal(deletable.getState().template, null);

  const referenced = createStatefulService();
  await referenced.service.create(17, { definition: definitionFixture() });
  referenced.setPageDocuments([{
    puckData: {
      content: [{
        type: "动态模板实例",
        props: {
          instanceId: "instance-blocking-delete",
          templateId: definition.templateId,
          templateVersion: 1,
        },
      }],
      zones: {},
    },
    revisions: [],
    localizations: [],
  }]);
  await referenced.service.archive(17, definition.templateId);
  const referencedCatalog = await referenced.service.listMine(17);
  assert.equal(referencedCatalog[0].canDelete, false);
  assert.equal(referencedCatalog[0].deleteBlockers[0].code, "REFERENCED_BY_PAGE");
  await assert.rejects(
    () => referenced.service.deleteDraft(17, definition.templateId),
    ConflictException,
  );
  assert.equal(referenced.calls.some((call) => (
    call.operation === "operationLog.create"
    && call.args.data.action === "TEMPLATE_DRAFT_DELETED"
  )), false);

  const system = createStatefulService();
  await system.service.create(17, { definition: definitionFixture() });
  system.setTemplateIdentity({ ownerId: null, sourceType: "SYSTEM" });
  await system.service.archive(17, definition.templateId);
  await assert.rejects(
    () => system.service.deleteDraft(17, definition.templateId),
    ConflictException,
  );
  assert.equal(system.calls.some((call) => (
    call.operation === "operationLog.create"
    && call.args.data.action === "TEMPLATE_DRAFT_DELETED"
  )), false);

  const published = createStatefulService();
  await published.service.create(17, { definition: definitionFixture() });
  await published.service.publish(17, definition.templateId, { expectedRevision: 1 });
  await published.service.archive(17, definition.templateId);
  await assert.rejects(
    () => published.service.deleteDraft(17, definition.templateId),
    ConflictException,
  );
  assert.equal(published.calls.some((call) => (
    call.operation === "operationLog.create"
    && call.args.data.action === "TEMPLATE_DRAFT_DELETED"
  )), false);
});

test("母模板持久化拒绝无身份、非法 JSON 定义和越界版本说明", async () => {
  const { service } = createStatefulService();
  await assert.rejects(() => service.listMine(undefined), BadRequestException);
  const invalid = definitionFixture() as unknown as Record<string, unknown>;
  invalid.unknownRootField = true;
  await assert.rejects(() => service.create(17, { definition: invalid }), BadRequestException);
  await assert.rejects(
    () => service.create(17, { definition: definitionFixture(), versionNote: "x".repeat(501) }),
    BadRequestException,
  );
});
