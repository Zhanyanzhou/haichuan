import { expect, test } from "@playwright/test";

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

test("没有角色声明时，从名称里的角色 key 识别，其余名称保持原样", () => {
  expect(catalogCardName(undefined, "开发环境验收 maison-fact")).toBe("品牌事实");
  expect(catalogCardName("page-hero", "page-hero")).toBe("页面首屏");
  expect(catalogCardName(undefined, "自定义名称")).toBe("自定义名称");
});
