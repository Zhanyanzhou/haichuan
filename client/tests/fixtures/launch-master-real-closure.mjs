/**
 * 七块首发母版的真实闭环夹具。
 *
 * 母版定义只存在于 `launchTemplateSet.ts`（页面构建器源码），服务端不认识它们；
 * 真实闭环测试运行在 Playwright 的 Node 环境里，既不能靠 Vite 的 `@` 别名，也不应把
 * 七份完整定义复制进测试。这里用 Vite 的 SSR 加载器把同一份源码装进来，再按槽位类型
 * 生成可发布的页面内容，保证测试断言的是源码里的母版，而不是一份手抄副本。
 */
import { createServer } from "vite";

const loader = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
  // 母版定义只引用类型与纯函数；样式表是渲染器的副作用，测试环境不需要它。
  plugins: [{
    name: "launch-master-fixture-strip-css",
    transform(_code, id) {
      return id.endsWith(".css") ? { code: "export default {};", map: null } : null;
    },
  }],
});

const source = await loader.ssrLoadModule(
  "/src/page-builder/template-creation/launchTemplateSet.ts",
);
const { LAUNCH_TEMPLATE_MASTER_ENTRIES, instantiateLaunchTemplateMaster } = source;

/** 七块母版的派生定义，顺序与 `LAUNCH_TEMPLATE_MASTER_ENTRIES`（M1～M7）一致。 */
export function buildLaunchMasterDefinitions() {
  return LAUNCH_TEMPLATE_MASTER_ENTRIES.map((entry) => {
    const definition = instantiateLaunchTemplateMaster(entry.role);
    if (!definition) {
      throw new Error(`母版 ${entry.role} 没有派生出定义`);
    }
    return definition;
  });
}

/**
 * 按槽位类型填一份能让区块在公开页可见的内容。
 * 图片用根相对路径（公开渲染只认根相对或 https），行动槽位用站内页面路径。
 */
export function buildLaunchMasterContent(definition, assetUrl, text) {
  const contentBySlotId = {};
  for (const slot of Object.values(definition.slots)) {
    if (slot.type === "image") {
      contentBySlotId[slot.slotId] = { src: assetUrl, alt: `${slot.label}（隔离 QA）` };
    } else if (slot.type === "button" || slot.type === "link") {
      contentBySlotId[slot.slotId] = { label: slot.label, targetType: "page", pagePath: "/about" };
    } else {
      contentBySlotId[slot.slotId] = text;
    }
  }
  return contentBySlotId;
}

await loader.close();
