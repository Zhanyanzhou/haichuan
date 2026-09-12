import assert from "node:assert/strict";
import test from "node:test";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import { PageModulesController } from "./page-modules.controller";
import { PageModulesService } from "./page-modules.service";

function createCodeOnlySystemTemplateService() {
  return new PageModulesService({} as PrismaService);
}

test("首屏测试模板只读接口向后台员工开放，覆盖与回滚入口不存在", () => {
  const prototype = PageModulesController.prototype;
  const allStaffRoles = [
    "SUPER_ADMIN",
    "ADMIN",
    "EDITOR",
    "CUSTOMER_SERVICE",
    "WAREHOUSE",
    "SALES_CONSULTANT",
    "FINANCE",
  ];
  assert.deepEqual(
    Reflect.getMetadata(ROLES_KEY, prototype.getSystemContentTemplates),
    allStaffRoles,
  );
  assert.deepEqual(
    Reflect.getMetadata(ROLES_KEY, prototype.getSystemContentTemplateHistory),
    allStaffRoles,
  );
  assert.deepEqual(
    Reflect.getMetadata(ROLES_KEY, prototype.getSystemContentTemplate),
    allStaffRoles,
  );
  assert.equal((prototype as any).overwriteSystemContentTemplate, undefined);
  assert.equal((prototype as any).rollbackSystemContentTemplate, undefined);
  assert.equal((PageModulesService.prototype as any).overwriteSystemContentTemplate, undefined);
  assert.equal((PageModulesService.prototype as any).rollbackSystemContentTemplate, undefined);
});

test("首屏测试模板只从代码合同读取 version 0，不依赖 Prisma 模板模型", async () => {
  const service = createCodeOnlySystemTemplateService();

  const [all, current, history] = await Promise.all([
    service.getSystemContentTemplates(),
    service.getSystemContentTemplate("hero"),
    service.getSystemContentTemplateHistory("hero"),
  ]);

  assert.equal(all.length, 1);
  assert.ok(all.every((template) => template.activeVersion === 0 && template.source === "code"));
  assert.equal(current.source, "code");
  assert.equal(current.activeVersion, 0);
  assert.equal(current.contractKey, "hero");
  assert.deepEqual(current.layoutData, { version: 2 });
  assert.deepEqual(history.map((version) => version.version), [0]);
  assert.equal(history[0]?.source, "code");
  assert.equal(history[0]?.active, true);
});
