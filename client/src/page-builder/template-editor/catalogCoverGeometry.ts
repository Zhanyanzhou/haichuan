import { getRecipeLayoutDiagramRegions } from "../template-creation/RecipeLayoutDiagram";
import type { TemplateDefinitionV2 } from "../template-definition";
import { formatTemplateRatio, resolveTemplateDesignFrame } from "../template-definition/templateDimensions";

export type CatalogCoverFrame = {
  width: number;
  height: number;
  aspect: number;
  ratioLabel: string;
};

/** 组件库预览图裁切框跟当前模板桌面画幅走，不另造 4:3 封面比例。 */
export function resolveCatalogCoverFrame(definition: TemplateDefinitionV2): CatalogCoverFrame {
  const canvas = definition.metadata.canvasSize;
  if (canvas && canvas.width > 0 && canvas.height > 0) {
    return {
      width: canvas.width,
      height: canvas.height,
      aspect: canvas.width / canvas.height,
      ratioLabel: formatTemplateRatio(canvas.width, canvas.height),
    };
  }
  const frame = resolveTemplateDesignFrame(definition, "desktop");
  const height = Math.max(1, frame.fallbackHeight);
  return {
    width: frame.sourceWidth,
    height,
    aspect: frame.sourceWidth / height,
    ratioLabel: frame.ratioLabel === "auto"
      ? formatTemplateRatio(frame.sourceWidth, height)
      : frame.ratioLabel,
  };
}

export function catalogCoverImageSlots(definition: TemplateDefinitionV2) {
  return getRecipeLayoutDiagramRegions(definition).filter((region) => (
    region.kind === "image" || region.kind === "logo" || region.kind === "background"
  ));
}

export function catalogCoverMediaSpec(frame: CatalogCoverFrame) {
  return {
    width: Math.round(frame.width),
    height: Math.round(frame.height),
    ratio: `${Math.round(frame.width)} / ${Math.round(frame.height)}`,
    label: "组件库预览图",
  };
}
