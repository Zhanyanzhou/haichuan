import HeroSection from "@/components/blocks/HeroSection";
import { heroPuckConfig } from "../adapters/hero.puck";
import { sanitizeContentTemplateDefaultContent } from "../generated/contentTemplates.generated";
import ContentTemplateContractFrame from "../runtime/ContentTemplateContractFrame";
import {
  CONTENT_TEMPLATE_RENDER_SURFACE,
  type ContentTemplateRenderMode,
} from "../runtime/ContentTemplateRenderSurface";
import type { PuckProps } from "../types";
import { convertPuckProps } from "../utils/puckPropsToModule";
import type { MatureContentTemplateSlotType } from "./validateTemplateDefinition";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function hasMeaningfulContent(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasMeaningfulContent);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasMeaningfulContent);
  }
  return false;
}

export interface MatureContentTemplateRendererProps {
  slotType: MatureContentTemplateSlotType;
  content: unknown;
  layoutData?: Record<string, unknown>;
  designProps?: Record<string, string | number | boolean>;
  mode: ContentTemplateRenderMode;
  headingLevel?: 1 | 2;
  priority?: boolean;
  homeSurface?: boolean;
  stableReferencesOnly?: boolean;
}

/** 模板库重建期间唯一保留的成熟模板 Renderer。 */
export default function MatureContentTemplateRenderer({
  content,
  layoutData,
  designProps,
  mode,
  headingLevel = 2,
  priority = false,
}: MatureContentTemplateRendererProps) {
  const moduleType = "首屏主视觉" as const;
  const sourceContent = asRecord(content);
  const rendersPageContent = mode === CONTENT_TEMPLATE_RENDER_SURFACE.PUBLIC || mode === "preview";
  const businessContent = sanitizeContentTemplateDefaultContent(moduleType, sourceContent);
  if (rendersPageContent && (!businessContent || !hasMeaningfulContent(businessContent))) {
    return null;
  }
  const editMode = mode !== CONTENT_TEMPLATE_RENDER_SURFACE.PUBLIC
    && mode !== CONTENT_TEMPLATE_RENDER_SURFACE.CATALOG_PREVIEW;
  const props: PuckProps = {
    ...heroPuckConfig.defaultProps,
    ...designProps,
    ...sourceContent,
    ...(layoutData ? { __instanceOverrides: layoutData } : {}),
  };
  const module = convertPuckProps(moduleType, props);
  if (!module) return null;

  return (
    <ContentTemplateContractFrame
      moduleType={moduleType}
      mode={mode === "editor" ? "editor" : "public"}
      props={props}
    >
      <HeroSection module={module} editMode={editMode} headingLevel={headingLevel} priority={priority} />
    </ContentTemplateContractFrame>
  );
}
