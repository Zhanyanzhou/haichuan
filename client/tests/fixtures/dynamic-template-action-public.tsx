import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import {
  DynamicTemplateRenderer,
  validateDynamicTemplateDefinition,
} from "../../src/page-builder/template-definition";

const STORAGE_KEY = "dynamic-template-action-public-payload";
const rawPayload = sessionStorage.getItem(STORAGE_KEY);
const parsedPayload = rawPayload ? JSON.parse(rawPayload) as {
  definition?: unknown;
  contentBySlotId?: Record<string, unknown>;
} : null;
const validation = validateDynamicTemplateDefinition(parsedPayload?.definition);
const root = createRoot(document.getElementById("root")!);

if (!validation.valid) {
  root.render(<main role="alert">模板定义无法公开渲染：{JSON.stringify(validation.issues)}</main>);
} else {
  const definition = validation.definition;
  const contentBySlotId = parsedPayload?.contentBySlotId ?? {};
  const linkSlot = Object.values(definition.slots).find((slot) => slot.type === "link");
  const invalidContentBySlotId = linkSlot
    ? {
        ...contentBySlotId,
        [linkSlot.slotId]: {
          label: "无效链接",
          targetType: "external",
          url: "http://unsafe.example.com",
        },
      }
    : contentBySlotId;

  root.render(
    <MemoryRouter>
      <main aria-label="行动槽位公开 Renderer">
        <section aria-label="桌面行动槽位">
          <DynamicTemplateRenderer
            definition={definition}
            device="desktop"
            mode="public"
            contentBySlotId={contentBySlotId}
          />
        </section>
        <section aria-label="移动行动槽位">
          <DynamicTemplateRenderer
            definition={definition}
            device="mobile"
            mode="public"
            contentBySlotId={contentBySlotId}
          />
        </section>
        <section aria-label="无效行动槽位">
          <DynamicTemplateRenderer
            definition={definition}
            device="desktop"
            mode="public"
            contentBySlotId={invalidContentBySlotId}
          />
        </section>
      </main>
    </MemoryRouter>,
  );
}
