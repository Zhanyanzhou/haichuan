import type { TemplateRecipe } from "../template-definition/generated/templateDefinition.generated";
import { createMediaSlots } from "./presets";

type RecipeMedia = TemplateRecipe["media"][number];

export type RecipeMediaHistory = Record<string, { media: RecipeMedia[]; edited: Record<string, boolean> }>;

/** 独立外观优先；普通图片未编辑的圆角始终从当前风格解析。 */
export function applyInheritedMediaRadius(media: readonly RecipeMedia[], radius: number, edited: Record<string, boolean>): RecipeMedia[] {
  return media.map((slot) => ({ ...slot, borderRadius: slot.role === "backgroundImage" || slot.role === "logo" || edited[slot.id] ? slot.borderRadius : radius }));
}

/** 撤回成员与角色变化，仍在场的对象保留其最新名称和独立外观。 */
export function restoreRecipeMediaStructure(previous: RecipeMediaHistory[string], current: readonly RecipeMedia[], edited: Record<string, boolean>): RecipeMediaHistory[string] {
  const currentById = new Map(current.map((slot) => [slot.id, slot]));
  return {
    media: previous.media.map((slot) => ({ ...(currentById.get(slot.id) ?? slot), role: slot.role })),
    edited: Object.fromEntries(previous.media.map((slot) => [slot.id, Boolean(currentById.has(slot.id) ? edited[slot.id] : previous.edited[slot.id])])),
  };
}

/** 组合只记住对象成员；同一对象在其他组合中的新设置同步到历史记录。 */
export function refreshRecipeMediaHistory(history: RecipeMediaHistory, media: readonly RecipeMedia[], edited: Record<string, boolean>): RecipeMediaHistory {
  const current = new Map(media.map((slot) => [slot.id, slot]));
  return Object.fromEntries(Object.entries(history).map(([key, entry]) => [key, {
    media: entry.media.map((slot) => ({ ...(current.get(slot.id) ?? slot) })),
    edited: { ...entry.edited, ...Object.fromEntries(entry.media.filter((slot) => current.has(slot.id)).map((slot) => [slot.id, Boolean(edited[slot.id])])) },
  }]));
}

/** 只替换图片组合；同角色按出现顺序保留用户已经调整的槽位。 */
export function selectRecipeMediaPreset(
  currentMedia: readonly RecipeMedia[],
  presetRoles: readonly RecipeMedia["role"][],
  radius: number,
  reservedIds: readonly string[] = [],
): RecipeMedia[] {
  const usedIds = new Set([...currentMedia.map((media) => media.id), ...reservedIds]);
  const roleIndexes = new Map<RecipeMedia["role"], number>();
  let nextId = 1;
  return createMediaSlots([...presetRoles]).map((slot) => {
    const roleIndex = roleIndexes.get(slot.role) ?? 0;
    roleIndexes.set(slot.role, roleIndex + 1);
    const previous = currentMedia.filter((media) => media.role === slot.role)[roleIndex];
    if (previous) return { ...previous };
    while (usedIds.has(`media-${nextId}`)) nextId += 1;
    const id = `media-${nextId++}`;
    usedIds.add(id);
    return { ...slot, id, borderRadius: slot.role === "logo" || slot.role === "backgroundImage" ? 0 : radius };
  });
}

export function nextCustomMediaName(media: readonly RecipeMedia[]): string {
  const names = new Set(media.map((slot) => slot.name.trim()));
  let index = 1;
  while (names.has(`图片 ${index}`)) index += 1;
  return `图片 ${index}`;
}

export function resolveMediaShapeChange(
  media: RecipeMedia,
  shape: "circle" | "rounded" | "square" | "inherited",
): Partial<RecipeMedia> {
  if (shape === "circle") return { shape: "circle", aspectRatio: 1, freeRatio: false };
  return { shape: "rectangle", borderRadius: shape === "inherited" ? media.borderRadius : shape === "rounded" ? 24 : 0 };
}
