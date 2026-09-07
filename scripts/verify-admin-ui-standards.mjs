import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const monitored = [
  "client/src/constants/adminCopy.ts",
  "client/src/components/common/AdminDataStates.tsx",
  "client/src/components/common/AdminPageHeader.tsx",
  "client/src/components/layout/AdminLayout.tsx",
  "client/src/styles/antdTheme.ts",
  "client/src/styles/adminLuxury.css",
  "client/src/styles/adminDashboard.css",
  "client/src/styles/adminCompatibility.css",
];

function collectAdminFiles(directory, prefix) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${prefix}/${entry.name}`;
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectAdminFiles(absolute, relative);
    return /\.(?:tsx?|css)$/.test(entry.name) ? [relative] : [];
  });
}

// 临时所有权排除：并发任务完成后应删除，不得扩大为永久豁免。
// 页面装修器样式含受保护草稿及历史基线，只排除该单文件；同模块 TSX 仍受检。
const ownershipExclusions = [
  /^client\/src\/pages\/admin\/HomepageConfig\/editor\.css$/,
];
const guardedAdminFiles = collectAdminFiles(
  resolve(root, "client/src/pages/admin"),
  "client/src/pages/admin",
).filter((file) => !ownershipExclusions.some((pattern) => pattern.test(file)));
const guarded = [...new Set([...monitored, ...guardedAdminFiles])];

const sources = new Map(
  guarded.map((file) => [file, readFileSync(resolve(root, file), "utf8")]),
);
const failures = [];

// 页面装修与模板设计的桌面四区是产品级不变量，不是可调主题值。
// 只允许 editor.css 声明一次，防止任一模式用更高特异性覆盖。
const fixedEditorLayout = [
  ["--editor-library-dock-width", 12],
  ["--editor-structure-dock-width", 8],
  ["--editor-inspector-dock-width", 20],
];
const editorLayoutCssFiles = collectAdminFiles(
  resolve(root, "client/src"),
  "client/src",
).filter((file) => file.endsWith(".css"));
const editorLayoutSources = new Map(
  editorLayoutCssFiles.map((file) => [file, readFileSync(resolve(root, file), "utf8")]),
);
const editorLayoutRuleSource = readFileSync(resolve(root, "PROJECT_RULES.md"), "utf8");

for (const [property, ratio] of fixedEditorLayout) {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const declarations = editorLayoutCssFiles.flatMap((file) => (
    [...editorLayoutSources.get(file).matchAll(new RegExp(`${escapedProperty}\\s*:\\s*([^;]+);`, "g"))]
      .map((match) => ({ file, value: match[1].trim() }))
  ));
  if (
    declarations.length !== 1
    || declarations[0].file !== "client/src/pages/admin/HomepageConfig/editor.css"
    || declarations[0].value !== `${ratio}% !important`
  ) {
    failures.push(
      `${property}: 必须仅在 editor.css 声明一次且固定为 ${ratio}% !important（当前 ${JSON.stringify(declarations)}）`,
    );
  }
}

if (fixedEditorLayout.reduce((sum, [, ratio]) => sum + ratio, 0) !== 40) {
  failures.push("桌面编辑器三个 dock 必须合计 40%，为居中画布保留 60%");
}

if (
  !editorLayoutRuleSource.includes(
    "模板组件库 `12%`、图层/结构面板 `8%`、居中画布 `60%`、属性面板 `20%`",
  )
) {
  failures.push("PROJECT_RULES.md: 缺少桌面编辑器 12% / 8% / 60% / 20% 硬规则");
}

if (
  !editorLayoutRuleSource.includes(
    "除非用户再次明确批准修改本条硬规则",
  )
) {
  failures.push("PROJECT_RULES.md: 四区比例硬规则必须保留用户明确批准边界");
}

const rules = {
  loading: {
    pattern: /(?:>|["'`])(?:加载中|正在加载)(?:\.\.\.|…)(?:<|["'`])/g,
    message: "加载文案使用了英文三点或缺少明确对象",
  },
  genericLoadingComponent: {
    pattern: /<AdminLoadingState\s*\/>/g,
    message: "后台加载组件必须显式提供 subject 或 message",
  },
  legacyColor: {
    pattern: /#(?:a58b62|c4a87c|b69052|96918a|96928a|9f9992)\b/gi,
    message: "出现已废弃品牌金或低对比功能文字色",
  },
  directHexTextColor: {
    pattern: /(?<!-)\bcolor\s*(?::\s*(?:["']#|#[0-9a-f])|=\s*["']#)/gi,
    message: "后台文字色必须使用共享语义令牌，不得在页面中直接写十六进制色值",
  },
  genericConfirm: {
    pattern: /okText\s*[:=]\s*["'](?:确认|确定)["']/g,
    message: "危险或业务确认不得使用泛化“确认/确定”",
  },
  smallFont: {
    pattern:
      /font-size:\s*(?:9|10|11)px\b|text-\[(?:9|10|11)px\]|fontSize\s*:\s*(?:9|10|11)\b/g,
    message: "后台功能文字低于 12px",
  },
  unsafeErrorText: {
    pattern:
      /(?:message\.error|set(?:Load|Detail)?Error|content\s*:)\([^;\n]*(?:\?*\.message|response\?*\.data\?*\.message)/g,
    message: "用户可见错误不得直接透传异常正文",
  },
  functionalSerif: {
    pattern: /\b(?:font-display|font-serif)\b/g,
    message: "后台事实与操作文字不得使用前台展示衬线类",
  },
  functionalSerifFamily: {
    pattern: /fontFamily\s*:\s*["'`][^\n]*?(?:(?<!sans-)serif|Garamond|Georgia)/gi,
    message: "后台事实与操作文字不得使用衬线字体栈",
  },
  genericFeedback: {
    pattern:
      /message\.(?:success|error|warning|info)\(["'](?:操作成功|操作失败|保存成功|保存失败|更新成功|更新失败|删除成功|删除失败|添加成功|添加失败|加载失败)["']\)/g,
    message: "反馈必须说明对象，并在失败时提供下一步",
  },
};

// 已迁移受控页面不再保留历史数量白名单；确有装饰例外时必须写明文件与理由。
const legacyBaseline = {};

function check(file, pattern, message) {
  const source = sources.get(file);
  if (pattern.test(source)) failures.push(`${file}: ${message}`);
}

for (const file of guarded) {
  const source = sources.get(file);
  for (const [ruleName, rule] of Object.entries(rules)) {
    const actual = [...source.matchAll(rule.pattern)].length;
    const allowed = legacyBaseline[file]?.[ruleName] ?? 0;
    if (actual !== allowed) {
      const direction = actual > allowed ? "新增违规" : "基线已减少，请下调白名单";
      failures.push(
        `${file}: ${rule.message}（当前 ${actual}，允许 ${allowed}；${direction}）`,
      );
    }
  }
}

check(
  "client/src/constants/adminCopy.ts",
  /\bconfirm\s*:\s*["']确认["']|actions\.confirm/,
  "共享词源不得提供泛化“确认”动作",
);
check(
  "client/src/styles/adminLuxury.css",
  /font-size:\s*(?:9|10|11)px\b/,
  "共享后台样式存在低于 12px 的功能文字",
);
check(
  "client/src/styles/adminLuxury.css",
  /outline:\s*1px\b/,
  "共享后台样式存在 1px 焦点线",
);
check(
  "client/src/pages/admin/ProductManage/ProductManage.css",
  /#[0-9a-f]{3,8}\b/i,
  "已迁移商品管理样式不得重新定义后台调色板",
);

if (
  !/\.admin-shell-v7\s+\.ant-tag\s*\{[^}]*font-size:\s*12px[^}]*letter-spacing:\s*0/s.test(
    sources.get("client/src/styles/adminLuxury.css"),
  )
) {
  failures.push(
    "client/src/styles/adminLuxury.css: 后台状态标签必须覆盖前台全局 10px 与装饰字距",
  );
}

if (
  !/\.admin-shell-v7\s+\.text-brand-gold\s*\{[^}]*color:\s*var\(--adm-action\)\s*!important/s.test(
    sources.get("client/src/styles/adminLuxury.css"),
  )
) {
  failures.push(
    "client/src/styles/adminLuxury.css: 后台历史品牌金文字类必须映射到高对比交互色",
  );
}

for (const [selector, token] of [
  ["text-brand-text", "--adm-ink"],
  ["text-brand-muted", "--adm-muted"],
  ["text-green-500", "--adm-success"],
  ["text-orange-500", "--adm-warning"],
  ["text-red-400", "--adm-error"],
]) {
  const pattern = new RegExp(
    `\\.admin-shell-v7\\s+\\.${selector}[^\\{]*\\{[^}]*color:\\s*var\\(${token}\\)\\s*!important`,
    "s",
  );
  if (!pattern.test(sources.get("client/src/styles/adminLuxury.css"))) {
    failures.push(
      `client/src/styles/adminLuxury.css: ${selector} 必须映射到 ${token}`,
    );
  }
}

for (const semanticToken of [
  "--adm-success",
  "--adm-success-bg",
  "--adm-success-border",
  "--adm-warning",
  "--adm-warning-bg",
  "--adm-warning-border",
  "--adm-error",
  "--adm-error-bg",
  "--adm-error-border",
  "--adm-info",
  "--adm-info-bg",
  "--adm-info-border",
  "--adm-neutral-bg",
  "--adm-neutral-border",
]) {
  if (!sources.get("client/src/styles/adminLuxury.css").includes(semanticToken)) {
    failures.push(
      `client/src/styles/adminLuxury.css: 缺少状态文字语义令牌 ${semanticToken}`,
    );
  }
}

const cssWithoutBrandWordmark = sources
  .get("client/src/styles/adminLuxury.css")
  .replace(/\.admin-header__brand\s*\{[^}]*\}/s, "");
if (
  /font-family:[^;}]*?(?:[\s,"]serif(?:[\s;}]|$)|Garamond|Georgia)/i.test(
    cssWithoutBrandWordmark,
  )
) {
  failures.push(
    "client/src/styles/adminLuxury.css: 除纯品牌标识外，后台功能排版不得使用衬线字体",
  );
}

if (failures.length > 0) {
  console.error("管理后台中文与排版规范检查失败：");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`管理后台中文与排版规范检查通过（${guarded.length} 个受控文件）。`);
