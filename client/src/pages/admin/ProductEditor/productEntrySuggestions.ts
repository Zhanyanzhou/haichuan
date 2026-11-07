import { categoryAliases } from "../ProductManage/productFolderImportInference";

const materialTerms = [
  ["GOLD_9999", "足金9999", /足金\s*9999(?![\d.])/u],
  ["GOLD_999", "足金999", /足金\s*999(?![\d.])/u],
  ["AU750", "18K金", /(?<![\da-z.])(?:18\s*K|AU\s*750)(?![\da-z.])/iu],
  ["PT950", "铂金PT950", /(?<![\da-z.])PT\s*950(?![\da-z.])/iu],
  ["S925", "S925银", /(?<![\da-z.])S\s*925(?![\da-z.])/iu],
] as const;

export const gemOptions = ["钻石", "红宝石", "蓝宝石", "祖母绿", "翡翠", "珍珠", "彩色宝石", "无主石"];
export const craftOptions = ["古法", "花丝", "錾刻", "抛光", "喷砂", "镶嵌", "珐琅", "拉丝"];

type EntryField = "code" | "categoryId" | "materialType" | "gemType" | "craftTechnique" | "size";

export type EntrySuggestion = {
  field: EntryField;
  label: string;
  value: string | number | string[];
  display: string;
  source: "标题" | "文件名";
};

function extractCode(text: string): string | undefined {
  const codes = [...new Set(text.match(/(?<![a-z\d])ATP[-_]?\d+(?:-(?:ENAMEL|SET))?(?![a-z\d-])/gi)
    ?.map((code) => code.toUpperCase()))];
  return codes.length === 1 && codes[0].length <= 50 ? codes[0] : undefined;
}

export function getProductEntrySuggestions(
  name: string,
  filenames: string[],
  categories: { value: number; label: string }[],
): EntrySuggestion[] {
  const title = name.normalize("NFKC").trim();
  const results: EntrySuggestion[] = [];
  const add = (field: EntryField, label: string, value: EntrySuggestion["value"], display: string, source: EntrySuggestion["source"] = "标题") => {
    results.push({ field, label, value, display, source });
  };

  const parentLabels = new Set(categories.map(({ label }) => label.slice(0, Math.max(0, label.lastIndexOf(" / ")))));
  const matches = (source: string) => categories.filter(({ label }) => {
    if (parentLabels.has(label)) return false;
    const leaf = label.split(" / ").pop() ?? label;
    return (categoryAliases[leaf] ?? [leaf]).some((term) => term.length >= 2 && source.includes(term));
  });
  const titleCategories = matches(title);
  const fileCategories = matches(filenames.join(" "));
  const category = (titleCategories.length ? titleCategories : fileCategories);
  const titleCategoryTerms = Object.values(categoryAliases).filter((terms) => terms.some((term) => title.includes(term)));
  if (category.length === 1 && titleCategoryTerms.length <= 1 && !/(?:非|仿|同款|或)/u.test(title)
    && (!fileCategories.length || fileCategories.every(({ value }) => value === category[0].value))) {
    add("categoryId", "类目", category[0].value, category[0].label, titleCategories.length ? "标题" : "文件名");
  }

  const titleCode = extractCode(title);
  const fileCodes = filenames.map(extractCode);
  const fileCode = fileCodes[0];
  const code = titleCode || fileCode;
  if (code && fileCodes.every((item) => item === code || (titleCode && item === undefined))
    && (titleCode || !/ATP[-_]?\d/i.test(title))) {
    add("code", "款号", code, code, titleCode ? "标题" : "文件名");
  }

  if (/(?:非|仿|镀|包金|同款|风格|不含|或|可选|(?:18K(?:金)?|足金|铂金|钻石|红宝石|翡翠|珍珠)色)/iu.test(title)) return results;
  const materials = materialTerms.filter(([, , pattern]) => pattern.test(title));
  if (materials.length === 1) add("materialType", "主要材质", materials[0][0], materials[0][1]);
  const gems = gemOptions.filter((gem) => title.includes(gem));
  if (gems.length === 1) add("gemType", "主石种类", gems[0], gems[0]);
  const crafts = craftOptions.filter((craft) => title.includes(craft));
  if (crafts.length) add("craftTechnique", "制作工艺", crafts, crafts.join("、"));
  const sizes = [...title.matchAll(/(?:圈口\s*\d+(?:\.\d+)?\s*号?|(?:链长|长度)\s*\d+(?:\.\d+)?\s*(?:cm|mm|厘米|毫米))/giu)];
  if (sizes.length === 1 && !/^\s*[-~至到、/＋+]\s*\d/u.test(title.slice(sizes[0].index! + sizes[0][0].length))) {
    add("size", "尺寸/圈口", sizes[0][0].trim(), sizes[0][0].trim());
  }
  return results;
}
