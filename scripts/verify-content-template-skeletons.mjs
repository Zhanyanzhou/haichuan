import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(await readFile(path.join(root, "contracts/page-builder/content-templates.contract.json"), "utf8"));
for (const template of contract.templates) {
  assert.ok(Array.isArray(template.roles) && template.roles.length > 0, `${template.key} 缺少根构图角色`);
  for (const device of ["desktop", "mobile"]) {
    assert.ok(
      template.defaultGeometryByViewport?.[device]?.zones?.length,
      `${template.key} 缺少 ${device} 同源中性预览几何`,
    );
    assert.ok(template.order[device].length, `${template.key} 缺少 ${device} 阅读顺序`);
  }
}
const [preview, puckConfig, runtime, frame] = await Promise.all([
  readFile(path.join(root, "client/src/page-builder/preview/ContentTemplateSkeletonPreview.tsx"), "utf8"),
  readFile(path.join(root, "client/src/page-builder/config/puckConfig.tsx"), "utf8"),
  readFile(path.join(root, "client/src/page-builder/runtime/PuckDocumentRenderer.tsx"), "utf8"),
  readFile(path.join(root, "client/src/page-builder/runtime/ContentTemplateContractFrame.tsx"), "utf8"),
]);
assert.doesNotMatch(preview, /<img\b|https?:\/\//, "中性预览不得引入外部图片");
assert.doesNotMatch(puckConfig, /ContentTemplateSkeletonCanvas|render:\s*\(\)\s*=>\s*<ContentTemplateSkeleton/, "编辑画布不得用中性骨架覆盖真实 adapter render");
for (const template of contract.templates) {
  assert.match(puckConfig, new RegExp(`withContractRenderer\\(\\"${template.moduleType}\\"`), `${template.moduleType} 未注册真实合同 Renderer`);
}
assert.match(runtime, /ContentTemplateContractFrame[\s\S]*mode="public"/, "公开 Renderer 未接入统一合同根框架");
assert.match(frame, /data-content-template-renderer="real"/, "统一合同根框架缺少真实 Renderer 标记");
console.log(`内容模板根构图、缩略图与 ${contract.templates.length} 个真实 Renderer 注册一致。`);
