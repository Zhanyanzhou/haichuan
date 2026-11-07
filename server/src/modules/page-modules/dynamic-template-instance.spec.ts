import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaService } from "../../common/prisma/prisma.service";
import {
  CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY,
  createContentTemplatePublicationAttestation,
} from "./content-template-contract";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  collectDynamicTemplateInstanceReferences,
  dynamicTemplateVersionKey,
  validateDynamicTemplateInstance,
} from "./dynamic-template-instance";
import { definitionFixture, mediaSideDefinitionFixture } from "./dynamic-template-test-fixture";
import { calculateDynamicTemplateDefinitionChecksum } from "./dynamic-template-definition-integrity";
import { PageModulesService } from "./page-modules.service";
import { makeFormalPageMetadata } from "./page-modules.spec-fixtures";
import type {
  DynamicTemplateNodeType,
  DynamicTemplateSlotType,
  TemplateDefinitionV2,
} from "./generated/templateDefinition.generated";

function instanceProps(overrides: Record<string, unknown> = {}) {
  return {
    id: "puck-instance-1",
    instanceSchemaVersion: 1,
    instanceId: "instance_1",
    templateId: "tpl_server_validation",
    templateVersion: 3,
    contentBySlotId: { slot_heading: "页面填写的标题" },
    overrides: {},
    hiddenSlotIds: [],
    isVisible: true,
    ...overrides,
  };
}

function addComplexSlot(
  definition: TemplateDefinitionV2,
  key: string,
  nodeType: DynamicTemplateNodeType,
  slotType: DynamicTemplateSlotType,
) {
  const nodeId = `node_${key}`;
  const slotId = `slot_${key}`;
  definition.nodes[nodeId] = {
    nodeId,
    type: nodeType,
    name: key,
    slotId,
    childIds: [],
    props: {},
    responsive: {
      desktop: { display: "block", order: 2, width: "fill", height: { mode: "auto" } },
      mobile: { display: "block", order: 2, width: "fill", height: { mode: "auto" } },
    },
    hidden: false,
  };
  definition.nodes.node_container.childIds.push(nodeId);
  definition.slots[slotId] = {
    slotId,
    key: `${key}Content`,
    type: slotType,
    label: key,
    required: false,
    editable: true,
    hideable: true,
    validation: {},
    desktopRules: {},
    mobileRules: {},
  };
}

function workGridDefinition() {
  const definition = definitionFixture();
  definition.metadata.sectionRole = "creation-grid";
  const workNodes = ["workA", "workB", "workC"].map((key) => {
    addComplexSlot(definition, key, "ImageSlot", "image");
    return `node_${key}`;
  });
  addComplexSlot(definition, "otherImage", "ImageSlot", "image");
  const container = definition.nodes.node_container;
  container.childIds = container.childIds.filter((id) => !workNodes.includes(id));
  const grid = {
    ...container,
    nodeId: "node_work_grid",
    type: "Grid" as const,
    childIds: workNodes,
    responsive: {
      desktop: { ...container.responsive.desktop, display: "grid" as const, columns: [1, 1, 1] },
      mobile: { ...container.responsive.mobile, display: "grid" as const, columns: [1, 1] },
    },
  };
  definition.nodes[grid.nodeId] = grid;
  definition.nodes.node_root.childIds.push(grid.nodeId);
  return definition;
}

function dynamicTemplatePage(props: unknown) {
  return {
    content: [{ type: DYNAMIC_TEMPLATE_BLOCK_TYPE, props }],
    zones: {},
  };
}

function createDraftSaveHarness(
  definition: TemplateDefinitionV2,
  versionRows: Array<Record<string, unknown>> = [{
    version: 3,
    schemaVersion: definition.schemaVersion,
    definition,
    definitionChecksum: calculateDynamicTemplateDefinitionChecksum(definition),
    template: { templateId: definition.templateId },
  }],
) {
  const writes = { create: 0, updateMany: 0, transaction: 0 };
  const db = {
    dynamicTemplateVersion: {
      findMany: async () => versionRows,
    },
    pageDocument: {
      findUnique: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.create += 1;
        return data;
      },
      updateMany: async () => {
        writes.updateMany += 1;
        return { count: 1 };
      },
    },
    $transaction: async () => {
      writes.transaction += 1;
      throw new Error("草稿保存不应开启事务");
    },
  } as unknown as PrismaService;
  return { service: new PageModulesService(db), writes };
}

