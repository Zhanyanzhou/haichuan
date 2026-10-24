import { expect, test, type Page } from "@playwright/test";

/**
 * 首发七母版的验收（`docs/page-builder/launch-template-set.md` 第 7 节）。
 *
 * 这一份只做第 7.1 节里**能在一张真实页面上量出来**的部分：六视口几何、媒体真实像素、
 * 极端文案、无障碍语义、失败降级、视觉档位，以及第 7.2 节的跨块结论。
 * `PB-TPL-002`（生成 → 保存草稿 → 发布独立版本 → 旧版本不改写）要在真实保存发布链路上做，
 * 属于 `scripts/run-store-decoration-real-closure-qa.ps1` 那条线，不在这里用界面代替。
 *
 * 渲染走的是公开 Renderer 本身（`DynamicTemplateRenderer`），不是缩略图或编辑器预览：
 * 第 7 节要求"两层都要在真实浏览器上做，不能只用类型检查或单元测试代替"。
 */

const ROLES = [
  "page-hero",
  "collection-story",
  "editorial-split",
  "craft-detail",
  "creation-grid",
  "maison-fact",
  "service-invitation",
] as const;

/** `responsive.ts`：母版 schemaVersion 为 3，因此 `width <= 767` 即手机端。 */
const VIEWPORTS = [390, 768, 1024, 1280, 1440, 1920] as const;
const DEVICE_FOR = (width: number) => (width <= 767 ? "mobile" : "desktop");

const FIXTURE_PATH = "/__launch-masters";
/** 极端文案另起一条路径：`page.route` 的 glob 匹配完整 URL，查询串要靠第二条路由，不如直接分路径。 */
const FIXTURE_STRESS_PATH = "/__launch-masters-stress";
/**
 * 第三种载荷：只把标题换成"长中文主标题"，副标题与行动照压力文案。
 *
 * `launch-template-set.md` 第 7 节把"桌面长中文主标题 + 副标题在 1440×900 下不裁切、不溢出"
 * 点名为**固定画幅唯一的风险点、必须有兜底**，所以它值得一条自己的载荷与一条自己的断言，
 * 而不是混在 `stress` 里——`stress` 往每个文字槽位灌 215 字，量出来的是"荒谬输入"的上界，
 * 掩盖了"真实长标题"这条线到底过不过。
 */
const FIXTURE_LONG_TITLE_PATH = "/__launch-masters-long-title";
type FixtureVariant = "normal" | "stress" | "longTitle";
const FIXTURE_PATHS: Record<FixtureVariant, string> = {
  normal: FIXTURE_PATH,
  stress: FIXTURE_STRESS_PATH,
  longTitle: FIXTURE_LONG_TITLE_PATH,
};
/**
 * 第三条路径：**六页真实配方**（`launch-template-set.md` 第 4 节）。
 *
 * 第 7.2 节那五条判的都是跨块结论——"没有两块被做成同一块""每页只有一个主要行动"
 * "相邻两节不重复""手机竖幅只给首屏""推进不分叉"——单看一块量不出来，
 * 必须先把六张公开页按配方拼出来。这一面用 `div[data-page]` 而不是 `section`/`main`：
 * 一份文档里出现多个 `main`、或嵌套 `main`，都是非法结构，会以"语义错误"的形态
 * 污染第 7.2-A 条那条"不生成页眉/页脚/主导航"的扫描。
 */
const FIXTURE_PAGES_PATH = "/__launch-masters-pages";
/**
 * 第四条路径：**反事实探针**，只服务第 7.2-D 条那半句"手机竖幅只给首屏"。
 *
 * 同一块 M1 在同一页上渲染两遍：一遍原样（`as-shipped`），一遍就地给通栏背景槽写上
 * `mobileRules.aspectRatio = "4:5"`（`declared-4x5`）。后者与母版里写
 * `mobileRatio: "4:5"` 精确等价——`DynamicTemplateInstanceInspector.tsx:439` 说明
 * 槽位规则就是按视口二选一，`generateTemplateFromRecipe.ts:204-205` 也是这么生成的。
 * 两遍并排量出来的是"只改母版会发生什么"，再与"母版 + 渲染器一起改"对照，
 * 第 7.2-D 条那条正半句该由谁来满足才有实测依据，而不是靠读代码推断。
 */
const FIXTURE_PROBE_PATH = "/__launch-masters-mobile-probe";

/**
 * 第 4 节的六页真实配方，逐字抄录（`launch-template-set.md:317-322`）。
 *
 * `focus` 是主焦点所在角色，`action` 是主要行动落点。两处例外保持原文语义：
 *   · `/catalog` 的主焦点与主要行动都在**固定业务区**（选款中心本体），不在装修区块里，
 *     所以两个字段都是 `null`——断言不是"跳过这一页"，而是"这一页的装修区块里
 *     一个行动都不许有"。
 *   · `/about` 的主要行动落点是 **M3 的次级链接**，不是按钮：这一页没有主按钮。
 */
interface PageRecipe {
  page: string;
  path: string;
  roles: readonly string[];
  focus: string | null;
  action: { role: string; kind: "button" | "link" } | null;
}

const PAGE_RECIPES: readonly PageRecipe[] = [
  { page: "home", path: "/", roles: ["page-hero", "collection-story", "craft-detail", "creation-grid"], focus: "page-hero", action: { role: "page-hero", kind: "button" } },
  { page: "products", path: "/products", roles: ["page-hero", "collection-story", "creation-grid"], focus: "collection-story", action: { role: "page-hero", kind: "button" } },
  { page: "catalog", path: "/catalog", roles: ["page-hero"], focus: null, action: null },
  { page: "custom", path: "/custom", roles: ["editorial-split", "craft-detail", "service-invitation"], focus: "editorial-split", action: { role: "service-invitation", kind: "button" } },
  { page: "about", path: "/about", roles: ["editorial-split", "craft-detail", "maison-fact"], focus: "editorial-split", action: { role: "editorial-split", kind: "link" } },
  { page: "contact", path: "/contact", roles: ["service-invitation", "editorial-split"], focus: "service-invitation", action: { role: "service-invitation", kind: "button" } },
];

/**
 * 第 3.1 节的三种过渡，按第 1 节的表逐行抄录（`launch-template-set.md:27-35`）。
 * 第 7.2-E 条要求"七角色与三种过渡的对应关系与本文第 1 节的表逐行一致"，
 * 所以这张表必须在测试里独立写一遍——从被测代码里读出来再比对是同义反复。
 * 第四种 `stacked` 是文档对 M6/M7 的"随内容增长的上图下文"，几何上与 M1 的全幅主视觉
 * 必须分得开：前者媒体不铺满、文字在图下方，后者媒体铺满、文字叠在图上。
 */
const ROLE_TRANSITION: Record<string, "full-bleed-hero" | "split" | "card-grid" | "stacked"> = {
  "page-hero": "full-bleed-hero",
  "collection-story": "split",
  "editorial-split": "split",
  "craft-detail": "split",
  "creation-grid": "card-grid",
  "maison-fact": "stacked",
  "service-invitation": "stacked",
};

/**
 * 不变量 G（`launch-template-set.md:57`）点名禁止的营销语料。
 *
 * 扫描的是**渲染出来的可见文字**，不是定义里的键名：文档禁的是"页面上出现这些字",
 * 而键名里出现 `price` 只是命名习惯。同一条不变量还禁了"烤进图片里的英文标题"与
 * "系统示例"——前者夹具图片里没有任何文字（`mediaBody` 只画灰底与圆），
 * 后者由"行动文案必须逐字等于夹具给的那一句"在 7.2-B 里正面验掉。
 */
const PROMO_LEXICON = ["价格", "库存", "加购", "加入购物车", "倒计时", "限时", "最后一件", "折扣", "原价", "立即购买", "抢购", "秒杀", "优惠", "包邮", "定金", "尾款", "促销"];

/**
 * 不变量 A（`launch-template-set.md:51`）点名禁生成的站点级结构。
 * 七块只承担一节内容，页眉、页脚、主导航、搜索、购物车、结算、Cookie 同意、语言切换
 * 都不在它们的职责里——这些一旦从母版里长出来，公开页就会出现两套导航。
 */
const SITE_SHELL_SELECTORS = ["header", "footer", "nav", "[role='navigation']", "form", "input", "select", "textarea"];
/**
 * §3 把 M1 点名为七块里**唯一一处固定画幅**（桌面根 16:9、`layoutMode: "free"`）。
 * 一旦某块画的根盒不随内容长高、内容又装不下，"元素全在画布内"与"不裁切必要内容"
 * 就互相排斥——此时向下溢出会推走主行动，横向溢出会撑出滚动条，
 * 只剩向上溢出这一条不丢内容、不动构图的路。下面只对这份名单放行向上溢出。
 * 新增固定画幅母版时必须同步这里，否则它会以"出界"的形式挡下来——这正是想要的效果。
 */
const FIXED_CANVAS_ROLES: readonly string[] = ["page-hero"];
/**
 * 图片走真实的 `/uploads/` 派生路径（`responsiveUploadsImage.ts` 只对这一种地址生成 srcset），
 * 于是"两种设备都加载到真实像素"这句话里"派生候选按设备挑"那一半也一并被验到。
 * 夹具图不是 jpg，但地址必须是 jpg 才会被派生器接受；路由按请求的 `width` 现裁一张同宽 SVG。
 */
const FIXTURE_IMAGE_SRC = "/uploads/launch-acceptance.jpg";
const FIXTURE_IMAGE_ROUTE = /\/uploads\/launch-acceptance\.jpg(?:\?|$)/;
const DERIVED_IMAGE_WIDTHS = [480, 800, 1200, 1680] as const;

/**
 * `PB-VISUAL-001` 的三张白名单。
 *
 * 色值逐字取自 `docs/UI_GUIDE.md` 第 4.1 节的共享色彩底盘：主画布/表面 `#FFFFFF`、
 * 次级画布 `#F4F5F5`、主文字/主操作 `#181A1B`、次级文字 `#5F6568`、最低功能文字 `#6E7477`、
 * 分隔线 `#DDE1E2`、强分隔线 `#B8BEC1`、深色画布 `#111315`、反色文字 `#F7F8F8`。
 * 九色写全而不是只写母版用到的那几个：漏掉哪一个，它被用上时都会报成"违规"，
 * 于是"这一版母版选了什么"和"底盘允许什么"两件事就分不开了。
 */
const UI_GUIDE_PALETTE = new Set([
  "#ffffff", "#f4f5f5", "#181a1b", "#5f6568", "#6e7477", "#dde1e2", "#b8bec1", "#111315", "#f7f8f8",
]);
/** `template-creation-rules.md` 第 7.3 节圆角档位：无/小/中/大/超大 = 0/8/16/24/32。 */
const RADIUS_STEPS = new Set([0, 8, 16, 24, 32]);
/** 第 7.3 节间距档位：基础 12/16/24/32 与区域 24/32/48/64 的并集；0 表示没有间距。 */
const GAP_STEPS = new Set([0, 12, 16, 24, 32, 48, 64]);

/**
 * `typographyScale.ts:11-26` 的桌面档位：display 68 / h1 34 / h2 24 / subtitle 18 /
 * body 15 / caption 12 / price 36。压力文案下字号必须还是这一套——`PB-A11Y-001` 那句
 * 「长文换行，不靠过度缩小或隐藏通过」说的就是这件事：字号悄悄降一档，几何断言会全绿，
 * 而页面已经不是被验收的那一版了。
 */
const DESKTOP_TYPE_STEPS = new Set([68, 34, 24, 18, 15, 12, 36]);

/**
 * Chrome 的 computed color 一律报成 `rgb()`/`rgba()`，比色前先归一成小写十六进制。
 * 全透明化简成 `transparent` 交给调用方跳过——"没有背景"不是一种颜色。
 */
