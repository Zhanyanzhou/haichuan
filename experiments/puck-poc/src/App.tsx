import React from "react";
import { EditorPage } from "./pages/Editor";
import { PreviewPage } from "./pages/Preview";

/**
 * App — 通过 URL path 路由
 * /         → 编辑器
 * /preview  → 前台渲染
 */
export default function App() {
  const isPreview = window.location.pathname.includes("/preview");

  if (isPreview) {
    return <PreviewPage />;
  }
  return <EditorPage />;
}