test("动态页面实例只按 templateId + templateVersion 收集一次精确版本引用", () => {
  const referenceBlock = {
    type: DYNAMIC_TEMPLATE_BLOCK_TYPE,
    props: instanceProps(),
  };
  const references = collectDynamicTemplateInstanceReferences({
    content: [referenceBlock, referenceBlock, { type: "网站全局设置", props: {} }],
    zones: {
      secondary: [{
        type: DYNAMIC_TEMPLATE_BLOCK_TYPE,
        props: instanceProps({ templateVersion: 4, instanceId: "instance_2" }),
      }],
    },
  });

  assert.deepEqual(references, [
    { templateId: "tpl_server_validation", templateVersion: 3, instanceId: "instance_1" },
    { templateId: "tpl_server_validation", templateVersion: 4, instanceId: "instance_2" },
  ]);
});

test("模板页面实例通过槽位合同校验且不会携带未授权结构覆盖", () => {
  const result = validateDynamicTemplateInstance(instanceProps(), definitionFixture());

  assert.equal(result.issues.length, 0);
  assert.equal(result.definition?.templateId, "tpl_server_validation");
  assert.deepEqual(result.assets, []);
  assert.deepEqual(result.productCodes, []);
  assert.deepEqual(result.actions, []);
});

test("必填槽位必须由页面实例提供，母模板正式默认内容只作历史兼容回退", () => {
  const definition = definitionFixture();
  definition.slots.slot_heading.required = true;
  definition.slots.slot_heading.hideable = false;
  definition.defaultContent.slot_heading = "历史母模板默认标题";
  const result = validateDynamicTemplateInstance(instanceProps({ contentBySlotId: {} }), definition);

  assert.ok(result.issues.some((issue) => (
    issue.field === "slot_heading" && issue.message.includes("必填内容")
  )));
  const populated = validateDynamicTemplateInstance(instanceProps({
    contentBySlotId: { slot_heading: "页面实例已填写标题" },
  }), definition);
  assert.equal(populated.issues.length, 0);
});

test("锁定槽位没有页面覆盖时使用母模板默认内容，残留覆盖仍失败", () => {
  const definition = definitionFixture();
  definition.slots.slot_heading.editable = false;
  definition.slots.slot_heading.hideable = false;
  definition.defaultContent.slot_heading = "母模板锁定标题";

  const usesDefault = validateDynamicTemplateInstance(instanceProps({ contentBySlotId: {} }), definition);
  assert.equal(usesDefault.issues.length, 0);

  const leftover = validateDynamicTemplateInstance(instanceProps({
    contentBySlotId: { slot_heading: "页面残留覆盖" },
  }), definition);
  assert.ok(leftover.issues.some((issue) => (
    issue.field === "slot_heading" && issue.message.includes("不允许在页面中修改")
  )));
  assert.equal(leftover.issues.some((issue) => issue.message.includes("必填内容")), false);
});

test("可选图片兼容保留 alt 的旧清空值，必填图片仍明确阻断", () => {
  const definition = definitionFixture();
  addComplexSlot(definition, "image", "ImageSlot", "image");
  definition.slots.slot_image.label = "主图";
  const contentBySlotId = {
    slot_heading: "页面实例已填写标题",
    slot_image: { src: "", alt: "旧数据仍保留的说明" },
  };

  const optional = validateDynamicTemplateInstance(
    instanceProps({ contentBySlotId }),
    definition,
  );
  assert.deepEqual(optional.issues, []);
  assert.deepEqual(optional.assets, []);

  definition.slots.slot_image.required = true;
  definition.slots.slot_image.hideable = false;
  const required = validateDynamicTemplateInstance(
    instanceProps({ contentBySlotId }),
    definition,
  );
  assert.ok(required.issues.some((issue) => (
    issue.field === "slot_image" && issue.message.includes("主图为必填内容")
  )));
  assert.equal(required.issues.some((issue) => issue.message.includes("图片地址无效")), false);
});

