import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import PuckDocumentRenderer, {
  type PuckDocument,
} from "../../src/page-builder/runtime/PuckDocumentRenderer";
import "../../src/styles/globals.css";

declare global {
  interface Window {
    __CONTENT_TEMPLATE_RENDERER_DOCUMENT__?: PuckDocument;
  }
}

const rendererDocument = window.__CONTENT_TEMPLATE_RENDERER_DOCUMENT__;

if (!rendererDocument) {
  throw new Error("缺少内容模板 Renderer 测试文档");
}

createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <PuckDocumentRenderer data={rendererDocument} />
  </MemoryRouter>,
);
