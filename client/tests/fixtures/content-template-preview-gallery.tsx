import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { CONTENT_TEMPLATE_REGISTRY } from "../../src/page-builder/generated/contentTemplates.generated";
import ContentTemplateRendererPreview from "../../src/page-builder/preview/ContentTemplateRendererPreview";

const viewport = new URLSearchParams(window.location.search).get("viewport") === "mobile"
  ? "mobile"
  : "desktop";

createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <main>
      {CONTENT_TEMPLATE_REGISTRY.map((entry) => (
        <article className="preview-card" data-template-key={entry.key} key={entry.key}>
          <ContentTemplateRendererPreview moduleType={entry.moduleType} viewport={viewport} />
          <strong>{entry.displayName}</strong>
        </article>
      ))}
    </main>
  </MemoryRouter>,
);