test("图片已含标题是可选布尔，缺省仍按现有页面通过", () => {
  const absent = validateDynamicTemplateInstance(instanceProps(), definitionFixture());
  assert.equal(absent.issues.length, 0);

  const finished = validateDynamicTemplateInstance(
    instanceProps({ imageCarriesCopy: true }),
    definitionFixture(),
  );
  assert.equal(finished.issues.length, 0);

  const invalid = validateDynamicTemplateInstance(
    instanceProps({ imageCarriesCopy: "yes" }),
    definitionFixture(),
  );
  assert.ok(invalid.issues.some((issue) => issue.field === "imageCarriesCopy"));
});

test("页面图片位置只接受模板声明过的设置与左右两个取值", () => {
  const declared = mediaSideDefinitionFixture();

  assert.equal(validateDynamicTemplateInstance(instanceProps(), declared).issues.length, 0);
  assert.equal(
    validateDynamicTemplateInstance(instanceProps({ pageSettings: { mediaSide: "end" } }), declared).issues.length,
    0,
  );

  const undeclared = validateDynamicTemplateInstance(
    instanceProps({ pageSettings: { mediaSide: "end" } }),
    definitionFixture(),
  );
  assert.ok(undeclared.issues.some((issue) => issue.pathSuffix === ".pageSettings.mediaSide"));

  const badValue = validateDynamicTemplateInstance(instanceProps({ pageSettings: { mediaSide: "left" } }), declared);
  assert.ok(badValue.issues.some((issue) => issue.message.includes("只能选左或右")));

  const unknownKey = validateDynamicTemplateInstance(instanceProps({ pageSettings: { colorScheme: "dark" } }), declared);
  assert.ok(unknownKey.issues.some((issue) => issue.pathSuffix === ".pageSettings.colorScheme"));

  const notObject = validateDynamicTemplateInstance(instanceProps({ pageSettings: "end" }), declared);
  assert.ok(notObject.issues.some((issue) => issue.field === "pageSettings"));
});

test("完成稿的手机图和桌面图都进入素材校验", () => {
  const definition = definitionFixture();
  addComplexSlot(definition, "image", "ImageSlot", "image");
  const result = validateDynamicTemplateInstance(instanceProps({
    imageCarriesCopy: true,
    contentBySlotId: {
      slot_heading: "页面填写的标题",
      slot_image: {
        src: "/uploads/desktop.jpg",
        alt: "戒面",
        mobileSrc: "/uploads/mobile.jpg",
      },
    },
  }), definition);

  assert.equal(result.issues.length, 0);
  assert.deepEqual(result.assets.map((asset) => asset.url), [
    "/uploads/desktop.jpg",
    "/uploads/mobile.jpg",
  ]);
});

