import assert from "node:assert/strict";
import test from "node:test";
import { PageModulesController } from "./page-modules.controller";
import { PageModulesService } from "./page-modules.service";
import {
  CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE,
  extractContentTemplateDefaultContent,
  getContentTemplateIssues,
  sanitizeContentTemplateDefaultContent,
  sanitizeContentTemplateLayoutData,
} from "./generated/contentTemplates.generated";

test("旧系统与个人模板读写入口均已从控制器和服务移除", () => {
  const retiredMethods = [
    "getSystemContentTemplates",
    "getSystemContentTemplateHistory",
    "getSystemContentTemplate",
    "getPersonalContentTemplates",
    "overwriteSystemContentTemplate",
    "rollbackSystemContentTemplate",
    "createPersonalContentTemplate",
    "updatePersonalContentTemplate",
    "deletePersonalContentTemplate",
  ];
  for (const method of retiredMethods) {
    assert.equal((PageModulesController.prototype as any)[method], undefined);
    assert.equal((PageModulesService.prototype as any)[method], undefined);
  }
});

test("旧模板采用新版默认构图，合法双端覆盖保留且越界几何拒绝持久化", () => {
  const legacyOverrides = {
    version: 2,
    nodes: {
      mobileImage: {
        rectByViewport: {
          mobile: { x: -0.2, y: 0.7, width: 1.4, height: 0.5 },
        },
        mediaView: {
          focusByViewport: { mobile: { x: 61, y: 48 } },
        },
      },
      title: {
        rectByViewport: {
          desktop: { x: -1, y: 0.5, width: 2, height: 0.1 },
          mobile: { x: 0.2, y: 0.62, width: 0.6, height: 0.12 },
        },
      },
    },
  };
  const issues = getContentTemplateIssues({
    moduleType: "首屏主视觉",
    props: {
      id: "legacy-hero",
      __contentTemplate: { key: "hero", version: 2 },
      __instanceOverrides: legacyOverrides,
    },
  });
  assert.ok(issues.some((issue) => issue.code === "content-template-legacy"));
  assert.ok(issues.some((issue) =>
    issue.severity === "error" && issue.path.includes("rectByViewport.desktop")
  ));

  const sanitized = sanitizeContentTemplateLayoutData("首屏主视觉", legacyOverrides);
  assert.deepEqual(
    sanitized?.nodes?.title?.rectByViewport?.mobile,
    { x: 0.2, y: 0.62, width: 0.6, height: 0.12 },
  );
  assert.equal(sanitized?.nodes?.title?.rectByViewport?.desktop, undefined);
  assert.equal(sanitized?.nodes?.mobileImage?.rectByViewport?.mobile, undefined);
  assert.deepEqual(
    sanitized?.nodes?.mobileImage?.mediaView?.focusByViewport?.mobile,
    { x: 61, y: 48 },
  );
});

