import assert from "node:assert/strict";
import test from "node:test";
import {
  DYNAMIC_TEMPLATE_ACTIVATION_CALL_PATTERN,
  DYNAMIC_TEMPLATE_CATALOG_PATTERN,
  DYNAMIC_TEMPLATE_PUBLISH_CALL_PATTERN,
  DYNAMIC_TEMPLATE_PUBLISH_ROUTE_PATTERN,
  findMatchingSourcePaths,
  isRuntimeTypeScriptSource,
  LEGACY_TEMPLATE_CLIENT_PATTERN,
  LEGACY_TEMPLATE_SERVER_ROUTE_PATTERN,
  LEGACY_TEMPLATE_SERVER_SERVICE_PATTERN,
  TEMPLATE_VERSION_HISTORY_POLICY_PATTERN,
} from "./template-v2-gate-d-rules.mjs";

test("Gate D 版本历史策略不绑定界面文案或属性顺序", () => {
  const rewrittenCopy = `
    <VersionHistoryNotice
      description="任意改写后的说明"
      data-template-version-history-policy="read-only-version-pinned"
      message="任意改写后的标题"
      type="info"
    />
  `;

  assert.match(rewrittenCopy, TEMPLATE_VERSION_HISTORY_POLICY_PATTERN);
});

test("Gate D 版本历史策略缺少稳定语义标识时失败关闭", () => {
  const copyOnly = `
    <Alert
      message="历史读取不会写入"
      description="页面继续使用原版本"
      type="info"
    />
  `;

  assert.doesNotMatch(copyOnly, TEMPLATE_VERSION_HISTORY_POLICY_PATTERN);
});

test("Gate D 路由规则兼容单双引号与格式调整", () => {
  const catalog = `
    @Get( 'catalog' )
    async listCatalog(req) {
      const published = await this . service . listPublished ( );
      const mine = await this . service . listMine ( req . user . id );
      return { published, mine };
    }
  `;
  const publish = `
    @Post(
      ':templateId/publish'
    )
    publishTemplate() {
      return this . service . publish (
        templateId,
      );
    }
  `;

  assert.match(catalog, DYNAMIC_TEMPLATE_CATALOG_PATTERN);
  assert.match(publish, DYNAMIC_TEMPLATE_PUBLISH_ROUTE_PATTERN);
  assert.match("@Get('system-content-templates/:id')", LEGACY_TEMPLATE_SERVER_ROUTE_PATTERN);
  assert.match("@Put( \"personal-content-templates/1\" )", LEGACY_TEMPLATE_SERVER_ROUTE_PATTERN);
});

test("Gate D 客户端发布与 Activation 规则兼容空白格式", () => {
  assert.match("dynamicTemplateApi\n  . publish (payload)", DYNAMIC_TEMPLATE_PUBLISH_CALL_PATTERN);
  assert.match("dynamicTemplateApi . getActivationImpact (id)", DYNAMIC_TEMPLATE_ACTIVATION_CALL_PATTERN);
  assert.match("dynamicTemplateApi\n  . activate (id)", DYNAMIC_TEMPLATE_ACTIVATION_CALL_PATTERN);
  assert.match("personalContentTemplateApi.list()", LEGACY_TEMPLATE_CLIENT_PATTERN);
  assert.match("/api/system-content-templates", LEGACY_TEMPLATE_CLIENT_PATTERN);
});

test("Gate D 全运行时扫描返回精确命中文件并拒绝状态化正则", () => {
  const files = [
    { path: "client/src/clean.ts", source: "export const clean = true;" },
    { path: "client/src/legacy.ts", source: "@Get('system-content-templates')" },
    { path: "server/src/legacy.ts", source: "getPersonalContentTemplates()" },
  ];

  assert.deepEqual(
    findMatchingSourcePaths(files, LEGACY_TEMPLATE_SERVER_ROUTE_PATTERN),
    ["client/src/legacy.ts"],
  );
  assert.deepEqual(
    findMatchingSourcePaths(files, LEGACY_TEMPLATE_SERVER_SERVICE_PATTERN),
    ["server/src/legacy.ts"],
  );
  assert.throws(
    () => findMatchingSourcePaths(files, /system-content-templates/g),
    /must not use stateful flags/,
  );
});

test("Gate D 运行时文件枚举排除测试和类型声明", () => {
  assert.equal(isRuntimeTypeScriptSource("TemplateWorkspace.tsx"), true);
  assert.equal(isRuntimeTypeScriptSource("dynamic-templates.service.ts"), true);
  assert.equal(isRuntimeTypeScriptSource("dynamic-templates.service.spec.ts"), false);
  assert.equal(isRuntimeTypeScriptSource("TemplateWorkspace.test.tsx"), false);
  assert.equal(isRuntimeTypeScriptSource("vite-env.d.ts"), false);
  assert.equal(isRuntimeTypeScriptSource("README.md"), false);
});
