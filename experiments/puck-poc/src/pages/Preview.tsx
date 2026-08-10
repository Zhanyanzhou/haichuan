import React, { useEffect, useState } from "react";
import { Render } from "@puckeditor/core";
import { puckConfig, jewelryHomeTemplate } from "../config/puck.config";

const STORAGE_KEY = "puck-poc-data";

/** Preview 页面 — 只渲染 JSON，不加载编辑器 UI */
export function PreviewPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setData(JSON.parse(raw));
      } else {
        setData(jewelryHomeTemplate);
      }
    } catch {
      setData(jewelryHomeTemplate);
    }
  }, []);

  if (!data) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui", color: "#8A7F72" }}>
        加载中…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FBF9F6" }}>
      {/* 预览顶栏提示 */}
      <div
        style={{
          padding: "8px 16px",
          background: "#B8944E",
          color: "#fff",
          fontSize: 12,
          textAlign: "center",
          fontFamily: "system-ui",
        }}
      >
        🖥️ 前台预览 — 此页面不加载 Puck 编辑器 UI，仅用 &lt;Render&gt; 渲染 JSON
        <a
          href="/editor"
          style={{ color: "#fff", marginLeft: 16, textDecoration: "underline" }}
        >
          ← 返回编辑器
        </a>
      </div>
      {/* Puck Render：用同一套 React Block 渲染 JSON */}
      <Render config={puckConfig} data={data} />
    </div>
  );
}