function toHex(value: string): string | null {
  const match = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/.exec(value.trim());
  if (!match) return null;
  if (match[4] !== undefined && Number(match[4]) === 0) return "transparent";
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
}

function mediaBody(width: number): string {
  const height = Math.round(width * 1.25);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#e4e6e8"/><circle cx="${width / 2}" cy="${height * 0.6}" r="${width * 0.18}" fill="#c2c7cb"/></svg>`;
}

async function routeMedia(page: Page, missing = false) {
  await page.route(FIXTURE_IMAGE_ROUTE, (route) => {
    if (missing) {
      route.fulfill({ status: 404, contentType: "text/plain", body: "missing" });
      return;
    }
    const requested = Number(new URL(route.request().url()).searchParams.get("width") ?? "");
    route.fulfill({
      contentType: "image/svg+xml",
      body: mediaBody(DERIVED_IMAGE_WIDTHS.includes(requested as (typeof DERIVED_IMAGE_WIDTHS)[number]) ? requested : 1200),
    });
  });
}

/**
 * 长中文 + 长英文各一段：`PB-RESP-003` 要求"超长中文与超长英文都不裁切必要内容"。
 * 两份文案都写进同一个槽位，中文考验断行，英文考验长单词不撑破容器。
 *
 * **这段是 TS 的模板字面量，里面每一处反引号都必须写成 `\``。** 写生的会把字符串
 * 提前截断，报出来的是 `Missing semicolon` 而不是"反引号没转义"，很难一眼看回去。
 * 唯一的 `${...}` 是故意留给 `FIXTURE_IMAGE_SRC` 的插值。
 */
const FIXTURE_SCRIPT = `
  const LONG_CN = "海川珠宝工坊以手工镶嵌与可追溯的宝石来源为立身之本，每一件作品都在自有工坊完成设计、起版、镶嵌与抛光，并在交付前由镶嵌师本人复核爪位与镶口。";
  const LONG_EN = "Handcrafted in our own atelier, where every stone is traced back to the source and every setting is finished by hand before it leaves the bench.";
  const SHORT_CN = "海川工坊";
  const ACTION = { normal: "预约到店", stress: "预约到店看实物并当面确认镶嵌工艺与宝石证书" };
  const LINK = { normal: "了解更多", stress: "查看这一系列的完整工艺说明与保养建议" };
  // 30 个汉字。1440 下 display 标题约 15 字一行，因此它是"2 行"——正是文档点名的
  // "长中文主标题"的量级；再长就该由 stress 变体去覆盖了。
  const LONG_TITLE = "海川珠宝工坊以手工镶嵌为立身之本，每一件作品都在自有工坊完成";

  /** 槽位 → 夹具发出的替代文本，供 \`PB-A11Y-001\` 逐字比对。 */
  const alts = {};

  /**
   * 槽位 → 夹具写进行动槽的那句话，供第 7.2-B 条逐字比对。
   * 期望值由夹具自己记录，而不是在测试里把 \`ACTION\`/\`LINK\` 再抄一遍：
   * 抄一遍就多一处会各自漂移的副本，而且抄错时测试会以"文案不符"的样子报出来，
   * 看不出是抄错了还是渲染真的改了字。
   */
  const expectedLabels = {};

  /**
   * \`tag\` 只有"六页配方"那一面传（值是角色名）。原因在第 7.2-C 条：
   * 六块母版的骨架里都带次级链接，六页拼起来会出现十几处同文案的行动，
   * 于是"相邻两节不重复同一句主要行动"会因为夹具自己灌了同一句话而永远红。
   * 母版不携带默认内容（见 \`launchTemplateSet.ts\` 顶部说明），这条规则在结构层
   * 本就无可验之处；能验的是"夹具自身合规"加"渲染原样透传"。把角色名打进文案，
   * 两件事就都可验了。角色面不传 \`tag\`，行为逐字不变。
   */
  function fill(definition, variant, tag) {
    const stress = variant !== "normal";
    const longTitle = variant === "longTitle";
    const suffix = tag ? "（" + tag + "）" : "";
    for (const slot of Object.values(definition.slots)) {
      // 替代文本照真实页面写（母版不携带默认内容，见 \`launchTemplateSet.ts\` 顶部说明），
      // 同时留下可逐字比对的期望值：\`PB-A11Y-001\` 要证明的是实例文案原样到达 DOM，
      // 而不是被文件名或槽位键顶替。
      if (slot.type === "image") { const alt = "海川珠宝 " + (slot.label || slot.key); alts[slot.slotId] = alt; definition.defaultContent[slot.slotId] = { src: "${FIXTURE_IMAGE_SRC}", alt }; continue; }
      // 行动槽的 \`targetType\` 不是装饰：\`DynamicTemplateRenderer.tsx:365-388\` 只认
      // \`targetType === "page"\` 加一条本站绝对 \`pagePath\` 才算得出 \`href\`，否则退回
      // \`{ label }\`，元素不是链接、不可聚焦——整页可聚焦元素会变成 0，
      // 而"键盘可达"那一条会以"一个可聚焦元素都没有"的样子报出来，看不出是内容缺字段。
      if (slot.type === "button") { const label = ACTION[stress ? "stress" : "normal"] + suffix; expectedLabels[slot.slotId] = label; definition.defaultContent[slot.slotId] = { label, targetType: "page", pagePath: "/contact" }; continue; }
      if (slot.type === "link") { const label = LINK[stress ? "stress" : "normal"] + suffix; expectedLabels[slot.slotId] = label; definition.defaultContent[slot.slotId] = { label, targetType: "page", pagePath: "/products" }; continue; }
      if (slot.type === "richText") { definition.defaultContent[slot.slotId] = stress ? "1. 起版\\n2. " + LONG_CN + "\\n3. 镶嵌\\n4. " + LONG_EN : "1. 起版\\n2. 镶嵌"; continue; }
      if (longTitle && slot.type === "heading") { definition.defaultContent[slot.slotId] = LONG_TITLE; continue; }
      definition.defaultContent[slot.slotId] = stress ? LONG_CN + " " + LONG_EN : SHORT_CN;
    }
    return definition;
  }
`;

/**
 * 三个渲染面共用一份 `fixtureHtml`，只有 `surface` 与初始渲染不同（见 `FIXTURE_SCRIPT` 尾部）。
 * `roles` 是第 7.1 节那六条用的七块并排面，`pages` 与 `probe` 是第 7.2 节新增的两个面。
 */
function fixtureHtml(variant: FixtureVariant, surface: "roles" | "pages" | "probe" = "roles"): string {
  return `<!doctype html><html><head><meta charset="utf-8">
  <script type="module">
    import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;
  </script>
  <style>
    body { margin: 0; background: #ffffff; }
    main { display: block; }
    section[data-role] { display: block; }
    /*
     * 六页面六页共用一份文档，页与页之间画一条分隔线：不为好看，是为了让
     * \`getBoundingClientRect\` 量出来的 y 不会跨页粘连——第 7.2-C 条要判"相邻两节"，
     * 判的是**同一页内**的相邻，跨页的上一页末节与下一页首节必须一眼分得开。
     */
    div[data-page] { display: block; border-top: 1px solid #dde1e2; }
  </style></head>
  <body><main id="fixture"></main><script type="module">
    import React from '/node_modules/.vite/deps/react.js';
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import '/src/styles/globals.css';
    import DynamicTemplateRenderer from '/src/page-builder/template-definition/DynamicTemplateRenderer.tsx';
    import { instantiateLaunchTemplateMaster } from '/src/page-builder/template-creation/launchTemplateSet.ts';
    ${FIXTURE_SCRIPT}
    const variant = '${variant}';
    const device = innerWidth <= 767 ? 'mobile' : 'desktop';
    const roles = ${JSON.stringify(ROLES)};
    // 母版自己声明的行数上限（slot.rules.maxLines）。测试侧拿它当白名单：
    // 页面上出现任何一处没被声明的行数上限，都说明有东西在偷偷截断内容。
    const clamps = {};
    /**
     * 槽位 → 母版自己声明的内容类型。\`PB-A11Y-001\` 要靠它认出"哪些槽位是标题、
     * 哪些是行动"，而不是从槽位键名去猜——\`_action\`/\`_link\` 这类后缀是命名习惯，不是契约。
     */
    const kinds = {};
    /**
     * 发牌函数：把"这一次渲染怎么给内容"独立出来，\`PB-FAIL-001\` 才能在同一个页面上
     * 隐藏、删空、再恢复同一个槽位，并比较前后的几何。
     */
    function build(options) {
      const hiddenSlotIds = options.hiddenSlotIds || [];
      const emptiedSlotIds = options.emptiedSlotIds || [];
      return roles.map((role, index) => {
        const definition = fill(instantiateLaunchTemplateMaster(role, 'tpl_acc_' + role.replace(/-/g, '_')), variant);
        for (const slot of Object.values(definition.slots)) {
          if (slot.rules && slot.rules.maxLines) clamps[slot.slotId] = String(slot.rules.maxLines);
          kinds[slot.slotId] = slot.type;
        }
        const contentBySlotId = { ...definition.defaultContent };
        for (const slotId of emptiedSlotIds) delete contentBySlotId[slotId];
        return React.createElement('section', { key: role, 'data-role': role },
          React.createElement(DynamicTemplateRenderer, {
            definition,
            device,
            mode: 'public',
            contentBySlotId,
            hiddenSlotIds,
            /**
             * 公开页只把**首个可渲染主舞台**的标题抬成 h1，其余一律 h2
             * （\`PuckDocumentRenderer.tsx:373-385\`；没有主舞台时由视觉隐藏的 h1 兜底，见 \`:441\`）。
             * 夹具按同一条规则发牌：M1 是第一块且标题有内容，因此它拿 h1、其余拿 h2，
             * 整页恰好一个 h1。七块全按 h2 渲染不是真实页面的样子，会让标题层级无从验收。
             */
            primaryHeadingLevel: index === 0 ? 1 : 2,
          }));
      });
    }
    /**
     * 六页配方面的槽位登记表：\`pageKinds\` 是内容类型、\`pageMeta\` 是母版自己声明的
     * 键与语义角色。测试侧一律查这两张表，不从 \`data-template-slot-id\` 的拼写去猜
     * 哪一段是标题、哪一段是行动——那是命名习惯，不是契约。
     */
    const pageKinds = {};
    const pageMeta = {};
    /** 探针面：M1 通栏背景槽自己声明的双端比例，供测试侧逐字记录。 */
    const probeDeclared = {};

    function definitionSignature(definition) {
      const visit = (nodeId) => {
        const node = definition.nodes[nodeId];
        const slot = node.slotId ? definition.slots[node.slotId] : null;
        return [slot ? node.type + ':' + slot.key : node.type, ...node.childIds.flatMap(visit)];
      };
      return visit(definition.rootNodeId).join(' > ');
    }

    /** 按第 4 节的配方把六页拼出来，每页一个 \`div[data-page]\`。 */
    function buildPages() {
      return ${JSON.stringify(PAGE_RECIPES)}.map((recipe) => {
        const sections = recipe.roles.map((role, index) => {
          const definition = fill(instantiateLaunchTemplateMaster(role, 'tpl_pg_' + recipe.page + '_' + role.replace(/-/g, '_')), variant, role);
          for (const slot of Object.values(definition.slots)) {
            pageKinds[slot.slotId] = slot.type;
            pageMeta[slot.slotId] = { page: recipe.page, role, key: slot.key, label: slot.label || slot.key, semanticRole: slot.semanticRole || '' };
          }
          const contentBySlotId = { ...definition.defaultContent };
          /**
           * \`/catalog\` 的配方是"M1 克制变体、无主行动"：这一页的装修区块里不许有行动，
            * 所以把行动内容显式清空。公开面必须保持页面自己的空值，不能回填模板默认行动。
           */
          if (recipe.action === null) {
            for (const slot of Object.values(definition.slots)) {
              if (slot.type === 'button' || slot.type === 'link') contentBySlotId[slot.slotId] = '';
            }
          }
          return React.createElement('section', { key: role, 'data-role': role, 'data-definition-signature': definitionSignature(definition) },
            React.createElement(DynamicTemplateRenderer, { definition, device, mode: 'public', contentBySlotId, hiddenSlotIds: [], primaryHeadingLevel: index === 0 ? 1 : 2 }));
        });
        return React.createElement('div', { key: recipe.page, 'data-page': recipe.page, 'data-path': recipe.path }, sections);
      });
    }

    /** 正向探针：同时记录 M1 的机器声明和 Renderer 最终手机几何。 */
    function buildProbe() {
      const name = 'as-shipped';
      const definition = fill(instantiateLaunchTemplateMaster('page-hero', 'tpl_probe_page_hero'), variant);
      const background = Object.values(definition.slots).find((slot) => slot.semanticRole === 'backgroundImage');
      probeDeclared[name] = {
        slotId: background ? background.slotId : '',
        key: background ? background.key : '',
        semanticRole: background ? String(background.semanticRole || '') : '',
        desktop: background && background.desktopRules ? String(background.desktopRules.aspectRatio || '') : '',
        mobile: background && background.mobileRules ? String(background.mobileRules.aspectRatio || '') : '',
      };
      return React.createElement('section', { key: name, 'data-role': 'page-hero', 'data-probe': name },
        React.createElement(DynamicTemplateRenderer, { definition, device, mode: 'public', contentBySlotId: { ...definition.defaultContent }, hiddenSlotIds: [], primaryHeadingLevel: 1 }));
    }

    const root = ReactDOM.createRoot(document.getElementById('fixture'));
    /**
     * 三个渲染面共用同一份脚本，各自只挂自己那一个：
     * \`roles\` 是七块并排（第 7.1 节那六条），\`pages\` 是六页真实配方（第 7.2 节），
     * \`probe\` 是 M1 的反事实对照。
     */
    const surface = '${surface}';
    if (surface === 'pages') root.render(buildPages());
    else if (surface === 'probe') root.render(buildProbe());
    else root.render(build({}));
    window.__launchMasterRoles = roles;
    window.__launchMasterClamps = clamps;
    window.__launchMasterKinds = kinds;
    window.__launchMasterAlts = alts;
    window.__launchMasterRender = (options) => root.render(build(options || {}));
    /** 六页面与探针面的登记表：渲染时同步填好，测试侧一次取走。 */
    window.__launchMasterPageData = () => ({ recipes: ${JSON.stringify(PAGE_RECIPES)}, kinds: pageKinds, meta: pageMeta, probe: probeDeclared, expectedLabels });
  </script></body></html>`;
}

