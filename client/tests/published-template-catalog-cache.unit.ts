import { expect, test } from "@playwright/test";
import {
  dropCatalogItemsByTemplateId,
  dropPublishedTemplatesById,
  publishedCatalogIdentity,
} from "../src/page-builder/dynamic-template-instance/publishedTemplateCatalogCache";

test("目录身份只认 templateId、版本和 checksum，顺序不影响", () => {
  expect(publishedCatalogIdentity([
    { templateId: "tpl_b", version: 2, definitionChecksum: "bbb" },
    { templateId: "tpl_a", version: 1, definitionChecksum: "aaa" },
  ])).toBe(publishedCatalogIdentity([
    { templateId: "tpl_a", version: 1, definitionChecksum: "aaa" },
    { templateId: "tpl_b", version: 2, definitionChecksum: "bbb" },
  ]));
  expect(publishedCatalogIdentity([
    { templateId: "tpl_a", version: 1, definitionChecksum: "aaa" },
  ])).not.toBe(publishedCatalogIdentity([
    { templateId: "tpl_a", version: 2, definitionChecksum: "aaa" },
  ]));
});

test("归档或删除按 templateId 同时移出正式目录与可编辑卡片", () => {
  expect(dropPublishedTemplatesById([
    { templateId: "tpl_keep", version: 1 },
    { templateId: "tpl_gone", version: 2 },
  ], "tpl_gone")).toEqual([{ templateId: "tpl_keep", version: 1 }]);
  expect(dropCatalogItemsByTemplateId([
    { kind: "published" as const, template: { templateId: "tpl_gone" } },
    { kind: "editable" as const, template: { templateId: "tpl_keep" } },
  ], "tpl_gone")).toEqual([
    { kind: "editable", template: { templateId: "tpl_keep" } },
  ]);
});

test("移除后的目录身份与原集合不同，避免把归档项当成同一缓存键", () => {
  const before = [
    { templateId: "tpl_keep", version: 1, definitionChecksum: "aaa" },
    { templateId: "tpl_gone", version: 2, definitionChecksum: "bbb" },
  ];
  const after = dropPublishedTemplatesById(before, "tpl_gone").map((item) => ({
    templateId: item.templateId,
    version: item.version,
    definitionChecksum: item.templateId === "tpl_keep" ? "aaa" : "bbb",
  }));
  expect(publishedCatalogIdentity(after)).not.toBe(publishedCatalogIdentity(before));
  expect(publishedCatalogIdentity(after)).toBe(publishedCatalogIdentity([
    { templateId: "tpl_keep", version: 1, definitionChecksum: "aaa" },
  ]));
});
