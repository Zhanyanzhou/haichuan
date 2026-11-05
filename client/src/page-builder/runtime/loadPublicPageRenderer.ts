// 公开路由可在读取 PageDocument 时并行下载渲染代码；后台入口不触发这些加载。
// 与 React.lazy 使用同一 import，浏览器复用模块下载，不建立第二份 Renderer。
export const loadPuckDocumentRenderer = () => import("./PuckDocumentRenderer");

export function preloadPublicPageRenderer() {
  // 预取失败不改变页面状态；真正渲染时仍由现有 Suspense/ErrorBoundary 处理。
  void loadPuckDocumentRenderer().catch(() => undefined);
}