interface SlotBox {
  slot: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scrollHeight: number;
  clientHeight: number;
  scrollWidth: number;
  clientWidth: number;
  /** 元素自己算出来的 `overflow`。只有不是 `visible` 时，`scrollHeight > clientHeight` 才等于"有东西被裁掉"。 */
  clips: boolean;
  /** `-webkit-line-clamp` 生效时的行数；`none` 表示没有行数上限。 */
  clamp: string;
  role: string;
}

interface MediaBox {
  slot: string;
  role: string;
  currentSrc: string;
  naturalWidth: number;
  naturalHeight: number;
  width: number;
  height: number;
}

/**
 * 视口高度默认取一个高于画幅的值——几何断言量的是"相对根盒"，垂直高度不参与判定；
 * 文档点名 1440×900 时由调用方显式传入。
 */
async function openFixture(page: Page, width: number, variant: FixtureVariant, height?: number) {
  await page.setViewportSize({ width, height: height ?? (DEVICE_FOR(width) === "mobile" ? 844 : 1000) });
  await page.goto(FIXTURE_PATHS[variant]);
  await expect(page.locator("section[data-role]")).toHaveCount(ROLES.length);
}

/**
 * 图片槽在公开态是 `loading="lazy"`（`DynamicTemplateRenderer.tsx:461`），首屏之外的图
 * 不滚到就永远不会请求，`naturalWidth` 会一直是 0。所以量像素之前先把整页走一遍。
 *
 * `globals.css` 引到的 `styles/public/foundation.css:56` 有 `html { scroll-behavior: smooth; }`，
 * 不掐掉的话每一跳都是动画：循环走不到底（深处的图始终不加载），末尾的归位也停不下来，
 * 于是"量几何"量到的是滚动中途的坐标——首块会读出负的 `y`。
 */
async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    const step = Math.max(240, Math.floor(innerHeight * 0.8));
    for (let y = 0; y < root.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, 0);
    // 归位要等到真的停下再交还，否则调用方量到的是滚动中途的视口。
    for (let i = 0; i < 50 && window.scrollY !== 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    root.style.scrollBehavior = previous;
  });
}

async function routeFixtures(page: Page) {
  for (const [variant, path] of Object.entries(FIXTURE_PATHS) as Array<[FixtureVariant, string]>) {
    await page.route(`**${path}`, (route) =>
      route.fulfill({ contentType: "text/html; charset=utf-8", body: fixtureHtml(variant) }),
    );
  }
}

async function collectSlots(page: Page): Promise<SlotBox[]> {
  return page.locator("section[data-role]").evaluateAll((sections) =>
    sections.flatMap((section) => {
      const role = section.getAttribute("data-role")!;
      return Array.from(section.querySelectorAll("[data-template-slot-id]")).map((leaf) => {
        const box = leaf.getBoundingClientRect();
        const style = getComputedStyle(leaf);
        return {
          role,
          slot: leaf.getAttribute("data-template-slot-id")!,
          type: leaf.getAttribute("data-template-node-type")!,
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          scrollHeight: leaf.scrollHeight,
          clientHeight: leaf.clientHeight,
          scrollWidth: leaf.scrollWidth,
          clientWidth: leaf.clientWidth,
          clips: style.overflowX !== "visible" || style.overflowY !== "visible",
          clamp: style.webkitLineClamp,
        };
      });
    }),
  );
}

async function collectMedia(page: Page): Promise<MediaBox[]> {
  return page.locator("section[data-role]").evaluateAll((sections) =>
    sections.flatMap((section) => {
      const role = section.getAttribute("data-role")!;
      return Array.from(section.querySelectorAll("img")).map((image) => {
        const box = image.getBoundingClientRect();
        return {
          role,
          slot: image.closest("[data-template-slot-id]")?.getAttribute("data-template-slot-id") ?? "",
          currentSrc: image.currentSrc,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          width: box.width,
          height: box.height,
        };
      });
    }),
  );
}

/**
 * 六页面与探针面各自的路由。三个面的路径互不重叠，可以一次全挂上。
 */
