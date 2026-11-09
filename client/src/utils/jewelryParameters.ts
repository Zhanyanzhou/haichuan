import type { CategoryPublicationRule, MaterialType } from "@/types";

/** 写在 gemInfo.measurements 里的可选尺寸。键名固定，前台只展示已填写的项。 */
export const JEWELRY_MEASUREMENT_LABELS: Record<string, string> = {
  bandWidth: "戒臂宽度",
  bandThickness: "戒臂厚度",
  setting: "镶嵌方式",
  chainLength: "链长",
  pendantSize: "吊坠尺寸",
  chainMaterial: "链条材质",
  claspMaterial: "扣头材质",
  earringSize: "耳饰尺寸",
  earringPair: "单只或一对",
  postMaterial: "耳针材质",
  closureType: "耳扣类型",
  bangleWidth: "条宽",
  bangleThickness: "条厚",
  innerDiameter: "佩戴内径",
  pearlDiameter: "珍珠直径",
  pearlLuster: "光泽",
  pearlSurface: "表面瑕疵",
  pearlShape: "珍珠形状",
  jadeTexture: "种水",
};

export type JewelryMeasurementField = {
  key: string;
  label: string;
  placeholder: string;
};

export type JewelryProfile = {
  showGem: boolean;
  showDiamondGrading: boolean;
  showPearlNotes: boolean;
  showJadeNotes: boolean;
  measurements: JewelryMeasurementField[];
};

const PRECIOUS = new Set<MaterialType>(["GOLD_999", "GOLD_9999", "AU750", "PT950", "S925"]);
const GEM_RULES = new Set<CategoryPublicationRule>(["GEMSTONE", "GEM_DISCLOSURE", "GEM_CARAT", "GEM_GRADING"]);

function leafName(categoryLabel?: string): string {
  const label = categoryLabel?.replace(/（仅分组）$/u, "").trim() || "";
  return label.split(" / ").pop()?.trim() || label;
}

function pushMeasurement(
  fields: JewelryMeasurementField[],
  seen: Set<string>,
  key: string,
  placeholder: string,
) {
  if (seen.has(key) || !(key in JEWELRY_MEASUREMENT_LABELS)) return;
  seen.add(key);
  fields.push({ key, label: JEWELRY_MEASUREMENT_LABELS[key], placeholder });
}

export function describeJewelry(input: {
  categoryLabel?: string;
  rules?: CategoryPublicationRule[] | null;
  materialType?: MaterialType | null;
  gemType?: string | null;
}): JewelryProfile {
  const rules = input.rules ?? [];
  const leaf = leafName(input.categoryLabel);
  const gemType = input.gemType?.trim() || "";
  const material = input.materialType;
  const pearl = material === "PEARL" || gemType === "珍珠" || /珍珠/u.test(leaf);
  const jade = material === "JADE" || /翡翠|和田玉/.test(gemType) || /翡翠|和田玉|玉石|玉镯/u.test(leaf);
  const diamond = gemType === "钻石" || material === "DIAMOND" || /钻石|钻戒/u.test(leaf);
  const coloredGem = material === "COLOR_GEM" || /红宝石|蓝宝石|祖母绿|彩色宝石|宝石/u.test(`${leaf}${gemType}`);
  const showGem = rules.some((rule) => GEM_RULES.has(rule)) || pearl || jade || diamond || coloredGem || (gemType !== "" && gemType !== "无主石");
  const showDiamondGrading = rules.includes("GEM_GRADING") || (diamond && !pearl && !jade);
  const fields: JewelryMeasurementField[] = [];
  const seen = new Set<string>();
  if (rules.includes("RING_SIZE") || /戒/u.test(leaf)) {
    pushMeasurement(fields, seen, "bandWidth", "如：2.2 mm");
    pushMeasurement(fields, seen, "bandThickness", "如：1.6 mm");
    pushMeasurement(fields, seen, "setting", "如：爪镶、包镶");
  }
  if (rules.includes("CHAIN_LENGTH") || /项链|吊坠|锁骨链/u.test(leaf)) {
    pushMeasurement(fields, seen, "chainLength", "如：40–45 cm");
    pushMeasurement(fields, seen, "pendantSize", "如：18 × 12 mm");
    pushMeasurement(fields, seen, "chainMaterial", "如：与主体相同");
    pushMeasurement(fields, seen, "claspMaterial", "如：Au750");
  }
  if (/耳钉|耳饰|耳环|耳坠|耳扣/u.test(leaf)) {
    pushMeasurement(fields, seen, "earringSize", "如：8 mm");
    pushMeasurement(fields, seen, "earringPair", "一对，或单只");
    pushMeasurement(fields, seen, "postMaterial", "如：Au750");
    pushMeasurement(fields, seen, "closureType", "如：耳针、耳圈、耳夹");
  }
  if (rules.includes("INNER_DIAMETER") || /手镯|手串/u.test(leaf)) {
    pushMeasurement(fields, seen, "innerDiameter", "如：56 mm");
    pushMeasurement(fields, seen, "bangleWidth", "如：8 mm");
    pushMeasurement(fields, seen, "bangleThickness", "如：3 mm");
  }
  if (pearl) {
    pushMeasurement(fields, seen, "pearlDiameter", "如：8–9 mm");
    pushMeasurement(fields, seen, "pearlLuster", "如：强光");
    pushMeasurement(fields, seen, "pearlSurface", "如：少瑕");
    pushMeasurement(fields, seen, "pearlShape", "如：正圆");
  }
  if (jade) {
    pushMeasurement(fields, seen, "jadeTexture", "如：冰种");
  }
  return {
    showGem,
    showDiamondGrading,
    showPearlNotes: pearl,
    showJadeNotes: jade,
    measurements: fields,
  };
}

export function readJewelryMeasurements(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string" || !(key in JEWELRY_MEASUREMENT_LABELS)) continue;
    const text = item.trim();
    if (text) result[key] = text;
  }
  return result;
}

export function jewelryMeasurementFacts(value: unknown): Array<{ label: string; value: string }> {
  return Object.entries(readJewelryMeasurements(value)).map(([key, text]) => ({
    label: JEWELRY_MEASUREMENT_LABELS[key],
    value: text,
  }));
}

export function isPreciousMetal(value: MaterialType | null | undefined): boolean {
  return value != null && PRECIOUS.has(value);
}
