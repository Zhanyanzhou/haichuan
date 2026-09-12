import { useMemo } from "react";
import type { TemplateRecipe } from "../template-definition/generated/templateDefinition.generated";
import { generateTemplateFromRecipe } from "./generateTemplateFromRecipe";
import { RecipeLayoutDiagram } from "./RecipeLayoutDiagram";

/** 候选只替换用户将要选择的那一项，禁止另造缩略图布局。 */
export default function RecipeOptionPreview({ recipe }: { recipe: TemplateRecipe }) {
  const result = useMemo(() => {
    try { return { definition: generateTemplateFromRecipe(recipe), error: "" }; }
    catch (error) { return { definition: null, error: error instanceof Error ? error.message : "请调整配置" }; }
  }, [recipe]);
  const empty = !recipe.media.length && !recipe.content.length;
  return <>
    <span className="template-recipe__option-viewport" aria-hidden="true">
      {result.definition ? <RecipeLayoutDiagram definition={result.definition} />
        : <span className="template-recipe__option-empty" style={{ aspectRatio: recipe.canvas.aspectRatio, width: Math.min(100, 132 * recipe.canvas.aspectRatio) }} data-canvas-width={recipe.canvas.width} data-canvas-height={recipe.canvas.height}>{empty ? "待添加图文" : "需调整配置"}</span>}
    </span>
    {result.error && <small className="template-recipe__option-error">{empty ? "选择图片或内容后形成方案" : result.error}</small>}
  </>;
}
