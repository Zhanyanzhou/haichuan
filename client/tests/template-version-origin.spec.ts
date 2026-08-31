import { expect, test } from "@playwright/test";
import type {
  PersonalContentTemplate,
  SystemContentTemplateCurrent,
} from "../src/services/api";
import {
  countUpgradeableSystemTemplateInstances,
  upgradePersonalTemplateInstances,
  upgradeSystemTemplateInstances,
} from "../src/page-builder/templates/templateOrigin";

function personalTemplate(revision: number): PersonalContentTemplate {
  return {
    id: 7,
    name: "首屏布局",
    moduleType: "首屏主视觉",
    contractKey: "hero",
    contractVersion: 3,
    revision,
    layoutData: {
      version: 2,
      frame: { aspectRatioByViewport: { desktop: 0.5 } },
    },
    contentDefaults: null,
    createdAt: "2026-08-29T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
  };
}

function systemTemplate(activeVersion: number): SystemContentTemplateCurrent {
  return {
    contractKey: "hero",
    moduleType: "首屏主视觉",
    displayName: "首屏",
    contractVersion: 3,
    activeVersion,
    layoutData: {
      version: 2,
      frame: { aspectRatioByViewport: { desktop: 0.5 } },
    },
    source: "database",
    changeNote: "新版构图",
    updatedAt: "2026-08-29T00:00:00.000Z",
  };
}

test("个人模板打开页面时只升级布局与 revision，保留真实内容", () => {
  const document = {
    content: [{
      type: "首屏主视觉",
      props: {
        id: "hero-1",
        title: "真实页面标题",
        desktopImage: "/uploads/real.jpg",
        productCode: "HC-001",
        linkUrl: "/catalog",
        __instanceOverrides: { version: 2 },
        __templateOrigin: { kind: "personal", templateId: 7, revision: 1 },
      },
    }],
  };

  const result = upgradePersonalTemplateInstances(document, [personalTemplate(3)]);
  expect(result.upgradedCount).toBe(1);
  const props = result.document.content[0].props;
  expect(props.title).toBe("真实页面标题");
  expect(props.desktopImage).toBe("/uploads/real.jpg");
  expect(props.productCode).toBe("HC-001");
  expect(props.linkUrl).toBe("/catalog");
  expect(props.__templateOrigin).toEqual({ kind: "personal", templateId: 7, revision: 3 });
  expect(props.__instanceOverrides).toMatchObject({
    version: 2,
    frame: { aspectRatioByViewport: { desktop: 0.5 } },
  });
  expect(document.content[0].props.__templateOrigin).toEqual({
    kind: "personal",
    templateId: 7,
    revision: 1,
  });
});

test("模板缺失、读取失败或旧页面没有来源标记时继续使用布局快照", () => {
  const document = {
    content: [
      {
        type: "首屏主视觉",
        props: {
          id: "deleted-template",
          __instanceOverrides: { version: 2, frame: { colorPreset: "mist" } },
          __templateOrigin: { kind: "personal", templateId: 99, revision: 1 },
        },
      },
      {
        type: "首屏主视觉",
        props: {
          id: "legacy-no-origin",
          __instanceOverrides: { version: 2, frame: { colorPreset: "ink" } },
        },
      },
    ],
  };
  const result = upgradePersonalTemplateInstances(document, [personalTemplate(5)]);
  expect(result.upgradedCount).toBe(0);
  expect(result.document).toEqual(document);
});

test("系统模板只在运营确认后升级页面草稿，公开快照保持原版本", () => {
  const publishedSnapshot = {
    content: [{
      type: "首屏主视觉",
      props: {
        id: "system-hero",
        title: "已发布标题",
        __instanceOverrides: { version: 2 },
        __templateOrigin: { kind: "system", contractKey: "hero", version: 1 },
      },
    }],
  };
  const current = systemTemplate(2);
  expect(countUpgradeableSystemTemplateInstances(publishedSnapshot, current)).toBe(1);

  const draftUpgrade = upgradeSystemTemplateInstances(publishedSnapshot, current);
  expect(draftUpgrade.upgradedCount).toBe(1);
  expect(draftUpgrade.document.content[0].props.title).toBe("已发布标题");
  expect(draftUpgrade.document.content[0].props.__templateOrigin).toEqual({
    kind: "system",
    contractKey: "hero",
    version: 2,
  });
  expect(publishedSnapshot.content[0].props.__templateOrigin).toEqual({
    kind: "system",
    contractKey: "hero",
    version: 1,
  });
});
