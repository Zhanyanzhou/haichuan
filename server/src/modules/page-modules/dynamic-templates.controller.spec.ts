import assert from "node:assert/strict";
import test from "node:test";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  RequestMethod,
  ValidationPipe,
  type ExecutionContext,
} from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from "@nestjs/common/constants";
import { firstValueFrom, of } from "rxjs";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { TransformInterceptor } from "../../common/interceptors/transform.interceptor";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  ArchiveDynamicTemplateDto,
  CreateDynamicTemplateDto,
  PublishDynamicTemplateDto,
  RebuildDynamicTemplateDraftFromPublishedDto,
  UpdateDynamicTemplateDraftDto,
} from "./dto/dynamic-template.dto";
import { definitionFixture } from "./dynamic-template-test-fixture";
import { DynamicTemplatesController } from "./dynamic-templates.controller";

type ServiceMethod =
  | "archive"
  | "create"
  | "getDraft"
  | "getPublishedVersion"
  | "listMine"
  | "listPublished"
  | "publish"
  | "rebuildDraftFromPublished"
  | "updateDraft";

type RecordedCall = {
  args: unknown[];
  method: ServiceMethod;
};

type Handler = (...args: unknown[]) => unknown;

function createHarness(options: {
  service?: Partial<Record<ServiceMethod, Handler>>;
} = {}) {
  const calls: RecordedCall[] = [];
  const record = <TMethod extends ServiceMethod>(
    method: TMethod,
    handler: Handler = () => undefined,
  ) => (...args: unknown[]) => {
    calls.push({ method, args });
    return handler(...args);
  };
  const service = {
    archive: record("archive", options.service?.archive),
    create: record("create", options.service?.create),
    getDraft: record("getDraft", options.service?.getDraft),
    getPublishedVersion: record(
      "getPublishedVersion",
      options.service?.getPublishedVersion,
    ),
    listMine: record("listMine", options.service?.listMine),
    listPublished: record("listPublished", options.service?.listPublished),
    publish: record("publish", options.service?.publish),
    rebuildDraftFromPublished: record(
      "rebuildDraftFromPublished",
      options.service?.rebuildDraftFromPublished,
    ),
    updateDraft: record("updateDraft", options.service?.updateDraft),
  };
  return {
    calls,
    controller: new DynamicTemplatesController(service as never),
  };
}

function staffRequest(id: number, role: "SUPER_ADMIN" | "ADMIN" | "EDITOR") {
  return { user: { id, role } } as never;
}

function callsFor(calls: RecordedCall[], method: RecordedCall["method"]) {
  return calls.filter((call) => call.method === method);
}

function routeArguments(method: string) {
  return Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    DynamicTemplatesController,
    method,
  ) as Record<string, { data?: string; index: number; pipes: unknown[] }> | undefined;
}

function assertRouteArgument(
  method: string,
  routeParamType: number,
  index: number,
  data?: string,
) {
  const argument = routeArguments(method)?.[`${routeParamType}:${index}`];
  assert.ok(argument, `${method} 缺少参数装饰器 ${routeParamType}:${index}`);
  assert.equal(argument.index, index);
  assert.equal(argument.data, data);
}

const BODY = 3;
const QUERY = 4;
const PARAM = 5;