test("作品网格的页面图片可以关联公开作品，草稿保留引用且发布校验定位图片槽位", async () => {
  const definition = workGridDefinition();
  const contentBySlotId = {
    slot_workA: { src: "https://example.com/work-a.jpg", alt: "圆形宝石戒面", workProductCode: " WORK-123 " },
    slot_workB: { src: "https://example.com/work-b.jpg", alt: "镶嵌耳饰", workProductCode: "" },
    slot_workC: "https://example.com/work-c.jpg",
  };
  const props = instanceProps({ contentBySlotId });
  const validation = validateDynamicTemplateInstance(props, definition);
  assert.deepEqual(validation.actions, [{
    slotId: "slot_workA", targetType: "product", value: "WORK-123", sourceField: "workProductCode",
  }]);
  const astralCode = "WORK-\u{20BB7}";
  const withAstralCode = validateDynamicTemplateInstance(instanceProps({
    contentBySlotId: { ...contentBySlotId, slot_workA: { ...contentBySlotId.slot_workA, workProductCode: astralCode } },
  }), definition);
  assert.equal(withAstralCode.actions[0]?.value, astralCode);
  assert.deepEqual(validation.assets.map((asset) => asset.url), [
    contentBySlotId.slot_workA.src, contentBySlotId.slot_workB.src, contentBySlotId.slot_workC,
  ]);
  assert.equal(validateDynamicTemplateInstance({ ...props, hiddenSlotIds: ["slot_workA"] }, definition).actions.length, 0);

  const { service: draftService, writes } = createDraftSaveHarness(definition);
  const draft = await draftService.savePageDocument("home", dynamicTemplatePage(props), {});
  assert.ok(draft);
  assert.deepEqual(draft.puckData, dynamicTemplatePage(props));
  assert.equal(writes.create, 1);

  let isPublic = false;
  const db = {
    dynamicTemplateVersion: { findMany: async () => [{
      version: 3,
      schemaVersion: definition.schemaVersion,
      definition,
      definitionChecksum: calculateDynamicTemplateDefinitionChecksum(definition),
      template: { templateId: definition.templateId },
    }] },
    product: { findMany: async () => isPublic ? [{ code: "WORK-123", listingImageId: 1, images: [] }] : [] },
    category: { findMany: async () => [] },
    siteSetting: { findUnique: async () => null },
  };
  const service = new PageModulesService(db as unknown as PrismaService);
  const collect = (service as unknown as {
    collectPuckDataErrors(database: unknown, value: unknown, pageKey: string): Promise<Array<{ message: string; field?: string; path: string }>>;
  }).collectPuckDataErrors.bind(service);
  const document = { ...dynamicTemplatePage(props), root: { props: {} } };
  const isUnpublishedWorkIssue = (issue: { message: string }) => issue.message.includes("WORK-123 未满足公开发布条件");
  const unpublishedWorkIssue = (await collect(db, document, "home")).find(isUnpublishedWorkIssue);
  assert.ok(unpublishedWorkIssue);
  assert.equal(unpublishedWorkIssue.field, "slot_workA");
  assert.match(unpublishedWorkIssue.path, /\.contentBySlotId\.slot_workA\.workProductCode$/);
  isPublic = true;
  assert.equal((await collect(db, document, "home")).some(isUnpublishedWorkIssue), false);
});

test("页面实例稳定身份与整体显隐状态遵循 V2 合同", () => {
  const result = validateDynamicTemplateInstance(instanceProps({
    instanceId: "包含空格的实例",
    isVisible: "false",
    hiddenSlotIds: [12, "slot heading"],
  }), definitionFixture());
  const messages = result.issues.map((issue) => issue.message);

  assert.ok(messages.some((message) => message.includes("实例 ID 格式无效")));
  assert.ok(messages.some((message) => message.includes("显示状态必须是布尔值")));
  assert.equal(messages.filter((message) => message.includes("隐藏槽位必须使用合法 slotId")).length, 2);
});

test("页面实例写入身份不接受兼容读取使用的字符串版本或首尾空格", () => {
  const result = validateDynamicTemplateInstance(instanceProps({
    templateId: " tpl_server_validation ",
    templateVersion: "3",
  }), definitionFixture());

  assert.ok(result.issues.some((issue) => issue.pathSuffix === ".templateId"));
  assert.ok(result.issues.some((issue) => issue.pathSuffix === ".templateVersion"));
});

test("动态页面实例拒绝未知槽位、超长文字、非法隐藏和结构覆盖", () => {
  const result = validateDynamicTemplateInstance(instanceProps({
    contentBySlotId: {
      slot_heading: "超".repeat(61),
      slot_unknown: "不应写入",
    },
    hiddenSlotIds: ["slot_unknown", "slot_unknown"],
    overrides: { layout: "page-owned" },
  }), definitionFixture());
  const messages = result.issues.map((issue) => issue.message);

  assert.ok(messages.some((message) => message.includes("未声明槽位")));
  assert.ok(messages.some((message) => message.includes("最多允许 60 个字符")));
  assert.ok(messages.some((message) => message.includes("隐藏槽位不能重复")));
  assert.ok(messages.some((message) => message.includes("旧版结构覆盖不受支持")));
});

test("页面实例拒绝注入母模板节点定义、内部构图或展示参数", () => {
  const result = validateDynamicTemplateInstance(instanceProps({
    nodeDefinitions: { unsafe: true },
    contentTemplateLayoutData: { version: 2 },
    contentTemplateDesignProps: { layout: "grid-99" },
  }), definitionFixture());
  const messages = result.issues.map((issue) => issue.message);
  assert.ok(messages.some((message) => message.includes("未授权字段 nodeDefinitions")));
  assert.ok(messages.some((message) => message.includes("未授权字段 contentTemplateLayoutData")));
  assert.ok(messages.some((message) => message.includes("未授权字段 contentTemplateDesignProps")));
});

