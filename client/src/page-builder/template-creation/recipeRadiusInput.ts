import type { TemplateRecipe } from "../template-definition/generated/templateDefinition.generated";
import { isCanvasBackground } from "./presets";

/** 原始文本与正式数值分离；空白、小数和越界输入不作取整或夹取。 */
export function parseRecipeRadiusInput(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= 200 ? value : null;
}

export function hasInvalidRecipeRadiusInputs(
  recipe: TemplateRecipe,
  radiusInputs: Readonly<Record<string, string>>,
): boolean {
  return recipe.media.some((slot) => !isCanvasBackground(recipe, slot) && slot.shape !== "circle"
    && parseRecipeRadiusInput(radiusInputs[slot.id] ?? String(slot.borderRadius)) === null);
}