test("动态模板 Controller 保持模板草稿、发布与目录路由形状", () => {
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, DynamicTemplatesController),
    "page-modules/dynamic-templates",
  );

  const routes = [
    ["listCatalog", "catalog", RequestMethod.GET],
    ["listPublished", "published", RequestMethod.GET],
    [
      "getPublishedVersion",
      "published/:templateId/versions/:version",
      RequestMethod.GET,
    ],
    ["listMine", "mine", RequestMethod.GET],
    ["create", "/", RequestMethod.POST],
    ["getDraft", ":templateId/draft", RequestMethod.GET],
    ["updateDraft", ":templateId/draft", RequestMethod.PATCH],
    [
      "rebuildDraftFromPublished",
      ":templateId/draft/from-published",
      RequestMethod.POST,
    ],
    ["publish", ":templateId/publish", RequestMethod.POST],
    ["listVersions", ":templateId/versions", RequestMethod.GET],
    ["archive", ":templateId/archive", RequestMethod.POST],
    ["restore", ":templateId/restore", RequestMethod.POST],
    ["deleteDraft", ":templateId", RequestMethod.DELETE],
  ] as const;

  for (const [name, path, requestMethod] of routes) {
    const handler = DynamicTemplatesController.prototype[name];
    assert.equal(Reflect.getMetadata(PATH_METADATA, handler), path, `${name} path`);
    assert.equal(
      Reflect.getMetadata(METHOD_METADATA, handler),
      requestMethod,
      `${name} method`,
    );
  }
});

test("create、updateDraft、publish、archive 使用明确 DTO 与 Param/Body 参数绑定", () => {
  const createTypes = Reflect.getMetadata(
    "design:paramtypes",
    DynamicTemplatesController.prototype,
    "create",
  ) as unknown[];
  const updateTypes = Reflect.getMetadata(
    "design:paramtypes",
    DynamicTemplatesController.prototype,
    "updateDraft",
  ) as unknown[];
  const rebuildTypes = Reflect.getMetadata(
    "design:paramtypes",
    DynamicTemplatesController.prototype,
    "rebuildDraftFromPublished",
  ) as unknown[];
  const publishTypes = Reflect.getMetadata(
    "design:paramtypes",
    DynamicTemplatesController.prototype,
    "publish",
  ) as unknown[];
  const archiveTypes = Reflect.getMetadata(
    "design:paramtypes",
    DynamicTemplatesController.prototype,
    "archive",
  ) as unknown[];

  assert.equal(createTypes[0], CreateDynamicTemplateDto);
  assert.equal(updateTypes[1], UpdateDynamicTemplateDraftDto);
  assert.equal(rebuildTypes[1], RebuildDynamicTemplateDraftFromPublishedDto);
  assert.equal(publishTypes[1], PublishDynamicTemplateDto);
  assert.equal(archiveTypes[1], ArchiveDynamicTemplateDto);
  assertRouteArgument("create", BODY, 0);
  assertRouteArgument("updateDraft", PARAM, 0, "templateId");
  assertRouteArgument("updateDraft", BODY, 1);
  assertRouteArgument("rebuildDraftFromPublished", PARAM, 0, "templateId");
  assertRouteArgument("rebuildDraftFromPublished", BODY, 1);
  assertRouteArgument("publish", PARAM, 0, "templateId");
  assertRouteArgument("publish", BODY, 1);
  assertRouteArgument("getPublishedVersion", PARAM, 0, "templateId");
  assertRouteArgument("getPublishedVersion", PARAM, 1, "version");
  assertRouteArgument("listVersions", PARAM, 0, "templateId");
  assertRouteArgument("listVersions", QUERY, 2, "beforeVersion");
  assertRouteArgument("listVersions", QUERY, 3, "limit");
  assertRouteArgument("archive", PARAM, 0, "templateId");
  assertRouteArgument("archive", BODY, 1);
  assert.equal((DynamicTemplatesController.prototype as any).saveAs, undefined);
  assertRouteArgument("restore", PARAM, 0, "templateId");
  assertRouteArgument("deleteDraft", PARAM, 0, "templateId");
});

test("archive 将 Repository 草稿身份原样委托 service", async () => {
  const response = { templateId: "tpl_archive", status: "ARCHIVED" };
  const harness = createHarness({ service: { archive: async () => response } });
  const body = Object.assign(new ArchiveDynamicTemplateDto(), {
    expectedRevision: 3,
    expectedChecksum: "a".repeat(64),
  });

  assert.equal(
    await harness.controller.archive(
      "tpl_archive",
      body,
      staffRequest(41, "SUPER_ADMIN"),
    ),
    response,
  );
  assert.deepEqual(callsFor(harness.calls, "archive"), [
    { method: "archive", args: [41, "tpl_archive", body] },
  ]);
});