test("页面实例构图覆盖只允许母模板授权节点与安全范围", () => {
  const definition = definitionFixture();
  addComplexSlot(definition, "lockedText", "TextSlot", "text");
  const valid = validateDynamicTemplateInstance(instanceProps({
    layoutOverridesByNodeId: {
      node_heading: {
        desktop: {
          offsetXPercent: 12,
          offsetYPercent: -8,
          widthPercent: 120,
          zIndex: 2,
          fontSizePx: 48,
          textAlign: "center",
          marginTopPx: 16,
          marginBottomPx: 24,
          visuallyCollapsed: true,
        },
      },
    },
  }), definition);
  assert.equal(valid.issues.length, 0);

  const invalid = validateDynamicTemplateInstance(instanceProps({
    layoutOverridesByNodeId: {
      node_root: { desktop: { widthPercent: 120 } },
      node_lockedText: { desktop: { widthPercent: 120 } },
      node_heading: { desktop: { offsetXPercent: 80, widthPercent: 240, zIndex: 99, fontSizePx: 250, textAlign: "justify", marginTopPx: 500 } },
    },
  }), definition);
  const messages = invalid.issues.map((issue) => issue.message);
  assert.ok(messages.some((message) => message.includes("node_root") && message.includes("未开放")));
  assert.ok(messages.some((message) => message.includes("lockedText") && message.includes("宽度超出")));
  assert.ok(messages.some((message) => message.includes("位置偏移超出")));
  assert.ok(messages.some((message) => message.includes("宽度超出")));
  assert.ok(messages.some((message) => message.includes("层级超出")));
  assert.ok(messages.some((message) => message.includes("字号超出")));
  assert.ok(messages.some((message) => message.includes("文字对齐")));
  assert.ok(messages.some((message) => message.includes("上下间距")));
});

test("页面草稿允许缺少 required 内容，并按精确模板版本保存授权实例", async () => {
  const definition = definitionFixture();
  definition.slots.slot_heading.required = true;
  const changedProps = instanceProps({
    contentBySlotId: {},
    layoutOverridesByNodeId: {
      node_heading: {
        desktop: {
          offsetXPercent: 9,
          widthPercent: 115,
          zIndex: 3,
          fontSizePx: 40,
          textAlign: "center",
          marginTopPx: 12,
        },
      },
    },
  });
  const validation = validateDynamicTemplateInstance(changedProps, definition);
  assert.ok(validation.issues.some((issue) => issue.message.includes("必填内容")));

  const { service, writes } = createDraftSaveHarness(definition);
  await assert.doesNotReject(
    service.savePageDocument("home", dynamicTemplatePage(changedProps), {}),
  );
  assert.deepEqual(writes, { create: 1, updateMany: 0, transaction: 0 });
});

