import { lazy, Suspense, type ReactNode } from "react";
import type {
  DynamicTemplateNodeProps,
  DynamicTemplateSlotType,
} from "./generated/templateDefinition.generated";
import type { ContentTemplateRenderMode } from "../runtime/ContentTemplateRenderSurface";
import {
  MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE,
  type MatureContentTemplateSlotType,
} from "./validateTemplateDefinition";

const MatureContentTemplateRenderer = lazy(() => import("./MatureContentTemplateRenderer"));

export interface DynamicTemplateNodeAdapterContext {
  content: unknown;
  mode: ContentTemplateRenderMode;
  nodeProps?: DynamicTemplateNodeProps;
  headingLevel?: 1 | 2;
}

export interface DynamicTemplateNodeAdapter {
  render: (context: DynamicTemplateNodeAdapterContext) => ReactNode;
}

const DYNAMIC_TEMPLATE_NODE_ADAPTERS: Partial<Record<DynamicTemplateSlotType, DynamicTemplateNodeAdapter>> = {};

for (const slotType of Object.keys(
  MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE,
) as MatureContentTemplateSlotType[]) {
  DYNAMIC_TEMPLATE_NODE_ADAPTERS[slotType] = {
    render: ({ content, mode, nodeProps, headingLevel }) => (
      <Suspense fallback={<div className="hc-dynamic-template__adapter-loading" aria-busy="true" />}>
        <MatureContentTemplateRenderer
          slotType={slotType}
          content={content}
          layoutData={nodeProps?.contentTemplateLayoutData}
          designProps={nodeProps?.contentTemplateDesignProps}
          mode={mode}
          headingLevel={headingLevel}
        />
      </Suspense>
    ),
  };
}

export function getDynamicTemplateNodeAdapter(
  slotType: DynamicTemplateSlotType,
): DynamicTemplateNodeAdapter | undefined {
  return DYNAMIC_TEMPLATE_NODE_ADAPTERS[slotType];
}
