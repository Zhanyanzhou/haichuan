import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  RouterProvider,
  createBrowserRouter,
  createRoutesFromElements,
  Route,
} from 'react-router-dom';
import App from './App';
// 品牌字体本地自托管（Fontsource，OFL 许可）：woff2 随构建产出为内容哈希资产，
// 中文按 unicode-range 分片、浏览器只下载实际用到的分片；不再依赖境外字体域。
// 拉丁字体（Cormorant/Inter）@font-face 体积极小（gzip ~1KB），静态进入口 CSS。
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './styles/globals.css';

/**
 * 2026-08-16 声明式 BrowserRouter → 数据路由迁移（批次 D 前置）：
 * useBlocker / usePrompt 仅在数据路由（createBrowserRouter）下可用，
 * 装修编辑器的“未保存离开拦截”依赖它。
 * App 内部自带 <Routes>（descendant routes），外层 pathless splat 承接全部路径，
 * 路由树零改动，任何 location 变化都会触发 blocker。
 */
const router = createBrowserRouter(
  createRoutesFromElements(<Route path="*" element={<App />} />),
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);

// 中文衬线分片不与 PageDocument 和首屏图片争抢首访带宽；完整页面 load 后再在空闲期换装。
const loadDeferredChineseFonts = () => {
  const load = () => {
    void import('@fontsource/noto-serif-sc/300.css');
    void import('@fontsource/noto-serif-sc/400.css');
  };
  const scheduleIdle = (window as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  }).requestIdleCallback;
  if (scheduleIdle) {
    scheduleIdle(load, { timeout: 2000 });
  } else {
    globalThis.setTimeout(load, 1000);
  }
};

if (document.readyState === 'complete') loadDeferredChineseFonts();
else window.addEventListener('load', loadDeferredChineseFonts, { once: true });