test("页面草稿实例授权问题全部在任何数据库写入前失败关闭", async (t) => {
  const assertDraftRejected = async (
    definition: TemplateDefinitionV2,
    props: unknown,
    expected: RegExp,
    versionRows?: Array<Record<string, unknown>>,
  ) => {
    const { service, writes } = createDraftSaveHarness(definition, versionRows);
    await assert.rejects(
      service.savePageDocument("home", dynamicTemplatePage(props), {}),
      expected,
    );
    assert.deepEqual(writes, { create: 0, updateMany: 0, transaction: 0 });
  };

  await t.test("拒绝身份无效的实例", async () => {
    const definition = definitionFixture();
    await assertDraftRejected(
      definition,
      instanceProps({ templateId: "" }),
      /页面草稿实例授权无效.*身份无效/,
    );
    await assertDraftRejected(
      definition,
      null,
      /页面草稿实例授权无效.*身份无效/,
    );
  });

  await t.test("拒绝兼容读取可归一化但不符合写入合同的原始身份", async () => {
    const definition = definitionFixture();
    await assertDraftRejected(
      definition,
      instanceProps({ templateVersion: "3" }),
      /页面草稿实例授权无效.*模板版本必须是正整数/,
    );
    await assertDraftRejected(
      definition,
      instanceProps({ templateId: " tpl_server_validation " }),
      /页面草稿实例授权无效.*模板身份不一致/,
    );
  });

  await t.test("拒绝未知实例字段", async () => {
    const definition = definitionFixture();
    await assertDraftRejected(
      definition,
      instanceProps({ nodeDefinitions: { unsafe: true } }),
      /页面草稿实例授权无效.*未授权字段 nodeDefinitions/,
    );
  });

  await t.test("拒绝未声明内容槽位", async () => {
    const definition = definitionFixture();
    await assertDraftRejected(
      definition,
      instanceProps({
        contentBySlotId: {
          slot_heading: "页面填写的标题",
          slot_unknown: "不应写入",
        },
      }),
      /页面草稿实例授权无效.*未声明槽位 slot_unknown/,
    );
  });

  await t.test("拒绝不可编辑内容槽位", async () => {
    const definition = definitionFixture();
    definition.slots.slot_heading.editable = false;
    await assertDraftRejected(
      definition,
      instanceProps(),
      /页面草稿实例授权无效.*不允许在页面中修改/,
    );
  });

  await t.test("拒绝非作品网格图片上的作品编号和错误编号类型", async () => {
    const definition = workGridDefinition();
    await assertDraftRejected(
      definition,
      instanceProps({ contentBySlotId: { slot_otherImage: { src: "", workProductCode: "WORK-123" } } }),
      /页面草稿实例授权无效.*不是可关联作品的网格图片/,
    );
    const invalidWorkCodes = [123, "A".repeat(51), "A\u0000B", "A\u007fB", "A\uD800B", "A\uDC00B", " . ", " .. "];
    for (const workProductCode of invalidWorkCodes) {
      await assertDraftRejected(
        definition,
        instanceProps({ contentBySlotId: { slot_workA: { src: "", workProductCode } } }),
        /页面草稿实例授权无效.*作品编号无效/,
      );
    }
  });

  await t.test("拒绝非法隐藏槽位", async () => {
    const definition = definitionFixture();
    await assertDraftRejected(
      definition,
      instanceProps({ hiddenSlotIds: ["slot_unknown"] }),
      /页面草稿实例授权无效.*隐藏槽位 slot_unknown 未在模板中声明/,
    );
  });

  await t.test("拒绝未授权或越界构图覆盖", async () => {
    const definition = definitionFixture();
    await assertDraftRejected(
      definition,
      instanceProps({
        layoutOverridesByNodeId: {
          node_heading: { desktop: { offsetXPercent: 99, fontSizePx: 400 } },
        },
      }),
      /页面草稿实例授权无效.*位置偏移超出/,
    );
  });

  await t.test("拒绝缺失的精确模板版本", async () => {
    const definition = definitionFixture();
    await assertDraftRejected(
      definition,
      instanceProps({ templateVersion: 4 }),
      /页面草稿实例授权无效.*精确模板版本不可用或校验和损坏/,
    );
  });

  await t.test("拒绝校验和损坏的精确模板版本", async () => {
    const definition = definitionFixture();
    await assertDraftRejected(
      definition,
      instanceProps(),
      /页面草稿实例授权无效.*精确模板版本不可用或校验和损坏/,
      [{
        version: 3,
        schemaVersion: definition.schemaVersion,
        definition,
        definitionChecksum: "0".repeat(64),
        template: { templateId: definition.templateId },
      }],
    );
  });
});

test("普通图片槽位的设备级适配与焦点只写入母模板授权的稀疏覆盖", () => {
  const definition = definitionFixture();
  addComplexSlot(definition, "image", "ImageSlot", "image");
  const valid = validateDynamicTemplateInstance(instanceProps({
    contentBySlotId: {
      slot_heading: "页面填写的标题",
      slot_image: { src: "https://example.com/portrait.jpg", alt: "珠宝佩戴肖像" },
    },
    layoutOverridesByNodeId: {
      node_image: {
        desktop: { objectFit: "contain", imageScalePercent: 150, focusXPercent: 28, focusYPercent: 64 },
      },
    },
  }), definition);
  assert.equal(valid.issues.length, 0);

  const invalid = validateDynamicTemplateInstance(instanceProps({
    layoutOverridesByNodeId: {
      node_heading: { desktop: { objectFit: "cover", imageScalePercent: 120, focusXPercent: 50 } },
      node_image: { desktop: { objectFit: "scale-down", imageScalePercent: 350, focusYPercent: 130 } },
    },
  }), definition);
  const messages = invalid.issues.map((issue) => issue.message);
  assert.ok(messages.some((message) => message.includes("标题") && message.includes("图片适配")));
  assert.ok(messages.some((message) => message.includes("标题") && message.includes("图片缩放")));
  assert.ok(messages.some((message) => message.includes("image") && message.includes("图片适配")));
  assert.ok(messages.some((message) => message.includes("image") && message.includes("图片缩放")));
  assert.ok(messages.some((message) => message.includes("image") && message.includes("图片焦点")));
});

