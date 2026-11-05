import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import PuckDocumentRenderer from "../../src/page-builder/runtime/PuckDocumentRenderer";
import type { PuckDocument } from "../../src/page-builder/types";

function measure(data: PuckDocument, Renderer = PuckDocumentRenderer) {
  let schemaReads = 0;
  const definitions = data.resolvedDynamicTemplates as Record<string, { definition: Record<string, unknown> }>;
  const instrumented = Object.fromEntries(Object.entries(definitions).map(([key, resolved]) => [key, {
    ...resolved,
    definition: new Proxy(resolved.definition, {
      get(target, property, receiver) {
        if (property === "schemaVersion") schemaReads += 1;
        return Reflect.get(target, property, receiver);
      },
    }),
  }]));
  const started = performance.now();
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<Renderer data={{ ...data, resolvedDynamicTemplates: instrumented }} pageKey="home" surface="home" primaryHeading="海川珠宝" />));
    return { schemaReads, durationMs: performance.now() - started, html: host.innerHTML };
  } finally {
    flushSync(() => root.unmount());
  }
}

Object.assign(window, { publicRendererWorkProbe: { measure } });

declare global {
  interface Window { publicRendererWorkProbe: { measure: typeof measure }; }
}
