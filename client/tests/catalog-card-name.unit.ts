import { expect, test } from "@playwright/test";

import { DYNAMIC_TEMPLATE_BLOCK_TYPE } from "../src/page-builder/dynamic-template-instance/types";
import { getModuleDisplayName, resolveTemplateSectionRole } from "../src/pages/admin/HomepageConfig/editor-utils";
import { catalogCardName } from "../src/page-builder/template-editor/catalogCardName";

test("有区块角色的模板一律显示角色名", () => {
  expect(catalogCardName("maison-fact", "开发环境验收 maison-fact")).toBe("品牌事实");
  expect(catalogCardName("creation-grid", "开发环境验收 creation-grid")).toBe("作品网格");
  expect(catalogCardName("maison-fact", "开发环境验收 maison-fact 备用")).toBe("品牌事实");
  expect(catalogCardName("page-hero", "首页首屏")).toBe("页面首屏");
  expect(catalogCardName("page-hero", "首页首屏模板")).toBe("页面首屏");
  expect(catalogCardName("page-hero", "首页春季婚戒")).toBe("页面首屏");
  expect(catalogCardName("page-hero", "首屏")).toBe("页面首屏");
  expect(catalogCardName("page-hero", "春季婚戒")).toBe("页面首屏");
  expect(catalogCardName("creation-grid", "首页作品网格模板")).toBe("作品网格");
});

test("页面结构读取锁定版本或目录里的角色，不沿用保存名", () => {
  const savedName = { moduleName: "首页精选作品" };
  expect(getModuleDisplayName(
    DYNAMIC_TEMPLATE_BLOCK_TYPE,
    { ...savedName, templateId: "hcHomeCollection", templateVersion: 9 },
    resolveTemplateSectionRole(
      { templateId: "hcHomeCollection", templateVersion: 9, moduleName: "首页精选作品" },
      {
        definitions: {
          "hcHomeCollection@9": {
            templateId: "hcHomeCollection",
            version: 9,
            schemaVersion: 2,
            definitionChecksum: "checksum",
            definition: { metadata: { sectionRole: "creation-grid" } },
          },
        } as never,
      },
    ),
  )).toBe("作品网格");
  expect(getModuleDisplayName(
    DYNAMIC_TEMPLATE_BLOCK_TYPE,
    { ...savedName, templateId: "hcHomeCollection", templateVersion: 7 },
    resolveTemplateSectionRole(
      { templateId: "hcHomeCollection", templateVersion: 7, moduleName: "首页精选作品" },
      { rolesByTemplateId: { hcHomeCollection: "creation-grid" } },
    ),
  )).toBe("作品网格");
  expect(resolveTemplateSectionRole(
    { templateId: "hcHomeCollection", templateVersion: 7, moduleName: "首页精选作品" },
  )).toBeUndefined();
});

test("页面结构与目录卡片使用同一角色名", () => {
  expect(getModuleDisplayName(
    DYNAMIC_TEMPLATE_BLOCK_TYPE,
    { moduleName: "首页精选作品" },
    "creation-grid",
  )).toBe("作品网格");
  expect(getModuleDisplayName(
    DYNAMIC_TEMPLATE_BLOCK_TYPE,
    { moduleName: "内容展示｜版本升级" },
  )).toBe("内容展示｜版本升级");
});

test("没有角色声明时，从名称里的角色 key 识别，其余名称保持原样", () => {
  expect(catalogCardName(undefined, "开发环境验收 maison-fact")).toBe("品牌事实");
  expect(catalogCardName("page-hero", "page-hero")).toBe("页面首屏");
  expect(catalogCardName(undefined, "自定义名称")).toBe("自定义名称");
});