test("成熟内容模板页面实例提取素材与稳定业务引用，且不接受数字商品 ID", () => {
  const definition = definitionFixture();
  addComplexSlot(definition, "heroTemplate", "HeroTemplate", "heroTemplate");
  const contentBySlotId = {
    slot_heading: "页面填写的标题",
      slot_heroTemplate: {
        desktopImage: "https://example.com/hero.jpg",
        mobileImage: "https://example.com/hero-mobile.jpg",
        altText: "代表作品首屏",
        title: "代表作品",
      targetType: "product",
      productCode: "P-900",
    },
  };
  const valid = validateDynamicTemplateInstance(instanceProps({ contentBySlotId }), definition);
  assert.deepEqual(valid.issues, []);
  assert.deepEqual(valid.assets, [
    { slotId: "slot_heroTemplate", sourceField: "desktopImage", url: "https://example.com/hero.jpg" },
    { slotId: "slot_heroTemplate", sourceField: "mobileImage", url: "https://example.com/hero-mobile.jpg" },
  ]);
  assert.ok(valid.productCodes.some((reference) => reference.value === "P-900"));
  assert.ok(valid.actions.some((reference) => reference.targetType === "product" && reference.value === "P-900"));

  const invalid = validateDynamicTemplateInstance(instanceProps({
    contentBySlotId: {
      ...contentBySlotId,
      slot_heroTemplate: {
        ...contentBySlotId.slot_heroTemplate,
        productId: 900,
      },
    },
  }), definition);
  assert.ok(invalid.issues.some((issue) => issue.message.includes("内容结构与母模板槽位不匹配")));
});

test("页面读取只水合实例引用的正式精确版本且不会持久化水合缓存", async () => {
  const definition = definitionFixture();
  definition.metadata.visualRole = "primary-stage";
  definition.metadata.headerCompatibility = ["overlay-light"];
  const storedPuckData = {
    content: [{ type: DYNAMIC_TEMPLATE_BLOCK_TYPE, props: instanceProps() }],
    root: { props: {} },
    [DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]: {
      "stale@1": { definition: { unsafe: true } },
    },
  };
  let versionLookup: unknown;
  let storedDefinitionChecksum = calculateDynamicTemplateDefinitionChecksum(definition);
  const prisma = {
    pageDocument: {
      findUnique: async () => ({
        id: 9,
        pageKey: "home",
        status: "PUBLISHED",
        publishedRevisionId: 99,
      }),
    },
    pageDocumentRevision: {
      findFirst: async () => ({
        id: 99,
        documentId: 9,
        puckData: storedPuckData,
        metadata: {
          ...makeFormalPageMetadata(storedPuckData),
          [CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY]:
            createContentTemplatePublicationAttestation(),
        },
        version: 8,
        publishedAt: new Date("2026-08-28T00:00:00.000Z"),
        createdAt: new Date("2026-08-28T00:00:00.000Z"),
        publishedBy: 1,
      }),
    },
    dynamicTemplateVersion: {
      findMany: async (input: unknown) => {
        versionLookup = input;
        return [{
          version: 3,
          schemaVersion: 1,
          definition,
          definitionChecksum: storedDefinitionChecksum,
          template: { templateId: definition.templateId },
        }];
      },
    },
  } as unknown as PrismaService;
  const service = new PageModulesService(prisma);

  const published = await service.getPublishedPageDocument("home");
  const puckData = published?.puckData as Record<string, unknown>;
  const resolved = puckData[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY] as Record<string, unknown>;

  assert.deepEqual(Object.keys(resolved), [dynamicTemplateVersionKey(definition.templateId, 3)]);
  assert.equal("stale@1" in resolved, false);
  assert.deepEqual(
    (versionLookup as { where: { OR: unknown[] } }).where.OR,
    [{ version: 3, template: { templateId: definition.templateId, visibility: "STAFF" } }],
  );

  storedDefinitionChecksum = "0".repeat(64);
  const corrupted = await service.getPublishedPageDocument("home");
  assert.equal(corrupted?.status, "INVALID");
  assert.equal(corrupted?.invalidReason, "publication-revalidation-required");
  assert.equal("puckData" in (corrupted ?? {}), false);

  const normalize = (service as unknown as {
    normalizePageDocumentPuckData(value: unknown): Record<string, unknown>;
  }).normalizePageDocumentPuckData.bind(service);
  const normalized = normalize(puckData);
  assert.equal(DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY in normalized, false);
  assert.deepEqual(normalized.content, storedPuckData.content);
});

