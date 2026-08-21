import React from "react";
import { createRoot } from "react-dom/client";
import { CONTENT_TEMPLATE_REGISTRY } from "../../src/page-builder/generated/contentTemplates.generated";
import ContentTemplateSkeletonPreview from "../../src/page-builder/preview/ContentTemplateSkeletonPreview";

const viewport = new URLSearchParams(window.location.search).get("viewport") === "mobile"
  ? "mobile"
  : "desktop";

createRoot(document.getElementById("root")!).render(
  <main>
    {CONTENT_TEMPLATE_REGISTRY.map((entry) => (
      <article className="preview-card" data-template-key={entry.key} key={entry.key}>
        <ContentTemplateSkeletonPreview moduleType={entry.moduleType} viewport={viewport} />
        <strong>{entry.displayName}</strong>
      </article>
    ))}
  </main>,
);
