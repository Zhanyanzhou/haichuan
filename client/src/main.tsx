import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  RouterProvider,
  createBrowserRouter,
  createRoutesFromElements,
  Route,
} from 'react-router-dom';
import App from './App';
import './styles/globals.css';
import './styles/adminLuxury.css';
import './styles/adminDashboard.css';
import './styles/adminCompatibility.css';

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
