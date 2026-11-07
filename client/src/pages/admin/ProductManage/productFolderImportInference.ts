const variantCodes: Record<string, string> = {
  珐琅款: "ENAMEL",
  珐琅: "ENAMEL",
  镶嵌: "SET",
  镶嵌款: "SET",
};

export const categoryAliases: Record<string, string[]> = {
  吊坠: ["吊坠", "挂坠", "坠饰"],
  项链: ["项链", "颈链"],
  戒指: ["戒指", "指环", "戒圈"],
  手链: ["手链", "手串", "腕链"],
  手镯: ["手镯", "镯子"],
  耳饰: ["耳饰", "耳环", "耳钉", "耳坠"],
  胸针: ["胸针"],
  摆件: ["摆件"],
};

export type FolderCategoryOption = { label: string; value: number };

export type FolderCategoryInference = {
  categoryId: number;
  categoryLabel: string;
  keyword: string;
  matchedRows: number;
  totalRows: number;
};

type FolderCategorySourceRow = {
  title: string;
  key: string;
  selected: boolean;
  id?: number;
  images: { path: string }[];
};

function normalizeLooseText(value: string) {
  return value.toLocaleLowerCase("zh-CN").replace(/[^\p{L}\p{N}]+/gu, "");
}

function includesLooseText(source: string, target: string) {
  const normalizedSource = normalizeLooseText(source);
  const normalizedTarget = normalizeLooseText(target);
  return normalizedTarget.length >= 2 && normalizedSource.includes(normalizedTarget);
}

function cleanSeriesSubject(series: string, code: string) {
  const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let subject = series.replace(new RegExp("^" + escapedCode + "[\\s._–—-]*", "iu"), "").trim();
  const bracketPairs: [string, string][] = [["（", "）"], ["(", ")"], ["【", "】"], ["[", "]"]];
  let changed = true;
  while (changed && subject.length > 1) {
    changed = false;
    for (const [open, close] of bracketPairs) {
      if (subject.startsWith(open) && subject.endsWith(close)) {
        subject = subject.slice(open.length, -close.length).trim();
        changed = true;
        break;
      }
    }
  }
  return subject;
}

export function deriveFolderProductIdentity(series: string, code: string, variant: string) {
  const rootSubject = cleanSeriesSubject(series, code);
  const sameDescription = rootSubject && variant
    ? includesLooseText(rootSubject, variant) || includesLooseText(variant, rootSubject)
    : false;
  const knownVariant = variantCodes[variant];
  // 描述性文件名用于商品标题，不得整段写进稳定款号；只有受控款式词生成款号后缀。
  const suffix = knownVariant ? variant : "";
  const subject = rootSubject
    ? rootSubject + (variant && !sameDescription ? "（" + variant + "）" : "")
    : variant;
  return {
    key: suffix ? code + "/" + suffix : code,
    code: suffix ? code + "-" + knownVariant : code,
    title: subject ? subject + " " + code : code,
  };
}

export function inferFolderCategory(
  rows: FolderCategorySourceRow[],
  categories: FolderCategoryOption[],
): FolderCategoryInference | undefined {
  const selectedRows = rows.filter((row) => row.selected || row.id);
  if (!selectedRows.length || !categories.length) return undefined;

  const candidates = categories.map((category) => {
    const categoryParts = category.label.split("/");
    const leaf = categoryParts[categoryParts.length - 1]?.trim() || category.label.trim();
    const aliases = categoryAliases[leaf] ?? (Array.from(leaf).length >= 2 ? [leaf] : []);
    const matches = selectedRows.map((row) => {
      const source = [row.title, row.key, ...row.images.map((image) => image.path)].join(" ");
      return aliases.find((alias) => includesLooseText(source, alias));
    });
    const matchedKeywords = matches.filter((keyword): keyword is string => !!keyword);
    return {
      category,
      matchedRows: matchedKeywords.length,
      keyword: matchedKeywords.sort((a, b) => b.length - a.length)[0] ?? "",
      depth: categoryParts.length,
    };
  }).filter((candidate) => candidate.matchedRows > 0)
    .sort((a, b) => b.matchedRows - a.matchedRows
      || b.keyword.length - a.keyword.length
      || b.depth - a.depth
      || a.category.label.localeCompare(b.category.label, "zh-CN"));

  const best = candidates[0];
  if (!best || best.matchedRows !== selectedRows.length) return undefined;
  const second = candidates[1];
  if (second && second.matchedRows === best.matchedRows && second.keyword.length === best.keyword.length
    && second.depth === best.depth) return undefined;
  return {
    categoryId: best.category.value,
    categoryLabel: best.category.label,
    keyword: best.keyword,
    matchedRows: best.matchedRows,
    totalRows: selectedRows.length,
  };
}