test("服务端按轴尺寸兼容状态与客户端合同同源且规范化幂等", () => {
  const compatible = {
    version: 2,
    nodes: {
      action: {
        rectByViewport: {
          desktop: { x: 0.05, y: 0.8, width: 0.04, height: 0.03 },
        },
        sizeCompatibilityByViewport: {
          desktop: {
            width: CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE,
            height: CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE,
          },
        },
      },
    },
  };
  const sanitized = sanitizeContentTemplateLayoutData("首屏主视觉", compatible);
  assert.deepEqual(sanitized?.nodes?.action?.rectByViewport?.desktop, {
    x: 0.05,
    y: 0.8,
    width: 0.04,
    height: 0.03,
  });
  assert.deepEqual(sanitized?.nodes?.action?.sizeCompatibilityByViewport?.desktop, {
    width: CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE,
    height: CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE,
  });
  assert.deepEqual(sanitizeContentTemplateLayoutData("首屏主视觉", sanitized), sanitized);
  assert.equal(getContentTemplateIssues({
    moduleType: "首屏主视觉",
    props: {
      __contentTemplate: { key: "hero", version: 2 },
      __instanceOverrides: compatible,
    },
  }).some((issue) => issue.severity === "error"), false);

  const baseRect = { x: 0.05, y: 0.8, width: 0.04, height: 0.03 };
  const rawLayout = (field: keyof typeof baseRect, value: unknown) => ({
    version: 2,
    nodes: {
      action: {
        rectByViewport: { desktop: { ...baseRect, [field]: value } },
        sizeCompatibilityByViewport: compatible.nodes.action.sizeCompatibilityByViewport,
      },
    },
  });
  const assertLayoutRejected = (raw: Record<string, unknown>) => {
    const errors = getContentTemplateIssues({
      moduleType: "首屏主视觉",
      props: {
        __contentTemplate: { key: "hero", version: 2 },
        __instanceOverrides: raw,
      },
    }).filter((issue) => issue.severity === "error");
    assert.equal(errors.some((issue) => issue.path.includes("rectByViewport.desktop")), true);
    return sanitizeContentTemplateLayoutData("首屏主视觉", raw);
  };
  const assertRawRejected = (field: keyof typeof baseRect, value: unknown) =>
    assertLayoutRejected(rawLayout(field, value));
  for (const field of ["x", "y", "width", "height"] as const) {
    for (const value of [String(baseRect[field]), true, false, Number.NaN, Infinity, -Infinity]) {
      assert.equal(assertRawRejected(field, value)?.nodes?.action, undefined);
    }
  }
  for (const field of ["x", "y"] as const) {
    assert.equal(assertRawRejected(field, -0.01)?.nodes?.action, undefined);
  }
  for (const field of ["width", "height"] as const) {
    for (const value of [0, -0.01]) {
      assert.equal(assertRawRejected(field, value)?.nodes?.action, undefined);
    }
  }
  for (const raw of [
    { x: 0.05, y: 0.05, width: 0.04, height: 0.1 },
    { x: 0.05, y: 0.05, width: 0.8, height: 0.1 },
    { x: 0.05, y: 0.05, width: 0.2, height: 0.03 },
    { x: 0.05, y: 0.05, width: 0.2, height: 0.4 },
  ]) {
    assert.equal(assertLayoutRejected({
      version: 2,
      nodes: { action: { rectByViewport: { desktop: raw } } },
    })?.nodes?.action, undefined);
  }
  for (const [field, value] of [["x", 0.97], ["y", 0.98]] as const) {
    assert.equal(assertRawRejected(field, value)?.nodes?.action, undefined);
  }
  assert.equal(assertLayoutRejected({
    version: 2,
    nodes: {
      action: {
        rectByViewport: { desktop: baseRect },
        sizeCompatibilityByViewport: {
          desktop: { width: CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE },
        },
      },
    },
  })?.nodes?.action, undefined);
  const legalAtOrigin = {
    ...compatible,
    nodes: {
      action: {
        ...compatible.nodes.action,
        rectByViewport: { desktop: { ...baseRect, x: 0, y: 0 } },
      },
    },
  };
  const legalAtOriginSanitized = sanitizeContentTemplateLayoutData("首屏主视觉", legalAtOrigin);
  assert.deepEqual(
    legalAtOriginSanitized?.nodes?.action?.rectByViewport?.desktop,
    legalAtOrigin.nodes.action.rectByViewport.desktop,
  );
  assert.deepEqual(
    sanitizeContentTemplateLayoutData("首屏主视觉", legalAtOriginSanitized),
    legalAtOriginSanitized,
  );
  assert.equal(getContentTemplateIssues({
    moduleType: "首屏主视觉",
    props: {
      __contentTemplate: { key: "hero", version: 2 },
      __instanceOverrides: legalAtOrigin,
    },
  }).some((issue) => issue.severity === "error"), false);
});