async function routePageFixtures(page: Page) {
  await page.route(`**${FIXTURE_PAGES_PATH}`, (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", body: fixtureHtml("normal", "pages") }),
  );
  await page.route(`**${FIXTURE_PROBE_PATH}`, (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", body: fixtureHtml("normal", "probe") }),
  );
}

/**
 * 进六页面之前先把视口定好：`device` 是夹具在加载时按 `innerWidth` 算定的
 * （与真实公开页同一条规则，见 `responsive.ts`），加载之后再改视口不会重算，
 * 只会量到一份按另一个设备渲染的结果。
 */
async function openPages(page: Page, width: number, height?: number) {
  await page.setViewportSize({ width, height: height ?? (DEVICE_FOR(width) === "mobile" ? 844 : 1000) });
  await page.goto(FIXTURE_PAGES_PATH);
  await expect(page.locator("div[data-page]")).toHaveCount(PAGE_RECIPES.length);
  await expect(page.locator("div[data-page] > section[data-role]")).toHaveCount(
    PAGE_RECIPES.reduce((total, recipe) => total + recipe.roles.length, 0),
  );
}

async function readPageData(page: Page): Promise<PageData> {
  return page.evaluate(
    () => (window as unknown as { __launchMasterPageData: () => PageData }).__launchMasterPageData(),
  );
}

interface PageData {
  recipes: ReadonlyArray<{ page: string; path: string; roles: string[]; focus: string | null; action: { role: string; kind: string } | null }>;
  kinds: Record<string, string>;
  meta: Record<string, { page: string; role: string; key: string; label: string; semanticRole: string }>;
  probe: Record<string, { slotId: string; key: string; semanticRole: string; desktop: string; mobile: string }>;
  expectedLabels: Record<string, string>;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PageSection extends Box {
  page: string;
  path: string;
  role: string;
  index: number;
  /** 结构签名：`节点类型[:槽位键] > …`，文档顺序。用来判"没有两块被做成同一块"。 */
  signature: string;
  nodeCount: number;
  media: Array<Box & { slot: string; semanticRole: string }>;
  slots: Array<Box & { slot: string; kind: string; semanticRole: string; filled: boolean }>;
  actions: Array<Box & { slot: string; role: string; kind: string; tag: string; label: string; href: string | null }>;
  /** 整节可见文字，空白已归一。不变量 G 的营销语扫描就扫这一份。 */
  text: string;
  rootHeightMode: string;
  rootHeightRatio: string | null;
  stageAspectRatio: string;
  /** 母版里长出来的站点外壳与表单控件数量（不变量 A）。 */
  siteShell: number;
}

/**
 * 一次把六页全量出来。
 *
 * 量的都是 CSS 框：媒体框的尺寸由槽位自己声明的 `aspect-ratio` 决定
 * （`DynamicTemplateRenderer.tsx:274`），与图片是否已经解码无关，所以这里**不滚页**——
 * 六个页面拼起来有几十屏高，`scrollThrough` 会把这一组测试拖到几分钟；
 * "解码出真实像素"那件事已经由 `PB-MEDIA-002` 专门验过，不需要在这里重复一遍。
 */
async function readPages(page: Page): Promise<PageSection[]> {
  return page.locator("div[data-page]").evaluateAll((pageElements) => {
    const data = (window as unknown as { __launchMasterPageData: () => PageData }).__launchMasterPageData();
    const metaOf = (slotId: string) => data.meta[slotId] ?? { page: "", role: "", key: "", label: "", semanticRole: "" };
    const boxOf = (element: Element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const SHELL = ["header", "footer", "nav", "[role='navigation']", "form", "input", "select", "textarea"];
    return pageElements.flatMap((pageElement) => {
      const pageName = pageElement.getAttribute("data-page")!;
      const path = pageElement.getAttribute("data-path")!;
      return Array.from(pageElement.querySelectorAll<HTMLElement>("section[data-role]")).map((section, index) => {
        const role = section.getAttribute("data-role")!;
        const canvas = section.querySelector<HTMLElement>(".hc-dynamic-template");
        const nodeElements = canvas ? Array.from(canvas.querySelectorAll<HTMLElement>("[data-template-node-id]")) : [];
        const stage = nodeElements.find((element) => element.getAttribute("data-template-node-type") === "Stack");
        const slotElements = Array.from(section.querySelectorAll<HTMLElement>("[data-template-slot-id]"));
        const slots = slotElements.map((element) => {
          const slot = element.getAttribute("data-template-slot-id")!;
          // `filled` 复刻渲染器自己对"这个槽位有没有东西"的判据：
          // 公开面上空槽位渲染成空（`renderSlotContent` 的各条 `mode === "public" ? null`），
          // 但节点外壳照旧带 `data-template-slot-id`。不区分这两件事的话，
          // "`/catalog` 的装修区块一个行动都没有"会被一堆空壳槽位判成红。
          const filled = (element.textContent ?? "").trim().length > 0 || element.querySelector("img") !== null;
          return { slot, kind: data.kinds[slot] ?? "", semanticRole: metaOf(slot).semanticRole, filled, ...boxOf(element) };
        });
        const media = Array.from(section.querySelectorAll<HTMLImageElement>("img")).map((image) => {
          const slot = image.closest("[data-template-slot-id]")?.getAttribute("data-template-slot-id") ?? "";
          return { slot, semanticRole: metaOf(slot).semanticRole, ...boxOf(image) };
        });
        const actions = slots
          .filter((entry) => (entry.kind === "button" || entry.kind === "link") && entry.filled)
          .map((entry) => {
            const element = slotElements.find((candidate) => candidate.getAttribute("data-template-slot-id") === entry.slot)!;
            const anchor = element.tagName === "A" ? element : element.querySelector("a");
            return {
              slot: entry.slot,
              role,
              kind: entry.kind,
              tag: element.tagName.toLowerCase(),
              label: (element.textContent ?? "").trim(),
              href: anchor ? anchor.getAttribute("href") : null,
              x: entry.x,
              y: entry.y,
              width: entry.width,
              height: entry.height,
            };
          });
        return {
          page: pageName,
          path,
          role,
          index,
          ...boxOf(section),
          signature: section.getAttribute("data-definition-signature") ?? "",
          nodeCount: nodeElements.length,
          media,
          slots,
          actions,
          text: (section.textContent ?? "").replace(/\s+/g, " ").trim(),
          rootHeightMode: canvas?.getAttribute("data-template-root-height-mode") ?? "",
          rootHeightRatio: canvas?.getAttribute("data-template-root-height-ratio") ?? null,
          stageAspectRatio: stage ? getComputedStyle(stage).aspectRatio : "",
          siteShell: SHELL.reduce((total, selector) => total + section.querySelectorAll(selector).length, 0),
        };
      });
    });
  });
}

/** 一节里所有文字槽的并集框。行动槽算文字：它是文案，不是媒体。 */
function unionBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function overlapsVertically(a: Box, b: Box): boolean {
  return a.y < b.y + b.height && b.y < a.y + a.height;
}

function sideBySide(a: Box, b: Box): boolean {
  return a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1;
}

/** 主媒体 = 该节面积最大的那张图（第 3 节每块都有且只有一个"主"媒体）。 */
function primaryMedia(section: PageSection): (Box & { slot: string; semanticRole: string }) | null {
  return section.media.slice().sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null;
}

/**
 * 一节的文字框 = 所有**有内容**的非图片槽的并集。空壳槽位有宽度没高度，
 * 把它们算进来只会把文字框拉宽到整行，让"左右图文"的判定失真。
 */
function textUnion(section: PageSection): Box | null {
  return unionBox(section.slots.filter((slot) => slot.kind !== "image" && slot.filled));
}

/**
 * 同一横排上的等宽卡片，比例约 4:5。第 3.1 节的"商品卡组"是固定三格，
 * 因此这三条一起才成立：横排 ≥3 张、等宽、竖卡。M3/M4 的副图组各自只有两张，
 * M1/M2 的多图是"主图 + 次级图"，都不是卡组。
 */
function cardRow(section: PageSection): PageSection["media"] {
  const rows = new Map<number, PageSection["media"]>();
  for (const item of section.media) {
    const key = Math.round(item.y / 8);
    rows.set(key, [...(rows.get(key) ?? []), item]);
  }
  for (const row of rows.values()) {
    const widths = row.map((item) => item.width);
    const equal = Math.max(...widths) - Math.min(...widths) <= 2;
    const portrait = row.every((item) => item.height / item.width > 1.15 && item.height / item.width < 1.35);
    if (row.length >= 3 && equal && portrait) return row;
  }
  return [];
}

/**
 * 把一节归到第 3.1 节的三种过渡之一——判据全部来自量出来的几何，不看母版身份，
 * 否则就是"用被测对象证明被测对象"。四条按序判定、互斥：
 *   1. 商品卡组：同一横排 ≥3 张等宽竖卡；
 *   2. 全幅主视觉：主媒体宽 ≥ 0.98 倍视口宽，且文字框与它相交（文字叠在图上）；
 *   3. 左右图文：主媒体与文字框 x 不相交、y 相交；
 *   4. 上图下文：主媒体整个在文字框上方、x 相交。
 * 判不出来返回 `unclassified` 并让调用方红——绝不"默认通过"。
 */
function classifyTransition(section: PageSection, viewportWidth: number): string {
  if (cardRow(section).length >= 3) return "card-grid";
  const media = primaryMedia(section);
  const text = textUnion(section);
  if (!media || !text) return "unclassified";
  if (media.width >= viewportWidth * 0.98 && intersects(media, text)) return "full-bleed-hero";
  if (sideBySide(media, text)) return overlapsVertically(media, text) ? "split" : "unclassified";
  return media.y + media.height <= text.y + 1 ? "stacked" : "unclassified";
}

/** 全幅媒体框：媒体宽撑满视口。0.98 而不是 0.95——M7 的主图实测约 0.93，两者不能混为一谈。 */
function fullBleedMedia(section: PageSection, viewportWidth: number) {
  return section.media.filter((item) => item.width >= viewportWidth * 0.98);
}

function byPage(sections: PageSection[], page: string): PageSection[] {
  return sections.filter((section) => section.page === page).sort((a, b) => a.index - b.index);
}

/**
 * 失败信息里带上量到的几何。只报"几何与角色的过渡不符"没法定位——
 * 分不清是判据写错了、还是母版真的排版变了。
 */
function sectionGeometry(section: PageSection): string {
  const show = (box: Box | null) => (box ? `[${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)}]` : "无");
  return [
    `节${show(section)}`,
    `主媒体${show(primaryMedia(section))}`,
    `文字${show(textUnion(section))}`,
    `卡组${cardRow(section).length}`,
    `媒体框 ${section.media.map((item) => `${item.slot}${show(item)}`).join(" ") || "无"}`,
  ].join(" ");
}

test.describe("首发七母版验收", () => {
  test("六视口几何：无零高度、无负坐标、不出界、不溢出、无异常覆盖（PB-RESP-002 / PB-RESP-003）", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => route.abort());
    await routeMedia(page);
    await routeFixtures(page);

    for (const width of VIEWPORTS) {
      for (const variant of ["normal", "stress"] as const) {
        await openFixture(page, width, variant);
        await scrollThrough(page);
        const where = `${width}px/${variant}`;
        expect(errors, where).toEqual([]);

        /**
         * 唯一放行"向上溢出"的地方是**桌面固定画幅**（`FIXED_CANVAS_ROLES`），
         * 而且只在压力文案下——正常文案本来就装得下。
         *
         * 手机端绝不放行：`PB-RESP-002` 逐字要求「手机不得出现零高度或负坐标」，
         * 而 390px 下 M1 根是流式排版、高度自适应，压根不存在"画幅装不下"这回事；
         * 一旦这里漏到手机，就等于把文档明令禁止的现象从断言里删掉了。
         * 槽位级断言与 `geometry` 必须共用这一个值，否则每修一处就会从下一处冒出来。
         */
        const allowUpward =
          variant === "stress" && DEVICE_FOR(width) === "desktop" ? [...FIXED_CANVAS_ROLES] : [];

        const slots = await collectSlots(page);
        const declaredClamps = await page.evaluate(
          () => (window as unknown as { __launchMasterClamps: Record<string, string> }).__launchMasterClamps,
        );
        // 七块都要渲染出槽位；一块一个都没有说明它根本没渲染出来。
        for (const role of ROLES) {
          expect(slots.filter((slot) => slot.role === role).length, `${where}:${role}`).toBeGreaterThan(0);
        }
        for (const slot of slots) {
          const name = `${where}:${slot.role}:${slot.slot}`;
          expect(slot.height, `${name}:零高度`).toBeGreaterThan(0);
          expect(slot.width, `${name}:零宽度`).toBeGreaterThan(0);
          expect(slot.x, `${name}:负坐标`).toBeGreaterThanOrEqual(-1);
          // `y` 的豁免与 `geometry` 同源：固定画幅的向上溢出量在那里统一登记成报告，
          // 不在这里重复判一次，免得两处判定各自漂移。
          if (!allowUpward.includes(slot.role)) {
            expect(slot.y, `${name}:负坐标`).toBeGreaterThanOrEqual(-1);
          }
          // 行数上限只能是母版自己声明的（`slot.rules.maxLines`）：M1 副标题是唯一一处，3 行。
          // 别处冒出 `-webkit-line-clamp` 就是在偷偷截断，属于 `PB-RESP-003` 的"丢内容"。
          expect(slot.clamp, `${name}:出现未声明的行数上限`).toBe(declaredClamps[slot.slot] ?? "none");
          /**
           * 「不裁切必要内容」只在元素自己会裁剪时才谈得上。
           *
           * 实测（诊断跑遍六个视口 × 两种文案）：七块母版的每一个 `HeadingSlot` 都恒定
           * `scrollHeight === clientHeight + 2`，横向则处处 `scrollWidth === clientWidth`。
           * 把 M1 标题（390px）拆开看：槽位元素 `overflow: visible`、`margin`/`padding` 都是 0、
           * 盒子 52px（40px 字号 × `line-height: 1.3`），而文字自己那条约 57px 高
           * （YaHei 系 fallback 的字体度量约 1.425em），上下各探出 2～3px；祖先链上每一个
           * `overflow` 也都是 `visible`，**没有任何东西被裁掉**。Chrome 把这段"墨迹超出线盒"
           * 计进 `scrollHeight`——所以在这里它是字体度量事实，不是裁切证据。
           * 真正会裁的三处渲染器分支（`maxLines` 的 line-clamp、`textOverflow` 的省略号与
           * `clip`）都会把 `overflow` 设成非 `visible`，因此这样写不会漏掉真裁切；
           * 而"槽位自己没裁、却被某个祖先裁了"由下面 `geometry` 里的祖先检查兜住。
           */
          if (slot.clips && slot.clamp === "none") {
            expect(slot.scrollHeight, `${name}:内容被自身裁掉`).toBeLessThanOrEqual(slot.clientHeight + 1);
            expect(slot.scrollWidth, `${name}:内容被自身裁掉`).toBeLessThanOrEqual(slot.clientWidth + 1);
          }
        }

        const geometry = await page.locator("section[data-role]").evaluateAll((sections, allowUpward) => {
          const problems: string[] = [];
          const overflow: string[] = [];
          for (const section of sections) {
            const role = section.getAttribute("data-role")!;
            const root = (section.querySelector("[data-template-node-id]") ?? section).getBoundingClientRect();
            const leaves = Array.from(section.querySelectorAll("[data-template-slot-id]"));
            for (const leaf of leaves) {
              const box = leaf.getBoundingClientRect();
              const label = `${role}:${leaf.getAttribute("data-template-slot-id")}`;
              /**
               * 出界判定里唯一放行的是**固定画幅上的向上溢出**（见 `FIXED_CANVAS_ROLES`）。
               *
               * M1 桌面根是 16:9 定高画幅（§3），而 `template-creation-rules.md` 又要求
               * "长文…必须仍可到达，不能靠裁切必要内容维持画幅"——画幅不能长、内容不能裁，
               * 两条同时成立时内容只能向上溢出。往下溢出会把主行动推出画幅、往右撑出横向
               * 滚动条，都比向上溢出更糟。代价是画幅上方那一段够不着，所以这里把**溢出量**
               * 量出来打进报告，让它在回归里可见，而不是假装没发生。
               */
              if (box.top < root.top - 1) {
                if (allowUpward.includes(role)) overflow.push(`${label}:向上溢出 ${Math.round(root.top - box.top)}px`);
                else problems.push(`${label}:出界`);
              }
              if (box.left < root.left - 1 || box.right > root.right + 1 || box.bottom > root.bottom + 1) {
                problems.push(`${label}:出界`);
              }
              // 槽位自己不裁，不等于没被别处裁：最近的一个会裁剪的祖先必须完整包住它。
              // `auto`/`scroll` 是滚动容器，露在外面的内容滚一滚就能看到，不算裁切；
              // `hidden`/`clip` 才是真的看不到——那正是 `PB-RESP-003` 说的"丢内容"。
              for (let el = leaf.parentElement; el && el !== document.body; el = el.parentElement) {
                const style = getComputedStyle(el);
                if (style.overflowX === "visible" && style.overflowY === "visible") continue;
                const hard = [style.overflowX, style.overflowY].some((value) => value === "hidden" || value === "clip");
                if (hard) {
                  const clip = el.getBoundingClientRect();
                  if (box.left < clip.left - 1 || box.top < clip.top - 1 || box.right > clip.right + 1 || box.bottom > clip.bottom + 1) {
                    problems.push(`${label}:被祖先裁剪`);
                  }
                }
                break;
              }
            }
            for (let i = 0; i < leaves.length; i += 1) {
              for (let j = i + 1; j < leaves.length; j += 1) {
                // M1 桌面是 free 画幅：背景图与前景文字本来就叠在一起，这是它的构图，不是缺陷。
                if (role === "page-hero" && [leaves[i], leaves[j]].some((leaf) => leaf.getAttribute("data-template-node-type") === "ImageSlot")) continue;
                const a = leaves[i].getBoundingClientRect();
                const b = leaves[j].getBoundingClientRect();
                if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) {
                  problems.push(`${role}:槽位异常覆盖`);
                }
              }
            }
          }
          return { problems, overflow };
        }, allowUpward);

        expect(geometry.problems, where).toEqual([]);
        // 放行不等于不看见：溢出量写进报告，数值变大就说明文案或画幅在漂移。
        if (geometry.overflow.length) console.log(`[${where}] ${geometry.overflow.join(" | ")}`);

        /**
         * 不变量 D：「除 M1 的桌面根画幅外，根与每个容器一律 `auto`」；§3 M1 的表格也写明
         * 手机根是 `layoutMode: "flow"`、高度 `auto`。
         *
         * 手机合并语义是"只覆盖改过的项"，没写的从桌面继承——桌面那份为窄桌面备下的
         * `minHeight`（768～1023px 下 16:9 只有 432px 高，装不下文案）会原样漏到手机上。
         * 实测 390px 下 M1 主舞台的内容只有 500.6px，却被撑到 560px，底部多出一段
         * 说不出用途的深色空白。这条断言就是钉住它：手机端任何节点都不许背高度下限。
         */
        if (DEVICE_FOR(width) === "mobile") {
          const floored = await page.locator("section[data-role]").evaluateAll((sections) =>
            sections.flatMap((section) => {
              const role = section.getAttribute("data-role")!;
              return Array.from(section.querySelectorAll("[data-template-node-id]"))
                .map((node) => ({
                  type: node.getAttribute("data-template-node-type"),
                  minHeight: getComputedStyle(node).minHeight,
                }))
                // 用 `parseFloat` 而不是比字符串：未设置时 Chrome 可能报 `0px` 也可能报 `auto`，
                // 两者都解析成非正数，只有真的写了像素下限才会被捞出来。
                .filter((item) => Number.parseFloat(item.minHeight) > 0)
                .map((item) => `${role}:${item.type}:min-height=${item.minHeight}`);
            }),
          );
          expect(floored, `${where}:手机端有节点背着高度下限`).toEqual([]);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${where}:横向滚动`).toBe(true);
      }
    }
  });

  /**
   * `launch-template-set.md` 第 7 节把这一条点名为"固定画幅唯一的风险点，必须有兜底"：
   * **桌面长中文主标题 + 副标题在 1440×900 下不裁切、不溢出**。
   *
   * 这句要求逐字出自 §3 M1 的「验收：」段（`launch-template-set.md:135`），属那一块自己的
   * 第二层验收；`PB-VISUAL-001` 只管色值、字重、圆角与间距，`PB-RESP-003` 管的是
   * 极端比例与超长中英文下不丢内容。两个都沾边，但都不能替 §3 的这句兜底说事。
   *
   * 它值得单独一条测试，因为上面那条六视口测试的两个载荷都盖不住这个场景：
   * `normal` 的标题只有 4 个字（1 行，压力不足），`stress` 往标题里灌 215 字
   * （实测 1414px 高，任何视口都装不下，只能向上溢出——那是荒谬输入的上界）。
   * 真实的长标题落在两者之间：30 个字、显示字号下排 2 行。这条线过不过，
   * 上面两条都答不了。
   *
   * 尺寸只在 1440×900 断言，因为这是文档点名的口径。窄桌面（768～1023）在定高 16:9
   * 下即使一行标题也放不下（画幅 432px 高、扣掉底衬只剩 296px 可用，而 Logo + 副标题 +
   * 行动已经吃掉 254px），那是画幅语义本身的问题，不该由这条测试替它开脱。
   */
  test("长中文主标题在 1440×900 下不裁切、不溢出（§3 M1 验收 / PB-RESP-003）", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => route.abort());
    await routeMedia(page);
    await routeFixtures(page);
    await openFixture(page, 1440, "longTitle", 900);
    await scrollThrough(page);
    expect(errors).toEqual([]);

    const facts = await page.evaluate(() => {
      const section = document.querySelector('section[data-role="page-hero"]');
      const rootNode = section?.querySelector("[data-template-node-id]");
      const miss = { canvas: "(未渲染)", outOfCanvas: ["page-hero 没渲染出根节点"], titleLines: 0, titleBox: "", titleFont: "" };
      if (!section || !rootNode) return miss;
      const root = rootNode.getBoundingClientRect();
      const outOfCanvas: string[] = [];
      for (const leaf of Array.from(section.querySelectorAll("[data-template-slot-id]"))) {
        const box = leaf.getBoundingClientRect();
        if (box.left < root.left - 1 || box.top < root.top - 1 || box.right > root.right + 1 || box.bottom > root.bottom + 1) {
          outOfCanvas.push(leaf.getAttribute("data-template-slot-id")!);
        }
      }
      // 标题真的换了行，这条测试才不是在空转——1 行说明载荷没生效，该在断言里露出来
      // 而不是被"没出界"盖过去。
      const titleSlot = section.querySelector('[data-template-slot-id$="_title"]');
      const inner = titleSlot
        ? Array.from(titleSlot.querySelectorAll("*")).find((el) => !el.children.length && (el.textContent ?? "").trim().length > 0)
        : undefined;
      const innerStyle = inner ? getComputedStyle(inner) : undefined;
      const innerBox = inner?.getBoundingClientRect();
      const lineHeight = innerStyle ? Number.parseFloat(innerStyle.lineHeight) : 0;
      return {
        canvas: `${Math.round(root.width)}x${Math.round(root.height)}`,
        outOfCanvas,
        titleLines: innerBox && lineHeight ? Math.round(innerBox.height / lineHeight) : 0,
        titleBox: innerBox ? `${Math.round(innerBox.width)}x${Math.round(innerBox.height)}` : "",
        titleFont: innerStyle ? `${innerStyle.fontSize}/${innerStyle.lineHeight}` : "",
      };
    });

    console.log(`[1440x900/longTitle] ${JSON.stringify(facts)}`);
    expect(facts.outOfCanvas, "有槽位跑出画幅（裁切或溢出）").toEqual([]);
    expect(facts.titleLines, "标题没有换行——载荷或字号与文档假设不符").toBeGreaterThanOrEqual(2);
  });

  /**
   * `PB-VISUAL-001`：色值落 UI_GUIDE §4.1；标题字重 300～500；圆角与间距取
   * `template-creation-rules.md` 第 7.3 节的档位。
   *
   * 量的是浏览器算出来的值，不是母版源文件——源文件写对了而渲染器没接上，只有这里看得见。
   * **不查 padding**：第 7.3 节的"内容边距"是按画布短边算的比例（`CONTENT_EDGE = 8%`），
   * 本条又没有点名它；硬塞进来只会在 M1 固定画幅那道底衬上误报。
   */
  test("视觉档位：用色落 UI_GUIDE §4.1、圆角与间距落第 7.3 节、标题字重 300～500（PB-VISUAL-001）", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => route.abort());
    await routeMedia(page);
    await routeFixtures(page);
    await openFixture(page, 1440, "normal");
    await scrollThrough(page);
    expect(errors).toEqual([]);

    const measured = await page.locator("section[data-role]").evaluateAll((sections) =>
      sections.flatMap((section) => {
        const role = section.getAttribute("data-role")!;
        return Array.from(section.querySelectorAll<HTMLElement>("*")).map((el) => {
          const style = getComputedStyle(el);
          const owner =
            el.closest("[data-template-slot-id]")?.getAttribute("data-template-slot-id") ??
            el.closest("[data-template-node-id]")?.getAttribute("data-template-node-id") ??
            el.tagName.toLowerCase();
          /**
           * 只对"自己直接写着字"的元素查文字颜色。
           *
           * `color` 是会继承的：把容器上的继承值也算进来，等于让全局样式替母版背书
           * （或者替它背锅），量到的就不是母版声明的那份颜色了。
           */
          const ownText = Array.from(el.childNodes).some(
            (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim().length > 0,
          );
          const isBox = style.display.includes("flex") || style.display.includes("grid");
          return {
            role,
            owner,
            tag: el.tagName.toLowerCase(),
            text: ownText ? style.color : "",
            background: style.backgroundColor,
            radius: style.borderRadius,
            gap: isBox ? `${style.rowGap} ${style.columnGap}` : "",
            weight: /^H[1-6]$/.test(el.tagName) ? style.fontWeight : "",
          };
        });
      }),
    );

    const problems: string[] = [];
    const seen = {
      text: new Set<string>(),
      background: new Set<string>(),
      radius: new Set<string>(),
      gap: new Set<string>(),
      weight: new Set<string>(),
    };

    for (const item of measured) {
      const where = `${item.role}:${item.owner}<${item.tag}>`;
      for (const [label, raw, bucket] of [
        ["文字色", item.text, seen.text],
        ["背景色", item.background, seen.background],
      ] as const) {
        if (!raw) continue;
        const hex = toHex(raw);
        if (hex === null) {
          problems.push(`${where} ${label} ${raw} 解析不出颜色`);
          continue;
        }
        if (hex === "transparent") continue;
        bucket.add(hex);
        if (!UI_GUIDE_PALETTE.has(hex)) problems.push(`${where} ${label} ${hex} 不在 UI_GUIDE §4.1`);
      }

      // 圆角与间距都可能是四个角的简写（`16px 0px 0px 0px`），逐段查而不是整串比。
      for (const token of item.radius ? item.radius.split(" ") : []) {
        seen.radius.add(token);
        if (!token.endsWith("px") || !RADIUS_STEPS.has(Number.parseFloat(token))) {
          problems.push(`${where} 圆角 ${token} 不在第 7.3 节档位`);
        }
      }
      for (const token of item.gap ? item.gap.split(" ") : []) {
        // `normal` 是"没设 gap"，不是一种间距值。
        if (token === "normal") continue;
        seen.gap.add(token);
        if (!token.endsWith("px") || !GAP_STEPS.has(Number.parseFloat(token))) {
          problems.push(`${where} 间距 ${token} 不在第 7.3 节档位`);
        }
      }
      if (item.weight) {
        seen.weight.add(item.weight);
        const value = Number(item.weight);
        if (!(value >= 300 && value <= 500)) problems.push(`${where} 标题字重 ${item.weight} 越出 300～500`);
      }
    }

    const list = (values: Set<string>) => (values.size ? [...values].sort().join(" ") : "(无)");
    console.log(
      `[visual/1440] 文字色 ${list(seen.text)} | 背景色 ${list(seen.background)} | ` +
        `圆角 ${list(seen.radius)} | 间距 ${list(seen.gap)} | 标题字重 ${list(seen.weight)}`,
    );
    // 空集合会让上面每一条断言都空转：量不到东西时先在这里红，而不是悄悄通过。
    expect(seen.text.size, "一处文字颜色都没量到").toBeGreaterThan(0);
    expect(seen.gap.size, "一处间距都没量到").toBeGreaterThan(0);
    expect(seen.weight.size, "一处标题字重都没量到").toBeGreaterThan(0);
    expect(problems, "PB-VISUAL-001").toEqual([]);
  });

  /**
   * `PB-A11Y-001`：标题层级、图片替代文本、键盘可达与焦点可见；长文换行，不靠过度缩小或隐藏通过。
   *
   * 用压力文案跑，因为"缩小/隐藏"这两种作弊只有在内容装不下时才有动机。
   */
  test("无障碍语义：唯一 h1、替代文本原样到达、行动可 Tab 且焦点可见、压力下不缩不藏（PB-A11Y-001）", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => route.abort());
    await routeMedia(page);
    await routeFixtures(page);
    await openFixture(page, 1440, "stress");
    await scrollThrough(page);
    expect(errors).toEqual([]);

    const kinds = await page.evaluate(
      () => (window as unknown as { __launchMasterKinds: Record<string, string> }).__launchMasterKinds,
    );
    const altFor = await page.evaluate(
      () => (window as unknown as { __launchMasterAlts: Record<string, string> }).__launchMasterAlts,
    );
    const headingSlots = Object.entries(kinds).filter(([, kind]) => kind === "heading").map(([slotId]) => slotId);
    const actionSlots = Object.entries(kinds)
      .filter(([, kind]) => kind === "button" || kind === "link")
      .map(([slotId]) => slotId);
    expect(headingSlots.length, "七块加起来一个标题槽位都没有").toBeGreaterThanOrEqual(ROLES.length);
    // 行动槽位不能照标题那样要求"每块都有"：不变量 F 只给 `page-hero` 与 `service-invitation`
    // 按钮资格，`creation-grid` 的骨架里一个行动槽位都没有（第 3 节 M5）。这里守的是
    // "两种元素都真的出现在页面上"——否则下面的 Tab 遍历只走了一种控件也不算数。
    expect(actionSlots.length, "七块加起来一个行动槽位都没有").toBeGreaterThan(0);
    expect(
      [...new Set(actionSlots.map((slotId) => kinds[slotId]))].sort(),
      "行动槽位只覆盖了一种元素",
    ).toEqual(["button", "link"]);

    const facts = await page.locator("section[data-role]").evaluateAll((sections) => {
      const owner = (el: Element, attribute: string) =>
        el.closest(`[data-${attribute}]`)?.getAttribute(`data-${attribute}`) ?? "";
      return {
        headings: Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((el) => ({
          tag: el.tagName.toLowerCase(),
          role: el.closest("section[data-role]")?.getAttribute("data-role") ?? "",
          slot: owner(el, "template-slot-id"),
        })),
        images: Array.from(document.querySelectorAll("img")).map((el) => ({
          role: el.closest("section[data-role]")?.getAttribute("data-role") ?? "",
          slot: owner(el, "template-slot-id"),
          hasAlt: el.hasAttribute("alt"),
          alt: el.getAttribute("alt"),
        })),
        // 隐藏的两条路都堵死：`display: none` 与 `visibility: hidden` 各查一遍。
        hidden: sections.flatMap((section) => {
          const role = section.getAttribute("data-role")!;
          return Array.from(section.querySelectorAll<HTMLElement>("[data-template-slot-id]"))
            .filter((el) => {
              const style = getComputedStyle(el);
              return style.display === "none" || style.visibility === "hidden";
            })
            .map((el) => `${role}:${el.getAttribute("data-template-slot-id") ?? ""}`);
        }),
        rendered: sections.flatMap((section) =>
          Array.from(section.querySelectorAll("[data-template-slot-id]")).map(
            (el) => el.getAttribute("data-template-slot-id") ?? "",
          ),
        ),
        /**
         * 每个槽位里最深处那段文字的实际字号；槽位里根本没有文字时是 `null`。
         *
         * 取"最深处"是因为槽位元素自己常常只是个盒子（继承 16px），真正承载文案的是它里面
         * 那一层；量盒子等于量到了继承值，看不出母版有没有偷偷换档。图片槽里没有文字，
         * 退回量它那个盒子就是同一件错事，所以如实报 `null` 让调用方把它排除掉。
         */
        text: sections.flatMap((section) =>
          Array.from(section.querySelectorAll<HTMLElement>("[data-template-slot-id]")).map((el) => {
            const leaves = Array.from(el.querySelectorAll<HTMLElement>("*")).filter(
              (child) => !child.children.length && (child.textContent ?? "").trim().length > 0,
            );
            return {
              slot: el.getAttribute("data-template-slot-id") ?? "",
              size: leaves.length ? Number.parseFloat(getComputedStyle(leaves[leaves.length - 1]).fontSize) : null,
            };
          }),
        ),
      };
    });

    // 1) 标题层级：整页恰好一个 h1，它属于首屏、落在标题槽位上，其余标题槽位一律 h2。
    const h1 = facts.headings.filter((item) => item.tag === "h1");
    expect(h1.length, "整页 h1 不是恰好一个").toBe(1);
    const heroHeadings = headingSlots.filter((slotId) => slotId.startsWith("tpl_acc_page_hero_"));
    expect(heroHeadings.length, "M1 没有标题槽位").toBeGreaterThan(0);
    expect(h1[0].slot, "h1 不在 M1 的标题槽位上").toBe(heroHeadings[0]);
    for (const slotId of headingSlots) {
      const own = facts.headings.filter((item) => item.slot === slotId);
      // 用 `div role="heading"` 冒充标题会在这里红——`PB-A11Y-001` 要的是真的标题层级。
      expect(own.length, `${slotId}:标题槽位没有渲染出 h1～h6`).toBe(1);
      expect(["h1", "h2"], `${slotId}:标题层级不是 h1/h2`).toContain(own[0].tag);
    }

    // 2) 图片替代文本：属性在、内容与实例文案逐字相同、而且不像文件名或路径。
    expect(facts.images.length, "一张图片都没量到").toBeGreaterThan(0);
    for (const image of facts.images) {
      const where = `${image.role}:${image.slot}`;
      expect(image.hasAlt, `${where}:图片没有 alt 属性`).toBe(true);
      expect(image.alt, `${where}:替代文本没有原样到达 DOM`).toBe(altFor[image.slot]);
      expect(image.alt ?? "", `${where}:替代文本像文件名`).not.toMatch(/\.(jpe?g|png|webp|gif|svg|avif)$/i);
      expect(image.alt ?? "", `${where}:替代文本像路径`).not.toContain("/");
    }

    // 3) 不靠隐藏通过：槽位一个不少，也没有哪个被 `display: none` / `visibility: hidden` 藏起来。
    expect(facts.hidden, "有槽位被藏起来").toEqual([]);
    expect([...new Set(facts.rendered)].sort(), "渲染出来的槽位与母版声明的对不上").toEqual(
      Object.keys(kinds).sort(),
    );

    // 4) 不靠过度缩小通过：字号仍是 `typographyScale.ts` 声明的那套桌面档位。
    //    图片槽里没有文字，量不到字号，既不参与这条断言、也不许混进来充数；反过来，
    //    凡母版声明为承载文字的槽位都必须量到——否则"都没超档"可以靠什么都没量到来通过。
    const measured = facts.text.filter((item): item is { slot: string; size: number } => item.size !== null);
    const textKinds = new Set(["heading", "text", "richText", "button", "link"]);
    expect(
      [...new Set(measured.map((item) => item.slot))].sort(),
      "有声明承载文字的槽位没量到字号",
    ).toEqual(Object.entries(kinds).filter(([, kind]) => textKinds.has(kind)).map(([slotId]) => slotId).sort());
    const sizes = new Set(measured.map((item) => item.size));
    const offScale = measured.filter((item) => !DESKTOP_TYPE_STEPS.has(item.size));
    console.log(`[a11y/1440/stress] 字号 ${[...sizes].sort((a, b) => b - a).join(" ")}`);
    expect(offScale, "压力文案下出现了不在声明档位上的字号").toEqual([]);

    // 5) 键盘可达与焦点可见：真的按 Tab 走一遍，行动槽位必须出现在焦点序列里。
    const reached: Array<{
      slot: string;
      tag: string;
      href: string | null;
      outline: string;
      shadow: string;
      visible: boolean;
    }> = [];
    for (let i = 0; i < 80; i += 1) {
      await page.keyboard.press("Tab");
      const item = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        const width = Number.parseFloat(style.outlineWidth) || 0;
        return {
          slot: el.closest("[data-template-slot-id]")?.getAttribute("data-template-slot-id") ?? "",
          tag: el.tagName.toLowerCase(),
          href: el.getAttribute("href"),
          outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
          shadow: style.boxShadow,
          // UI_GUIDE `:597`：键盘焦点至少 2px 外轮廓。`box-shadow` 是等效的可见焦点环。
          visible: (style.outlineStyle !== "none" && width >= 2) || style.boxShadow !== "none",
        };
      });
      // 焦点绕回起点就是走完了一圈；再按下去只是重复，没量到新东西。
      if (!item || (reached.length > 0 && item.slot === reached[0].slot && item.tag === reached[0].tag)) break;
      reached.push(item);
    }
    // 先报序列再断言：这一段的失败信息（"不在 Tab 序列里"）本身说不出序列里到底有什么，
    // 而"序列是空的"和"序列里只有别的东西"要修的地方完全不同。
    const probe = await page.evaluate(() => ({
      hasFocus: document.hasFocus(),
      active: (document.activeElement as HTMLElement | null)?.tagName.toLowerCase() ?? "(null)",
      focusable:
        document.querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"]), input, select, textarea')
          .length,
    }));
    console.log(
      `[a11y/1440/stress] Tab 序列 ${reached.length} 站：` +
        (reached.length
          ? reached.map((item) => `${item.slot || `(无槽位)${item.tag}`}(${item.outline})`).join(" → ")
          : `（一个可聚焦元素都没有；hasFocus=${probe.hasFocus} active=${probe.active} DOM 里可聚焦元素=${probe.focusable}）`),
    );
    expect(reached.length, "页面上一个可聚焦元素都没有").toBeGreaterThan(0);

    const reachable = new Set(reached.map((item) => item.slot));
    for (const slotId of actionSlots) {
      expect(reachable.has(slotId), `${slotId}:行动槽位不在 Tab 焦点序列里`).toBe(true);
    }
    for (const item of reached.filter((entry) => actionSlots.includes(entry.slot))) {
      // 公开态的行动槽是带 `href` 的真链接（`DynamicTemplateRenderer.tsx:723`），
      // 落到一个没有 href 的壳上，Tab 能到但按不动。
      expect(item.href, `${item.slot}:聚焦到的是没有 href 的壳`).toBeTruthy();
      expect(item.visible, `${item.slot}:聚焦时没有可见的焦点指示（${item.outline} / ${item.shadow}）`).toBe(true);
    }
  });

  /**
   * `PB-FAIL-001` 的公开渲染面：「槽位隐藏、删空、锁定与恢复后上下文合法」。
   *
   * 锁定是编辑期的概念，公开态没有它。这条做的是在同一条真实页面上，把每个槽位依次隐藏、
   * 删空、再恢复，逐次比较几何：隐藏与删空都不许把整块弄塌，恢复之后必须回到原样——
   * "不丢源草稿"在公开态唯一可观测的形式就是这条。
   *
   * 槽位清单由母版自己声明的 `__launchMasterKinds` 驱动，不写死任何一个槽位键名。
   */
  test("槽位隐藏、删空、恢复后上下文合法且几何回到原样（PB-FAIL-001）", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => route.abort());
    await routeMedia(page);
    await routeFixtures(page);
    await openFixture(page, 1440, "normal");
    await scrollThrough(page);
    expect(errors).toEqual([]);

    const kinds = await page.evaluate(
      () => (window as unknown as { __launchMasterKinds: Record<string, string> }).__launchMasterKinds,
    );
    /** 槽位 id 是夹具按 `tpl_acc_<role>_<key>` 生成的，七个角色互不为前缀。 */
    const slotsOf = (role: string) =>
      Object.keys(kinds).filter((slotId) => slotId.startsWith(`tpl_acc_${role.replace(/-/g, "_")}_`));
    for (const role of ROLES) {
      expect(slotsOf(role).length, `${role}:没有解析出任何槽位`).toBeGreaterThan(0);
    }

    const snapshot = () =>
      page.evaluate(() => {
        const out: Record<string, string> = {};
        for (const section of Array.from(document.querySelectorAll<HTMLElement>("section[data-role]"))) {
          const role = section.getAttribute("data-role")!;
          out[`${role}:整块高`] = String(Math.round(section.getBoundingClientRect().height));
          for (const leaf of Array.from(section.querySelectorAll<HTMLElement>("[data-template-slot-id]"))) {
            const rect = leaf.getBoundingClientRect();
            out[`${role}:${leaf.getAttribute("data-template-slot-id")}`] =
              `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)}`;
          }
        }
        return out;
      });

    const render = async (options: { hiddenSlotIds?: string[]; emptiedSlotIds?: string[] }) => {
      await page.evaluate((next) => {
        (window as unknown as { __launchMasterRender: (value: unknown) => void }).__launchMasterRender(next);
      }, options);
      // 等两帧：React 提交完 DOM 之后浏览器还要跑一次布局，几何才作数。
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
      );
    };

    const baseline = await snapshot();

    const mutations: Array<{
      label: string;
      options: (slotId: string) => { hiddenSlotIds?: string[]; emptiedSlotIds?: string[] };
    }> = [
      { label: "隐藏", options: (slotId) => ({ hiddenSlotIds: [slotId] }) },
      { label: "删空", options: (slotId) => ({ emptiedSlotIds: [slotId] }) },
    ];
    for (const mutation of mutations) {
      for (const role of ROLES) {
        for (const slotId of slotsOf(role)) {
          await render(mutation.options(slotId));
          expect(errors, `${slotId}:${mutation.label}后页面报错`).toEqual([]);
          const after = await snapshot();
          // 抽掉一个槽位不许把整块带塌——`PB-FAIL-001` 要的就是"上下文合法"。
          expect(Number(after[`${role}:整块高`]), `${slotId}:${mutation.label}后整块塌成零高`).toBeGreaterThan(0);
          await render({});
        }
      }
    }

    // 极端情形：一块的槽位全藏。整块仍要立得住，也不能报错。
    for (const role of ROLES) {
      await render({ hiddenSlotIds: slotsOf(role) });
      expect(errors, `${role}:槽位全藏后页面报错`).toEqual([]);
      const after = await snapshot();
      expect(Number(after[`${role}:整块高`]), `${role}:槽位全藏后整块塌成零高`).toBeGreaterThan(0);
      await render({});
    }

    expect(await snapshot(), "恢复后几何没有回到原样").toEqual(baseline);
  });

  test("主图在两种设备下都加载到真实像素，缺图不塌陷（PB-MEDIA-002）", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => route.abort());
    await routeFixtures(page);
    await routeMedia(page);

    /**
     * 每个槽位在两种设备下各自选中的派生候选宽度。
     * 注意这里比的是 `currentSrc` 里的候选宽度，**不是** `naturalWidth`：
     * 图片走 `srcset` + `sizes="100vw"` 时，浏览器会把 intrinsic 尺寸按密度换算，
     * `naturalWidth` 报出来的是"候选宽度 ÷ (候选宽度 ÷ 源尺寸)"，也就是源尺寸——实测
     * 390px 下所有图都报 389、1440px 下都报 1440，与解码像素无关。拿它证明"真实像素"是错的。
     */
    const mobilePicked: Record<string, number> = {};
    const desktopPicked: Record<string, number> = {};
    for (const width of [390, 1440] as const) {
      await openFixture(page, width, "normal");
      await scrollThrough(page);
      await expect
        .poll(
          () => page.evaluate(() => Array.from(document.images).filter((image) => image.naturalWidth === 0).length),
          { message: `${width}px：仍有图片没有解码出真实像素` },
        )
        .toBe(0);

      const media = await collectMedia(page);
      // 七块都至少有一张图；一块的图一张都没渲染出来就是塌陷。
      for (const role of ROLES) {
        expect(media.filter((item) => item.role === role).length, `${width}px:${role}`).toBeGreaterThan(0);
      }
      for (const item of media) {
        const name = `${width}px:${item.role}:${item.slot}`;
        // 真的解出了一张图，不是占位、不是坏图。
        expect(item.naturalHeight, `${name}:未加载到真实像素`).toBeGreaterThan(0);
        expect(item.width, `${name}:渲染宽为 0`).toBeGreaterThan(0);
        expect(item.height, `${name}:渲染高为 0`).toBeGreaterThan(0);
        // 夹具素材是 4:5，解码出来的宽高比必须还是 4:5——证明解的是那张素材，不是别的兜底图。
        expect(item.naturalHeight / item.naturalWidth, `${name}:解码出的宽高比不是素材本身`).toBeGreaterThan(1.2);
        expect(item.naturalHeight / item.naturalWidth, `${name}:解码出的宽高比不是素材本身`).toBeLessThan(1.3);
        // 派生链路真的接上了：元素用的是四条候选里的一条。
        const picked = Number(new URL(item.currentSrc, "http://fixture.local").searchParams.get("width"));
        expect(DERIVED_IMAGE_WIDTHS, `${name}:选中的不是派生候选`).toContain(picked as (typeof DERIVED_IMAGE_WIDTHS)[number]);
        const key = `${item.role}:${item.slot}`;
        if (width === 390) mobilePicked[key] = picked;
        else desktopPicked[key] = picked;
      }
    }

    // 候选是按设备挑的：同一个槽位，1440px 挑的不能比 390px 窄。实测两档分别是 1680 与 480，
    // 所以这里断言严格更宽——若某天派生退化成"两端同一张"，这条会红。
    expect(Object.keys(desktopPicked).length, "没有量到桌面端的候选").toBeGreaterThan(0);
    for (const [key, picked] of Object.entries(desktopPicked)) {
      expect(mobilePicked[key], `${key}:手机端没量到候选`).toBeDefined();
      expect(picked, `${key}:桌面挑的候选没有比手机更宽`).toBeGreaterThan(mobilePicked[key]);
    }

    // 缺图不塌陷：图片全部 404 之后，七块仍要立得住——结构还在、画布还在、没有未捕获错误。
    await page.unroute(FIXTURE_IMAGE_ROUTE);
    await routeMedia(page, true);
    for (const width of [390, 1440] as const) {
      await openFixture(page, width, "normal");
      await scrollThrough(page);
      const where = `${width}px/缺图`;
      expect(errors, where).toEqual([]);
      const snapshot = await page.locator("section[data-role]").evaluateAll((sections) =>
        sections.map((section) => ({
          role: section.getAttribute("data-role")!,
          slots: section.querySelectorAll("[data-template-slot-id]").length,
          height: section.getBoundingClientRect().height,
          brokenImages: Array.from(section.querySelectorAll("img")).filter((image) => image.naturalWidth === 0).length,
        })),
      );
      for (const block of snapshot) {
        expect(block.slots, `${where}:${block.role}:缺图后整块槽位全没了`).toBeGreaterThan(0);
        expect(block.height, `${where}:${block.role}:缺图后整块塌成零高`).toBeGreaterThan(0);
      }
      expect(snapshot.some((block) => block.brokenImages > 0), `${where}:没有任何一张图处于缺图状态，这一轮没验到`).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${where}:横向滚动`).toBe(true);
    }
  });

  // ——————————————————————————————————————————————————————————————————————
  // 第 7.2 节：跨块结论。六页配方按 `launch-template-set.md` 第 4 节逐字写进夹具，
  // 断言的对象是"六页拼在一起之后仍然成立"的那五件事——单块自己好看不算数。
  // 第 7 节明确要求这一层"要在真实浏览器上做，不能只用类型检查或单元测试代替"。
  // ——————————————————————————————————————————————————————————————————————

  test("跨块：七块互不冒充，不长站点外壳，不出现营销语（§7.2-A / 不变量 A、F、G）", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => route.abort());
    await routeMedia(page);
    await routePageFixtures(page);
    await openPages(page, 1440);

    const sections = await readPages(page);
    expect(errors, "六页渲染过程中抛出了未捕获错误").toEqual([]);

    // 一、同一块母版在任何页面上都必须是同一棵树。`/catalog` 的"克制变体"在第 4 节里
    //     是**内容**层面的克制（去掉主要行动），不是另做一块母版；签名一变，这条立刻红。
    const signatureByRole = new Map<string, string>();
    for (const section of sections) {
      const previous = signatureByRole.get(section.role);
      if (previous === undefined) signatureByRole.set(section.role, section.signature);
      else expect(section.signature, `${section.role} 在不同页面上不是同一棵树`).toBe(previous);
    }
    // 六页配方得把七块都用上，否则下面这条两两比对是在比一份残缺的集合。
    expect([...signatureByRole.keys()].sort(), "六页配方没有覆盖满七块母版").toEqual([...ROLES].sort());

    // 二、七块的树两两不同：没有哪两块被做成同一块的复制品。
    const signatures = [...signatureByRole.entries()];
    for (let i = 0; i < signatures.length; i += 1) {
      expect(signatures[i][1], `${signatures[i][0]} 的结构签名是空的`).not.toBe("");
      for (let j = i + 1; j < signatures.length; j += 1) {
        expect(signatures[i][1], `${signatures[i][0]} 与 ${signatures[j][0]} 的结构完全相同`).not.toBe(signatures[j][1]);
      }
    }

    // 三、不变量 A：不生成站点外壳。夹具这一层只包了 `section[data-role]`，
    //     母版一旦长出页眉页脚，这里就会量出第二套导航与表单控件。
    for (const section of sections) {
      expect(section.siteShell, `${section.page}/${section.role}:母版里长出了站点外壳或表单控件`).toBe(0);
    }

    // 四、不变量 G：不出现价格、库存、加购、倒计时与促销会场的话术。
    //     扫的是渲染出来的可见文字而不是槽位键——"键名合规、文案违规"只有扫文字才拦得住。
    for (const section of sections) {
      for (const word of PROMO_LEXICON) {
        expect(section.text, `${section.page}/${section.role}:出现营销语「${word}」`).not.toContain(word);
      }
    }

    // 五、不变量 F 的页面层回声：主按钮只长在 page-hero 与 service-invitation 上。
    //     定义层那半边由 `launch-template-set.contract.spec.ts` 逐槽位校过，这里只验实例。
    const buttonRoles = [...new Set(sections.flatMap((section) =>
      section.actions.filter((action) => action.kind === "button").map((action) => action.role)))].sort();
    expect(buttonRoles, "主按钮长到了 page-hero / service-invitation 之外").toEqual(["page-hero", "service-invitation"]);

    // 六、M5 是作品网格不是商品网格：同排固定三格，一个行动都没有。
    //     数的是卡组而不是 `img` 总数——母版里还可能有品牌标之类的非作品图，混进来会数错。
    const grids = sections.filter((section) => section.role === "creation-grid");
    expect(grids.length, "六页配方里没有用到作品网格").toBeGreaterThan(0);
    for (const grid of grids) {
      expect(cardRow(grid).length, `${grid.page}:作品网格不是同排三格`).toBe(3);
      expect(grid.actions.length, `${grid.page}:作品网格里出现了行动槽`).toBe(0);
    }
  });

  test("跨块：每页只有一个主要行动，且落在第 4 节给的落点（§7.2-B）", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => route.abort());
    await routeMedia(page);
    await routePageFixtures(page);
    await openPages(page, 1440);

    const sections = await readPages(page);
    const data = await readPageData(page);
    expect(errors, "六页渲染过程中抛出了未捕获错误").toEqual([]);

    for (const recipe of PAGE_RECIPES) {
      const pageSections = byPage(sections, recipe.page);
      const where = `/${recipe.page}`;
      // 节序也得是第 4 节的顺序——页面没有自己调换节序。
      expect(pageSections.map((section) => section.role), `${where}:节序与第 4 节不一致`).toEqual([...recipe.roles]);

      // 一、主要行动唯一：装修区块里的主按钮每页最多一个。
      const buttons = pageSections.flatMap((section) => section.actions.filter((action) => action.kind === "button"));
      expect(buttons.length, `${where}:装修区块里的主按钮不止一个`).toBeLessThanOrEqual(1);

      if (recipe.action === null) {
        // `/catalog`：第 4 节把主焦点与主要行动都放在固定业务区，装修区块一个行动都不许有。
        expect(pageSections.flatMap((section) => section.actions).map((action) => `${action.role}.${action.slot}`),
          `${where}:装修区块里出现了行动`).toEqual([]);
        continue;
      }

      // 二、落点：第 4 节点名的角色与类型（主按钮 / 次级链接）上必须有这个行动。
      const landed = pageSections.flatMap((section) => section.actions)
        .filter((action) => action.role === recipe.action!.role && action.kind === recipe.action!.kind);
      expect(landed.length, `${where}:主要行动没有落在 ${recipe.action.role} 的 ${recipe.action.kind} 上`).toBeGreaterThan(0);
      if (recipe.action.kind === "button") {
        expect(buttons.length, `${where}:有主要行动却没有主按钮`).toBe(1);
        expect(buttons[0].role, `${where}:主按钮不在 ${recipe.action.role}`).toBe(recipe.action.role);
      } else {
        // `/about`：第 4 节说主要行动是 M3 的次级链接，那么整页就不该出现主按钮。
        expect(buttons.length, `${where}:第 4 节说主要行动是次级链接，却出现了主按钮`).toBe(0);
      }

      // 三、文案原样透传：渲染出来的每一句都必须**逐字**等于夹具写进去的那句。
      //     母版不携带默认内容，所以任何差异都只能是渲染层自己换过字——这一条同时挡掉
      //     "系统示例文案"从别处泄漏进来。
      for (const section of pageSections) {
        for (const action of section.actions) {
          expect(data.expectedLabels[action.slot], `${where}:${action.slot} 不是夹具发出去的槽位`).toBeDefined();
          expect(action.label, `${where}:${action.slot} 的文案被改过`).toBe(data.expectedLabels[action.slot]);
          // 行动得是真的能走：`targetType: "page"` 加一条本站绝对路径，渲染器才认得出链接。
          expect(action.href?.startsWith("/"), `${where}:${action.slot} 不是一条可点的本站链接`).toBe(true);
        }
      }
    }

    // 四、同一页里不出现两句一模一样的行动文案。它先证明夹具自身合规（否则下一条
    //     "相邻不重复"会永远红），再证明渲染没有把同一句话复制到别的槽位上。
    for (const recipe of PAGE_RECIPES) {
      const labels = byPage(sections, recipe.page).flatMap((section) => section.actions.map((action) => action.label));
      expect(new Set(labels).size, `/${recipe.page}:同一页上出现了重复的行动文案`).toBe(labels.length);
    }
  });

  test("跨块：同页相邻两节不重复构图、不重复行动（§7.2-C）", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => route.abort());
    await routeMedia(page);
    await routePageFixtures(page);

    for (const width of [1440, 390] as const) {
      await openPages(page, width);
      const sections = await readPages(page);
      const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(errors, `${width}px`).toEqual([]);

      for (const recipe of PAGE_RECIPES) {
        const pageSections = byPage(sections, recipe.page);
        // 只比**同一页内**的相邻两节。跨页比没有意义，而且六页拼在一起之后
        // 上一页最后一节与下一页第一节在几何上确实是贴着的，`y` 会连成一片。
        for (let index = 0; index + 1 < pageSections.length; index += 1) {
          const previous = pageSections[index];
          const next = pageSections[index + 1];
          const where = `${width}px:/${recipe.page}:${previous.role}→${next.role}`;

          // 一、相邻两节不重复构图。
          expect(previous.signature, `${where}:相邻两节是同一棵树`).not.toBe(next.signature);

          // 二、相邻两节不同时是全幅。全幅 = 媒体宽撑满视口。
          const previousFull = fullBleedMedia(previous, viewportWidth).length > 0;
          const nextFull = fullBleedMedia(next, viewportWidth).length > 0;
          expect(previousFull && nextFull, `${where}:相邻两节都是全幅`).toBe(false);

          // 三、相邻两节不重复同一句行动。
          const previousLabels = new Set(previous.actions.map((action) => action.label));
          for (const action of next.actions) {
            expect(previousLabels.has(action.label), `${where}:相邻两节重复了同一句行动「${action.label}」`).toBe(false);
          }
        }
      }
    }
  });

  test("跨块：手机竖幅只给首屏，其余全幅一律不竖（§7.2-D）", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => route.abort());
    await routeMedia(page);
    await routePageFixtures(page);

    // 桌面端：全幅主视觉一律横向（M1 的画幅就是 16:9）。
    await openPages(page, 1440);
    const desktop = await readPages(page);
    const desktopWidth = await page.evaluate(() => document.documentElement.clientWidth);
    for (const section of desktop) {
      for (const item of fullBleedMedia(section, desktopWidth)) {
        expect(item.height / item.width, `${section.page}/${section.role}:桌面全幅主视觉是竖的`).toBeLessThan(1);
      }
    }

    // 手机端：竖幅只给首屏。判据是渲染出来的媒体框，不是槽位声明——
    // 声明了 4:5 却被渲染器摆成 16:9，量框才看得出来。
    await openPages(page, 390);
    const mobile = await readPages(page);
    const mobileWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(errors, "390px").toEqual([]);
    const portrait = (item: { width: number; height: number }) => item.height > item.width;
    const reading = (section: PageSection) =>
      fullBleedMedia(section, mobileWidth).map((item) => `${item.slot} ${Math.round(item.width)}×${Math.round(item.height)}`).join(" ");

    for (const recipe of PAGE_RECIPES) {
      const pageSections = byPage(mobile, recipe.page);
      for (const [index, section] of pageSections.entries()) {
        const full = fullBleedMedia(section, mobileWidth);
        if (full.length === 0) continue;
        const where = `390px:/${recipe.page}:${section.role}(${reading(section)})`;
        if (index === 0) {
          // 首屏是唯一允许竖幅的地方，而且第 3.1 节要求它**就是**竖幅：
          // 手机端首屏全幅主视觉必须是竖的，横着就是没做成"手机竖幅"。
          expect(full.some(portrait), `${where}:首屏全幅主视觉不是竖幅`).toBe(true);
        } else {
          // 首屏之外一律不竖——竖幅占掉两屏高度、把后面几节推到很深的滚动位置。
          for (const item of full) {
            expect(item.height, `${where}:首屏之外的全幅媒体仍是竖幅`).toBeLessThanOrEqual(item.width);
          }
        }
      }
    }
  });

  test("跨块：七角色与第 3.1 节三种过渡逐行一致，模型不随页面漂移（§7.2-E）", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => route.abort());
    await routeMedia(page);
    await routePageFixtures(page);

    await openPages(page, 1440);
    const sections = await readPages(page);
    const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(errors, "1440px").toEqual([]);

    // 一、每节量出来的几何必须能唯一归到第 3.1 节给它那一行的过渡。
    //     分类只看几何，不看母版身份——拿"它叫什么"去证明"它做了什么"是同义反复。
    for (const section of sections) {
      expect(classifyTransition(section, viewportWidth), `${section.page}/${section.role}:几何与角色的过渡不符 | ${sectionGeometry(section)}`)
        .toBe(ROLE_TRANSITION[section.role]);
    }

    // 二、不变量 D：根 Section 全部随内容增长；固定画幅只给首屏的桌面主舞台 Stack。
    for (const section of sections) {
      const where = `${section.page}/${section.role}`;
      expect(section.rootHeightMode, `${where}:根 Section 不应承担固定画幅`).toBe("auto");
      expect(section.rootHeightRatio, `${where}:根 Section 不应声明画幅`).toBeNull();
      if (section.role === "page-hero") {
        expect(section.stageAspectRatio, `${where}:首屏主舞台画幅不是 16:9`).toBe("16 / 9");
      } else {
        expect(section.stageAspectRatio, `${where}:只有首屏桌面主舞台该用固定画幅`).toBe("auto");
      }
    }

    // 三、手机端：文字不与主媒体左右并排——并排会让 390 宽的屏幕各剩不到 180px，
    //     中文正文一行放不下几个字。作品网格除外，它的卡组本来就是横排。
    await openPages(page, 390);
    const mobile = await readPages(page);
    expect(errors, "390px").toEqual([]);
    for (const section of mobile) {
      const where = `${section.page}/${section.role}`;
      expect(section.rootHeightMode, `${where}:手机端仍用固定画幅`).toBe("auto");
      expect(section.stageAspectRatio, `${where}:手机端主舞台仍用固定画幅`).toBe("auto");
      if (section.role === "creation-grid") continue;
      const media = primaryMedia(section);
      const text = textUnion(section);
      if (!media || !text) continue;
      expect(sideBySide(media, text) && overlapsVertically(media, text),
        `${where}:手机端文字与主媒体左右并排 | ${sectionGeometry(section)}`).toBe(false);
    }
  });

  /** §7.2-D 的正向探针：机器声明与 Renderer 最终几何必须同时保持手机 4:5。 */
  test("探针：首屏母版声明 4:5 且渲染器保留手机竖幅（§7.2-D）", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => route.abort());
    await routeMedia(page);
    await routePageFixtures(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(FIXTURE_PROBE_PATH);
    await expect(page.locator("section[data-probe]")).toHaveCount(1);

    const readings = await page.locator("section[data-probe]").evaluateAll((probes) =>
      probes.map((probe) => {
        const image = probe.querySelector("img");
        const frame = image?.closest("[data-template-slot-id]") ?? null;
        const box = frame?.getBoundingClientRect() ?? null;
        return {
          name: probe.getAttribute("data-probe")!,
          slot: frame?.getAttribute("data-template-slot-id") ?? "",
          fit: image ? getComputedStyle(image).objectFit : "",
          frameRatio: frame ? getComputedStyle(frame).aspectRatio : "",
          width: box ? Math.round(box.width) : 0,
          height: box ? Math.round(box.height) : 0,
        };
      }),
    );
    const data = await readPageData(page);
    expect(errors, "探针渲染过程中抛出了未捕获错误").toEqual([]);
    // eslint-disable-next-line no-console
    console.log(`[probe/390] ${readings.map((item) => `${item.name}:${item.width}×${item.height} fit=${item.fit} ratio=${item.frameRatio}`).join(" | ")} 声明=${JSON.stringify(data.probe)}`);

    const shipped = readings.find((item) => item.name === "as-shipped")!;
    const declared = data.probe["as-shipped"];
    expect(shipped.width, "探针没有量到媒体框").toBeGreaterThan(0);
    expect(declared.key).toBe("heroBackground");
    expect(declared.semanticRole).toBe("backgroundImage");
    expect(declared.desktop).toBe("16:9");
    expect(declared.mobile).toBe("4:5");
    expect(shipped.slot).toBe(declared.slotId);
    expect(shipped.fit, "手机 4:5 外框应由共享横图铺满，不能露出深色边").toBe("cover");
    expect(shipped.frameRatio, "渲染器没有保留手机 4:5 外框").toBe("4 / 5");
    expect(shipped.height, `${shipped.width}×${shipped.height}:手机首屏媒体框仍然不是竖向`).toBeGreaterThan(shipped.width);
    await page.screenshot({ path: testInfo.outputPath("m1-mobile-390.png"), fullPage: false });
  });

});
