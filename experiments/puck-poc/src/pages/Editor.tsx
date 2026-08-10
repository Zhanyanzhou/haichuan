import React, { useState, useCallback } from "react";
import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { puckConfig, jewelryHomeTemplate } from "../config/puck.config";

const STORAGE_KEY = "puck-poc-data";

/** 从 localStorage 加载数据，没有则用模板默认 */
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { ...jewelryHomeTemplate };
}

export function EditorPage() {
  const [data, setData] = useState<any>(loadData);
  const [showJson, setShowJson] = useState(false);

  const handlePublish = useCallback(async (newData: any) => {
    setData(newData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
  }, []);

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setData({ ...jewelryHomeTemplate });
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* 顶部工具栏 */}
      <div
        style={{
          padding: "8px 16px",
          background: "#1C1A18",
          color: "#F3F0E9",
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 13,
          flexShrink: 0,
        }}
      >
        <strong style={{ fontSize: 15 }}>Puck PoC — 编辑器</strong>
        <span style={{ flex: 1 }} />
        <button
          onClick={() => setShowJson(!showJson)}
          style={{
            padding: "4px 12px",
            background: "#3A3632",
            color: "#F3F0E9",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          {showJson ? "隐藏 JSON" : "查看 JSON"}
        </button>
        <a
          href="/preview"
          style={{ color: "#B8944E", textDecoration: "none", fontSize: 13 }}
        >
          前台预览 →
        </a>
        <button
          onClick={handleReset}
          style={{
            padding: "4px 12px",
            background: "#5C3A2E",
            color: "#F3F0E9",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          重置模板
        </button>
      </div>

      {/* JSON 面板 */}
      {showJson && (
        <div
          style={{
            padding: 12,
            background: "#2A2825",
            color: "#C8A87C",
            fontSize: 11,
            fontFamily: "monospace",
            maxHeight: 200,
            overflow: "auto",
            flexShrink: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {JSON.stringify(data, null, 2)}
        </div>
      )}

      {/* Puck 编辑器 */}
      <div style={{ flex: 1 }}>
        <Puck config={puckConfig} data={data} onPublish={handlePublish} />
      </div>
    </div>
  );
}