test("页面发布校验拒绝结构、Schema 或 checksum 漂移的精确模板版本", async () => {
  const definition = definitionFixture();
  let storedChecksum = calculateDynamicTemplateDefinitionChecksum(definition);
  const db = {
    dynamicTemplateVersion: {
      findMany: async () => [{
        version: 3,
        schemaVersion: 1,
        definition,
        definitionChecksum: storedChecksum,
        template: { templateId: definition.templateId },
      }],
    },
    product: { findMany: async () => [] },
    category: { findMany: async () => [] },
    siteSetting: { findUnique: async () => null },
  };
  const service = new PageModulesService(db as unknown as PrismaService);
  const collect = (service as unknown as {
    collectPuckDataErrors(database: unknown, value: unknown, pageKey: string): Promise<Array<{ message: string }>>;
  }).collectPuckDataErrors.bind(service);
  const puckData = {
    content: [{ type: DYNAMIC_TEMPLATE_BLOCK_TYPE, props: instanceProps() }],
    zones: {},
    root: { props: {} },
  };

  const valid = await collect(db, puckData, "home");
  assert.equal(valid.some((issue) => issue.message.includes("结构或校验和已损坏")), false);

  storedChecksum = "0".repeat(64);
  const corrupted = await collect(db, puckData, "home");
  assert.ok(corrupted.some((issue) => issue.message.includes("结构或校验和已损坏")));
});

test("页面实例构图覆盖拒绝结构节点、按钮字号与文字槽图片适配", () => {
  const definition = definitionFixture();
  addComplexSlot(definition, "cta", "ButtonSlot", "button");
  definition.nodes.node_cta.instanceEditPolicy = {
    position: true,
    size: true,
    zIndex: false,
    imageFit: true,
    imageFocus: true,
    typography: true,
    spacing: true,
    minWidthPercent: 25,
    maxWidthPercent: 150,
    maxOffsetPercent: 30,
    minFontSizePx: 12,
    maxFontSizePx: 96,
    maxSpacingPx: 120,
  };
  const result = validateDynamicTemplateInstance(instanceProps({
    layoutOverridesByNodeId: {
      node_container: { desktop: { widthPercent: 120 } },
      node_cta: { desktop: { fontSizePx: 24, textAlign: "center", marginTopPx: 16, visuallyCollapsed: true } },
      node_heading: { desktop: { objectFit: "cover", focusXPercent: 40, visuallyCollapsed: false } },
    },
  }), definition);
  const messages = result.issues.map((issue) => issue.message);
  assert.ok(messages.some((message) => message.includes("node_container") && message.includes("未开放")));
  assert.ok(messages.some((message) => message.includes("cta") && message.includes("字号")));
  assert.ok(messages.some((message) => message.includes("cta") && message.includes("文字对齐")));
  assert.ok(messages.some((message) => message.includes("cta") && message.includes("上下间距")));
  assert.ok(messages.some((message) => message.includes("主标题") && message.includes("图片适配")));
  assert.ok(messages.some((message) => message.includes("主标题") && message.includes("图片焦点")));
  assert.ok(messages.some((message) => message.includes("cta") && message.includes("不能在这一端收起文字")));
  assert.ok(messages.some((message) => message.includes("主标题") && message.includes("不能在这一端收起文字")));
});