test("类级员工守卫与角色、mine/draft 的 SUPER_ADMIN 加严边界保持不变", () => {
  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, DynamicTemplatesController),
    [JwtAuthGuard, RolesGuard],
  );
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, DynamicTemplatesController), [
    "SUPER_ADMIN",
    "ADMIN",
    "EDITOR",
  ]);
  assert.equal(
    Reflect.getMetadata(ROLES_KEY, DynamicTemplatesController.prototype.listCatalog),
    undefined,
  );
  assert.equal(
    Reflect.getMetadata(ROLES_KEY, DynamicTemplatesController.prototype.listPublished),
    undefined,
  );
  for (const handler of [
    DynamicTemplatesController.prototype.listMine,
    DynamicTemplatesController.prototype.getDraft,
    DynamicTemplatesController.prototype.create,
    DynamicTemplatesController.prototype.updateDraft,
    DynamicTemplatesController.prototype.publish,
    DynamicTemplatesController.prototype.rebuildDraftFromPublished,
    DynamicTemplatesController.prototype.listVersions,
    DynamicTemplatesController.prototype.archive,
    DynamicTemplatesController.prototype.restore,
    DynamicTemplatesController.prototype.deleteDraft,
  ]) {
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, handler), ["SUPER_ADMIN"]);
  }
});

test("create/updateDraft 把同一 TemplateDefinitionV2 DTO 交给 service，不生成 PageDocument", async () => {
  const definition = definitionFixture();
  const created = { templateId: definition.templateId, draft: { revision: 1 } };
  const updated = { templateId: definition.templateId, draft: { revision: 2 } };
  const harness = createHarness({
    service: {
      create: async () => created,
      updateDraft: async () => updated,
    },
  });
  const createBody = Object.assign(new CreateDynamicTemplateDto(), {
    definition,
    versionNote: "initial draft",
  });
  const updateBody = Object.assign(new UpdateDynamicTemplateDraftDto(), {
    definition,
    expectedRevision: 1,
    versionNote: "reviewed draft",
  });

  assert.equal(await harness.controller.create(createBody, staffRequest(41, "SUPER_ADMIN")), created);
  assert.equal(
    await harness.controller.updateDraft(
      definition.templateId,
      updateBody,
      staffRequest(41, "SUPER_ADMIN"),
    ),
    updated,
  );
  assert.deepEqual(callsFor(harness.calls, "create"), [
    { method: "create", args: [41, createBody] },
  ]);
  assert.deepEqual(callsFor(harness.calls, "updateDraft"), [
    { method: "updateDraft", args: [41, definition.templateId, updateBody] },
  ]);
  assert.equal(createBody.definition, definition);
  assert.equal(updateBody.definition, definition);
  assert.equal("pageDocument" in definition, false);
});

test("重建草稿端点只委托客户端提供的精确正式版本身份", async () => {
  const response = {
    templateId: "tpl_rebuild",
    publishedVersion: 4,
    draft: {
      baseVersion: 4,
      revision: 1,
      definitionChecksum: "a".repeat(64),
    },
  };
  const harness = createHarness({
    service: { rebuildDraftFromPublished: async () => response },
  });
  const body = Object.assign(new RebuildDynamicTemplateDraftFromPublishedDto(), {
    expectedVersion: 4,
    expectedChecksum: "a".repeat(64),
  });

  assert.equal(
    await harness.controller.rebuildDraftFromPublished(
      "tpl_rebuild",
      body,
      staffRequest(41, "SUPER_ADMIN"),
    ),
    response,
  );
  assert.deepEqual(callsFor(harness.calls, "rebuildDraftFromPublished"), [{
    method: "rebuildDraftFromPublished",
    args: [41, "tpl_rebuild", body],
  }]);
});

