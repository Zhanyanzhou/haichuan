import React from "react";
import { createRoot } from "react-dom/client";
import ContentTemplateContractFrame from "../../src/page-builder/runtime/ContentTemplateContractFrame";

// 独立验证共享 Frame 的清洗边界；公开文档入口另有整体验证。
const block = (window as unknown as {
  __CONTENT_TEMPLATE_RENDERER_DOCUMENT__: { content: { type: string; props: Record<string, unknown> }[] };
}).__CONTENT_TEMPLATE_RENDERER_DOCUMENT__.content[0];

createRoot(document.getElementById("root")!).render(
  <ContentTemplateContractFrame moduleType={block.type} mode="public" props={block.props}>
    <div className="hc-video-frame" style={{ height: 900, position: "relative" }}>
      <div data-content-role="copy" className="hc-video__copy" style={{ padding: 24 }}>原生文案</div>
    </div>
  </ContentTemplateContractFrame>,
);