test("重建草稿 DTO 在生产 ValidationPipe 中只接受 expectedVersion 与 expectedChecksum", async () => {
  const pipe = new ValidationPipe({
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    whitelist: true,
  });
  const checksum = "b".repeat(64);
  const transformed = await pipe.transform({
    expectedVersion: "5",
    expectedChecksum: checksum,
    definition: definitionFixture(),
  }, {
    data: undefined,
    metatype: RebuildDynamicTemplateDraftFromPublishedDto,
    type: "body",
  });

  assert.deepEqual(transformed, Object.assign(
    new RebuildDynamicTemplateDraftFromPublishedDto(),
    { expectedVersion: 5, expectedChecksum: checksum },
  ));
  await assert.rejects(
    pipe.transform({ expectedVersion: 0, expectedChecksum: "B".repeat(64) }, {
      data: undefined,
      metatype: RebuildDynamicTemplateDraftFromPublishedDto,
      type: "body",
    }),
    BadRequestException,
  );
});

test("catalog 只组合统一 Repository 的正式版本与可编辑草稿", async () => {
  const published = { templateId: "tpl_catalog", version: 3 };
  const editable = { templateId: "tpl_editable", draft: { revision: 2 } };
  const harness = createHarness({
    service: {
      listMine: async () => [editable],
      listPublished: async () => [published],
    },
  });

  const catalog = await harness.controller.listCatalog(staffRequest(52, "SUPER_ADMIN"));
  assert.deepEqual(catalog, {
    items: [
      { kind: "published", template: published },
      { kind: "editable", template: editable },
    ],
  });
  assert.equal(callsFor(harness.calls, "listPublished").length, 1);
  assert.deepEqual(callsFor(harness.calls, "listMine"), [
    { method: "listMine", args: [52] },
  ]);

  const interceptor = new TransformInterceptor({ get: () => false } as never);
  const context = {
    getHandler: () => DynamicTemplatesController.prototype.listCatalog,
    switchToHttp: () => ({
      getRequest: () => ({ id: "dynamic-catalog-contract" }),
      getResponse: () => ({ writableEnded: false }),
    }),
  } as unknown as ExecutionContext;
  const wrapped = await firstValueFrom(
    interceptor.intercept(context, { handle: () => of(catalog) }),
  );

  assert.equal(wrapped.code, 200);
  assert.equal(wrapped.message, "success");
  assert.equal(wrapped.requestId, "dynamic-catalog-contract");
  assert.match(wrapped.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(wrapped.data, catalog);
  assert.equal("code" in catalog, false);
  assert.equal("data" in catalog, false);
});

test("ADMIN 目录不读取 SUPER_ADMIN 私有草稿", async () => {
  const harness = createHarness({
    service: { listPublished: async () => [] },
  });

  assert.deepEqual(
    await harness.controller.listCatalog(staffRequest(63, "ADMIN")),
    { items: [] },
  );
  assert.equal(callsFor(harness.calls, "listMine").length, 0);
  assert.equal(callsFor(harness.calls, "listPublished").length, 1);
});

test("published/exact-version/mine/draft 保留 service 返回的精确资源身份", async () => {
  const published = [{
    definition: { templateId: "tpl_precise" },
    definitionChecksum: "b".repeat(64),
    templateId: "tpl_precise",
    version: 7,
  }];
  const exact = published[0];
  const mine = [{ templateId: "tpl_mine", draft: { revision: 4 } }];
  const draft = mine[0];
  const harness = createHarness({
    service: {
      getDraft: async () => draft,
      getPublishedVersion: async () => exact,
      listMine: async () => mine,
      listPublished: async () => published,
    },
  });

  assert.equal(await harness.controller.listPublished(), published);
  assert.equal(await harness.controller.getPublishedVersion("tpl_precise", "7"), exact);
  assert.equal(await harness.controller.listMine(staffRequest(74, "SUPER_ADMIN")), mine);
  assert.equal(
    await harness.controller.getDraft("tpl_mine", staffRequest(74, "SUPER_ADMIN")),
    draft,
  );
  assert.deepEqual(callsFor(harness.calls, "getPublishedVersion"), [
    { method: "getPublishedVersion", args: ["tpl_precise", 7] },
  ]);
  assert.deepEqual(callsFor(harness.calls, "listMine"), [
    { method: "listMine", args: [74] },
  ]);
  assert.deepEqual(callsFor(harness.calls, "getDraft"), [
    { method: "getDraft", args: [74, "tpl_mine"] },
  ]);
});

test("publish 原样委托 strict payload，并允许 draft:null 保留 published 精确事实", async () => {
  const expectedChecksum = "c".repeat(64);
  const body = Object.assign(new PublishDynamicTemplateDto(), {
    expectedChecksum,
    expectedRevision: 8,
    targetVersion: 5,
    versionNote: "operator reviewed",
  });
  const response = {
    draft: null,
    published: {
      definition: { templateId: "tpl_publish" },
      definitionChecksum: expectedChecksum,
      templateId: "tpl_publish",
      version: 5,
    },
  };
  const harness = createHarness({ service: { publish: async () => response } });

  const result = await harness.controller.publish(
    "tpl_publish",
    body,
    staffRequest(85, "SUPER_ADMIN"),
  );

  assert.equal(result, response);
  assert.equal(result.draft, null);
  assert.equal(result.published.templateId, "tpl_publish");
  assert.equal(result.published.version, 5);
  assert.equal(result.published.definitionChecksum, expectedChecksum);
  assert.equal(result.published.definition.templateId, "tpl_publish");
  assert.deepEqual(callsFor(harness.calls, "publish"), [
    { method: "publish", args: [85, "tpl_publish", body] },
  ]);
});

test("Controller 不把双次 publish 调用伪装成幂等，仅逐次委托 service", async () => {
  let serviceAttempt = 0;
  const harness = createHarness({
    service: {
      publish: async () => ({ attempt: ++serviceAttempt }),
    },
  });
  const body = Object.assign(new PublishDynamicTemplateDto(), {
    expectedChecksum: "d".repeat(64),
    expectedRevision: 2,
    targetVersion: 1,
  });

  assert.deepEqual(
    await harness.controller.publish("tpl_twice", body, staffRequest(96, "SUPER_ADMIN")),
    { attempt: 1 },
  );
  assert.deepEqual(
    await harness.controller.publish("tpl_twice", body, staffRequest(96, "SUPER_ADMIN")),
    { attempt: 2 },
  );
  assert.deepEqual(callsFor(harness.calls, "publish"), [
    { method: "publish", args: [96, "tpl_twice", body] },
    { method: "publish", args: [96, "tpl_twice", body] },
  ]);
});

test("service 的 403/409/NotFound 异常不被 Controller 折叠成成功", async () => {
  const forbidden = new ForbiddenException("publish denied");
  const conflict = new ConflictException("draft conflict");
  const missing = new NotFoundException("version missing");
  const harness = createHarness({
    service: {
      getPublishedVersion: async () => Promise.reject(missing),
      publish: async () => Promise.reject(forbidden),
      updateDraft: async () => Promise.reject(conflict),
    },
  });
  const publishBody = Object.assign(new PublishDynamicTemplateDto(), {
    expectedChecksum: "e".repeat(64),
    expectedRevision: 3,
    targetVersion: 2,
  });
  const updateBody = Object.assign(new UpdateDynamicTemplateDraftDto(), {
    definition: definitionFixture(),
    expectedRevision: 3,
  });

  await assert.rejects(
    harness.controller.publish(
      "tpl_errors",
      publishBody,
      staffRequest(107, "SUPER_ADMIN"),
    ),
    (error) => error === forbidden,
  );
  await assert.rejects(
    harness.controller.updateDraft(
      "tpl_errors",
      updateBody,
      staffRequest(107, "SUPER_ADMIN"),
    ),
    (error) => error === conflict,
  );
  await assert.rejects(
    harness.controller.getPublishedVersion("tpl_errors", "9"),
    (error) => error === missing,
  );
  assert.equal(callsFor(harness.calls, "publish").length, 1);
  assert.equal(callsFor(harness.calls, "updateDraft").length, 1);
  assert.equal(callsFor(harness.calls, "getPublishedVersion").length, 1);
});

test("strict publish DTO 接受冻结客户端字段 expectedChecksum", async () => {
  const input = {
    expectedChecksum: "f".repeat(64),
    expectedRevision: 6,
    targetVersion: 4,
    versionNote: "reviewed snapshot",
  };
  const pipe = new ValidationPipe({
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    whitelist: true,
  });

  const transformed = await pipe.transform(input, {
    data: undefined,
    metatype: PublishDynamicTemplateDto,
    type: "body",
  });

  assert.deepEqual(transformed, Object.assign(new PublishDynamicTemplateDto(), input));
});

test("生产 ValidationPipe 剥离未知 checksum 字段且 service 只收到官方 strict payload", async () => {
  const pipe = new ValidationPipe({
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    whitelist: true,
  });
  const metadata = {
    data: undefined,
    metatype: PublishDynamicTemplateDto,
    type: "body" as const,
  };

  const input = {
    expectedChecksum: "a".repeat(64),
    expectedDefinitionChecksum: "b".repeat(64),
    expectedRevision: 6,
    targetVersion: 4,
    versionNote: "reviewed snapshot",
  };
  const transformed = await pipe.transform(input, metadata);
  const expectedBody = Object.assign(new PublishDynamicTemplateDto(), {
    expectedChecksum: input.expectedChecksum,
    expectedRevision: input.expectedRevision,
    targetVersion: input.targetVersion,
    versionNote: input.versionNote,
  });
  assert.deepEqual(transformed, expectedBody);
  assert.equal("expectedDefinitionChecksum" in transformed, false);

  const published = { draft: null, published: { templateId: "tpl_whitelist", version: 4 } };
  const harness = createHarness({ service: { publish: async () => published } });
  assert.equal(
    await harness.controller.publish(
      "tpl_whitelist",
      transformed,
      staffRequest(118, "SUPER_ADMIN"),
    ),
    published,
  );
  assert.deepEqual(callsFor(harness.calls, "publish"), [
    { method: "publish", args: [118, "tpl_whitelist", expectedBody] },
  ]);
});

test("strict publish DTO 拒绝大写 expectedChecksum", async () => {
  const pipe = new ValidationPipe({
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    whitelist: true,
  });
  const metadata = {
    data: undefined,
    metatype: PublishDynamicTemplateDto,
    type: "body" as const,
  };

  await assert.rejects(
    pipe.transform({
      expectedChecksum: "A".repeat(64),
      expectedRevision: 6,
      targetVersion: 4,
    }, metadata),
    BadRequestException,
  );
});

test("错误 checksum 字段单独出现时仅因缺少 expectedChecksum 返回 400", async () => {
  const pipe = new ValidationPipe({
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    whitelist: true,
  });

  try {
    await pipe.transform({
      expectedDefinitionChecksum: "a".repeat(64),
      expectedRevision: 6,
      targetVersion: 4,
    }, {
      data: undefined,
      metatype: PublishDynamicTemplateDto,
      type: "body",
    });
    assert.fail("缺少 expectedChecksum 的 strict publish body 不应通过");
  } catch (error) {
    assert.ok(error instanceof BadRequestException);
    const response = error.getResponse() as { message?: unknown };
    assert.ok(Array.isArray(response.message));
    assert.ok(response.message.length > 0);
    assert.ok(
      response.message.every(
        (message) => typeof message === "string" && message.startsWith("expectedChecksum "),
      ),
    );
    assert.equal(
      response.message.some(
        (message) => typeof message === "string" && message.includes("expectedDefinitionChecksum"),
      ),
      false,
    );
  }
});
