import {
  createBlankDynamicTemplateDefinition,
  createDynamicTemplateNode,
  createDynamicTemplateSlotDefinition,
  createDynamicTemplateStableId,
  getDynamicTemplateNodeTypeForSlot,
} from "../template-definition/nodeRegistry";
import type {
  DynamicTemplateBoxSpacing,
  DynamicTemplateLength,
  DynamicTemplateMetadata,
  DynamicTemplateNodeType,
  DynamicTemplateResponsiveOverride,
  DynamicTemplateResponsiveRules,
  DynamicTemplateSlotRules,
  DynamicTemplateSlotType,
  TemplateDefinitionV2,
} from "../template-definition/generated/templateDefinition.generated";
import { validateDynamicTemplatePublishDefinition } from "../template-definition/validateTemplateDefinition";
import { RESPONSIVE_CANVAS } from "../config/blockContracts";
import { SECTION_ROLES, type TemplateSectionRole } from "./presets";
import { TEMPLATE_TYPE_SCALE, type TemplateTypeLevel } from "./typographyScale";

/**
 * 首发母版集（M1～M7）的定义源。
 *
 * 本文件是 `docs/page-builder/launch-template-set.md` 第 3 节七棵骨架的可执行版本，
 * 与 `client/tests/launch-template-set.contract.spec.ts` 的 `MASTERS` 是同一份合同的三个面：
 * 文档写意图，合同 spec 锁父子边，本文件给出真正的定义。**改一处必须同时改另外两处。**
 *
 * 服从的不变量（文档第 2 节 A–I）：
 * - A/B：根是一个只承担一节的 `Section`，只有一个直接子节点「区块主体 `Stack`」；
 *   边距、间距、背景都落在这个 Stack 上，不落在根上。
 * - C：结构只用 Section、Stack、Container、Row、Column、Grid 六种。
 * - D：除 M1 的桌面主舞台画幅外，根与每个容器的高度方式一律 `auto`。
 * - E：桌面是基准，手机只覆盖真正改过的项——因此手机端一律**整体替换**成母版自己声明的
 *   覆盖对象（`createDynamicTemplateNode` 默认把桌面规则克隆给手机，那不是"只覆盖改过的项"）。
 * - F：一块模板最多一个 ButtonSlot，只出现在 M1 与 M7 上；其余角色的行动槽位是 LinkSlot。
 * - G/H/I：不出现价格、库存与促销；色值取 UI_GUIDE 第 4.1 节共享底盘，标题字重取排印 Scale。
 *
 * 三条落笔口径（文档第 3 节的裁决，这里逐块执行）：
 * 1. 推荐画幅落在**主图外框**上（`slotRules.aspectRatio`），不落在根高度上；唯一例外是 M1 的
 *    桌面主舞台——它承载前后景叠加，用 `aspect-ratio` 而不是固定像素高度。
 * 2. 槽位一律 `editable: true`、`hideable: true`、`required: false`：机器合同里
 *    「必填 + 可隐藏」是直接报错的组合（`PUBLISH_REQUIRED_SLOT_PAGE_HIDE_CONFLICT`），
 *    而不变量 I 又要求槽位一律可隐藏；两块母版都不写死公开内容，必填只由页面自己的值满足。
 * 3. 圆角一律取第 7.3 节的「无」档（0）：渲染器不给未声明的圆角任何默认值，
 *    这里只在文档点名处（M1 背景图、两个主行动）显式写出 0，其余留给 0 的默认渲染结果。
 *
 * `defaultContent` 与 `previewContent` 恒为空对象：D.40 之后公开必填只由页面自己的值满足，
 * 母版不携带任何可作为公开内容的默认文案。
 */

// ── UI_GUIDE 第 4.1 节共享色彩底盘（一律 6 位十六进制，无 alpha）───────────────
const MAIN_INK = "#181A1B";
const SECONDARY_INK = "#5F6568";
const DARK_CANVAS = "#111315";
const INVERSE_INK = "#F7F8F8";

// ── template-creation-rules 第 7.3 节档位 ────────────────────────────────────
/** 区域间距·宽松：主要分区之间。 */
const REGION_GAP = 48;
/** 基础间距·宽松：相关内容之间（事实条目、时间与地点）。 */
const BASE_GAP = 24;
/** 基础间距·标准：同一区组内更紧的相关内容（分栏、卡组、图与图）。 */
const TIGHT_GAP = 16;
/** 内容边距·宽松：相对画布短边的比例，随画布计算，不写死像素。 */
const CONTENT_EDGE = 8;
/** 手机分栏改单列后的行距。 */
const MOBILE_ROW_GAP = 24;

// ── UI_GUIDE 第 2.6 节行长上限（正文每行 ≤ 45 字）换算出的框宽 ────────────────
/** 正文 15px × 45 字。 */
const BODY_LINE_MAX = 680;
/** 单列展开时标题的行长上限，避免 1920 下一行拉满画布。 */
const HEADING_MAX = 900;
const SUBTITLE_MAX = 760;
const DISPLAY_MAX = 1080;

const LAUNCH_CATEGORY = "首发母版";
/** 画布预览基准宽：文档第 3 节所有比例都按 1440 画布计算。 */
const PREVIEW_DESKTOP_WIDTH = 1440;

function px(value: number): DynamicTemplateLength {
  return { value, unit: "px" };
}

function pct(value: number): DynamicTemplateLength {
  return { value, unit: "%" };
}

function edges(
  top: DynamicTemplateLength,
  right: DynamicTemplateLength,
  bottom: DynamicTemplateLength,
  left: DynamicTemplateLength,
): DynamicTemplateBoxSpacing {
  return { top, right, bottom, left };
}

/** 每次返回新对象：定义会被编辑器复制改写，不共享可变引用。 */
function contentPadding(): DynamicTemplateBoxSpacing {
  return edges(px(REGION_GAP), pct(CONTENT_EDGE), px(REGION_GAP), pct(CONTENT_EDGE));
}

function zeroPadding(): DynamicTemplateBoxSpacing {
  return edges(px(0), px(0), px(0), px(0));
}

/**
 * 语义字号层级 → 两端槽位规则。桌面写全，手机只写真正变化的字号；
 * 其余项（字体、字重、行距、颜色、对齐）由机器合同按平铺合并从桌面继承。
 */
function slotTextRules(
  level: TemplateTypeLevel,
  overrides: DynamicTemplateSlotRules = {},
): { desktopRules: DynamicTemplateSlotRules; mobileRules: DynamicTemplateSlotRules } {
  const scale = TEMPLATE_TYPE_SCALE[level];
  const isHeading = scale.fontRole === "display" || scale.fontRole === "heading";
  return {
    desktopRules: {
      fontFamily: isHeading ? "serif" : "system",
      fontRole: scale.fontRole,
      fontSize: px(scale.desktop),
      fontWeight: scale.weight,
      // 第 2.6 节：标题行距 1.2～1.4（字越大越紧），正文 1.6～2.0（字越小越松）。
      lineHeight: isHeading ? 1.3 : level === "caption" ? 1.6 : 1.7,
      textAlign: "left",
      overflow: "wrap",
      color: MAIN_INK,
      ...overrides,
    },
    mobileRules: { fontSize: px(scale.mobile) },
  };
}

interface SlotSpec {
  type: DynamicTemplateSlotType;
  key: string;
  label: string;
  semanticRole?: string;
  desktopRules: DynamicTemplateSlotRules;
  mobileRules: DynamicTemplateSlotRules;
}

interface NodeSpec {
  /** 母版内唯一后缀，决定确定性的节点标识。 */
  id: string;
  type: DynamicTemplateNodeType;
  name: string;
  /** 桌面是基准：这里写出的项整体铺在节点原语的默认规则上。 */
  desktop?: Partial<DynamicTemplateResponsiveRules>;
  /** 手机只覆盖真正改过的项；`placement: null` 是机器合同认可的"显式退出定位"。 */
  mobile?: DynamicTemplateResponsiveOverride;
  slot?: SlotSpec;
  children?: NodeSpec[];
}

interface TextSlotSpec {
  id: string;
  name: string;
  key: string;
  label: string;
  level: TemplateTypeLevel;
  semanticRole?: string;
  /** 只作用于桌面与手机合并后的结果；手机按平铺合并继承。 */
  rules?: DynamicTemplateSlotRules;
  desktop?: Partial<DynamicTemplateResponsiveRules>;
  mobile?: DynamicTemplateResponsiveOverride;
}

interface ImageSlotSpec {
  id: string;
  name: string;
  key: string;
  label: string;
  /** 桌面外框比例，也是"推荐画幅"的落点。 */
  ratio: string;
  mobileRatio?: string;
  fit?: "cover" | "contain";
  semanticRole?: string;
  desktop?: Partial<DynamicTemplateResponsiveRules>;
  mobile?: DynamicTemplateResponsiveOverride;
}

/**
 * 内容槽位：节点类型由槽位类型推出，避免两处各写一遍而漂移。
 * `house` 词汇里的行动槽位标签同用正文层级——UI_GUIDE 未设独立的按钮层级。
 */
function textSlot(type: "heading" | "text" | "richText" | "link" | "button", spec: TextSlotSpec): NodeSpec {
  const { desktopRules, mobileRules } = slotTextRules(spec.level, spec.rules);
  return {
    id: spec.id,
    type: getDynamicTemplateNodeTypeForSlot(type),
    name: spec.name,
    desktop: spec.desktop,
    mobile: spec.mobile,
    slot: {
      type,
      key: spec.key,
      label: spec.label,
      ...(spec.semanticRole ? { semanticRole: spec.semanticRole } : {}),
      desktopRules,
      mobileRules,
    },
  };
}

function imageSlot(spec: ImageSlotSpec): NodeSpec {
  const frame = { objectFit: spec.fit ?? "cover", objectPosition: "center center" } as const;
  return {
    id: spec.id,
    type: "ImageSlot",
    name: spec.name,
    desktop: spec.desktop,
    mobile: spec.mobile,
    slot: {
      type: "image",
      key: spec.key,
      label: spec.label,
      ...(spec.semanticRole ? { semanticRole: spec.semanticRole } : {}),
      desktopRules: { aspectRatio: spec.ratio, ...frame },
      mobileRules: { aspectRatio: spec.mobileRatio ?? spec.ratio, ...frame },
    },
  };
}

function structure(
  id: string,
  type: "Stack" | "Row" | "Column" | "Grid" | "Container",
  name: string,
  children: NodeSpec[],
  desktop: Partial<DynamicTemplateResponsiveRules> = {},
  mobile: DynamicTemplateResponsiveOverride = {},
): NodeSpec {
  return { id, type, name, children, desktop, mobile };
}

/**
 * 区块主体 Stack：边距、间距与背景落在这里，不落在根上（不变量 B）。
 * 桌面用区域间距·宽松。手机收到下一档，左右边距用 UI_GUIDE 的 20px，
 * 避免 390px 上仍留着 48px 分区距，把作品卡挤成一屏留白。
 */
function blockBody(
  children: NodeSpec[],
  desktop: Partial<DynamicTemplateResponsiveRules> = {},
): NodeSpec {
  return structure("body", "Stack", "区块主体", children, {
    gap: px(REGION_GAP),
    padding: contentPadding(),
    height: { mode: "auto" },
    ...desktop,
  }, {
    gap: px(MOBILE_ROW_GAP),
    padding: edges(px(32), px(20), px(32), px(20)),
  });
}

/** 左右图文的两列：桌面等宽两栏，手机改单列（不变量 E 覆盖）。 */
function splitRow(media: NodeSpec, text: NodeSpec): NodeSpec {
  return structure(
    "split",
    "Row",
    "图文分栏",
    [media, text],
    { gap: px(REGION_GAP), alignItems: "start" },
    { direction: "column", gap: px(MOBILE_ROW_GAP) },
  );
}

interface MasterSpec {
  role: TemplateSectionRole;
  /** 模板名，同时是根 `Section` 的节点名（合同 spec 里逐字对照的那一个）。 */
  title: string;
  description: string;
  layoutType: string;
  /** 与 `SECTION_RECOMMENDATIONS[role].ratios` 对齐，可交叉自证。 */
  desktopRatio: string;
  visualRole: "primary-stage" | "feature-stage" | "support-stage";
  recommendedFor: string[];
  body: NodeSpec;
}

/**
 * M1 页面首屏：全幅主视觉 + 前景叠加。
 * 七块里唯一一处固定画幅——`Stack 主舞台` 桌面 free + 16:9，手机 flow + auto。
 * 前景用 `Container` 而不是 `Stack`：机器合同不允许 `Stack` 直接包含 `Stack`（文档第 2.1 节）。
 */
const PAGE_HERO: MasterSpec = {
  role: "page-hero",
  title: "页面首屏",
  description: "全幅主视觉承载页面级标题与主行动；手机把文字移到图下，不做叠加。",
  layoutType: "全幅图片 + 内容覆盖",
  desktopRatio: "16:9",
  visualRole: "primary-stage",
  recommendedFor: ["home", "about", "products", "catalog", "custom", "contact"],
  body: {
    id: "stage",
    type: "Stack",
    name: "主舞台",
    desktop: {
      layoutMode: "free",
      height: { mode: "aspect-ratio", ratio: { width: 16, height: 9 } },
      // 窄桌面（768～1023 仍走桌面规则）下 16:9 会矮到装不下标题与副标题，
      // 给一个高度下限兜住不溢出；宽于下限时仍按 16:9 长高。
      minHeight: px(560),
      backgroundColor: DARK_CANVAS,
      // 必须为 0：叠放子项的百分比定位会用 --template-content-pad-* 做内缩补偿，
      // 这里的 padding 一旦非 0，全幅背景就不再真正出血。
      padding: zeroPadding(),
    },
    mobile: {
      layoutMode: "flow",
      height: { mode: "auto" },
      // 手机断点"只覆盖改过的项"，没写的从桌面继承：桌面那份为窄桌面备下的
      // minHeight 会原样漏到手机上，把流式内容顶到 560px，底部多出一段
      // 说不出用途的深色空白（实测 390px 下内容只有 500.6px）。合同只对
      // anchor/placement 支持 null 删除，所以这里显式写 0 把下限退掉。
      minHeight: px(0),
      padding: zeroPadding(),
    },
    children: [
      imageSlot({
        id: "background",
        name: "背景图",
        key: "heroBackground",
        label: "背景图",
        ratio: "16:9",
        mobileRatio: "4:5",
        semanticRole: "backgroundImage",
        // 铺满画布、无圆角（文档第 3 节 M1 槽位表）。
        desktop: { placement: { x: 0, y: 0, width: 1, height: 1, zIndex: 0 }, radius: px(0), width: "fill" },
        // 手机是流式：图回到文档流顶部，文字落在图下。
        mobile: { placement: null, width: "fill" },
      }),
      {
        id: "foreground",
        type: "Container",
        name: "前景",
        desktop: {
          // Container 的默认 display 是 block，前后景叠加要显式改成纵向 flex。
          display: "flex",
          direction: "column",
          alignItems: "center",
          justifyContent: "end",
          // 前景的 Logo→标题→副标题→主行动是**同一个区组**，按第 7.3 节取基础间距·标准，
          // 与同一个容器的手机分支同档。这里原本写的是原值 20px：既不在第 7.3 节的档位上
          // （基础 12/16/24/32、区域 24/32/48/64），也不对应属性面板能命名的任何预设，
          // 与文件开头"圆角与间距一律走第 7.3 节"的落笔口径自相矛盾。
          gap: px(TIGHT_GAP),
          padding: edges(px(0), pct(CONTENT_EDGE), px(96), pct(CONTENT_EDGE)),
          placement: { x: 0, y: 0.3, width: 1, height: 0.7, zIndex: 2 },
          width: "fill",
        },
        mobile: {
          // 手机不再叠加：内容在图下自成一段，靠上排布。
          placement: null,
          justifyContent: "start",
          gap: px(TIGHT_GAP),
          padding: edges(px(24), px(20), px(40), px(20)),
        },
        children: [
          imageSlot({
            id: "logo",
            name: "Logo",
            key: "logo",
            label: "Logo",
            ratio: "3:1",
            fit: "contain",
            semanticRole: "logo",
            // 画幅是固定 16:9（本套唯一一处），前景又定高 0.7——定高 flex 里
            // 图片槽会被渲染器加上 overflow:hidden（DynamicTemplateRenderer），
            // flex 自动最小尺寸因此变成 0，标题一涨行数 Logo 就被静默压成 0px
            // （768 下 2 行标题实测 132x44 → 132x0）。min-height 是这里唯一
            // 能挡住压缩的杠杆：44 = 132/3，与固定宽度焊死，永不致变形；
            // 挤不下时改为整块内容向上溢出，而不是抹掉品牌标记。
            desktop: { width: px(132), minHeight: px(44) },
            // 手机端必须显式退掉：合并时会继承桌面值，而验收断言手机端任何
            // 节点不得有正 min-height（流式排版本就无挤压问题）。
            mobile: { width: px(104), minHeight: px(0) },
          }),
          textSlot("heading", {
            id: "title",
            name: "页面主标题",
            key: "title",
            label: "页面主标题",
            level: "display",
            rules: { color: INVERSE_INK, textAlign: "center" },
            desktop: { maxWidth: px(DISPLAY_MAX) },
          }),
          textSlot("text", {
            id: "subtitle",
            name: "副标题",
            key: "subtitle",
            label: "副标题",
            level: "subtitle",
            // maxLines 在渲染器里是硬截断（line-clamp），给 3 行足够长中文收尾；
            // 定死 2 行会与"1440×900 下副标题不裁切"的验收打架。
            rules: { color: INVERSE_INK, textAlign: "center", maxLines: 3 },
            desktop: { maxWidth: px(SUBTITLE_MAX) },
          }),
          textSlot("button", {
            id: "action",
            name: "主行动",
            key: "primaryAction",
            label: "主行动",
            level: "body",
            // 深色画布上用反色按钮（UI_GUIDE 第 4.2 节）。
            rules: { color: MAIN_INK, textAlign: "center", fontRole: "action" },
            desktop: {
              width: "fit",
              backgroundColor: INVERSE_INK,
              radius: px(0),
              padding: edges(px(16), px(32), px(16), px(32)),
            },
          }),
        ],
      },
    ],
  },
};

/** M2 系列叙事：一个系列 + 一张氛围副图。文字列更短，副图有明确的主副层级。 */
const COLLECTION_STORY: MasterSpec = {
  role: "collection-story",
  title: "系列叙事",
  description: "一个系列加一张氛围副图；桌面左图右文，手机改为上图下文。",
  layoutType: "左图右文",
  desktopRatio: "3:2",
  visualRole: "feature-stage",
  recommendedFor: ["home", "products"],
  body: blockBody([
    splitRow(
      structure(
        "media",
        "Column",
        "媒体列",
        [
          imageSlot({
            id: "hero",
            name: "主图",
            key: "collectionHero",
            label: "主图",
            ratio: "3:2",
            semanticRole: "heroImage",
            desktop: { width: "fill" },
          }),
          imageSlot({
            id: "secondary",
            name: "副图",
            key: "collectionSecondary",
            label: "副图",
            ratio: "3:2",
            mobileRatio: "4:5",
            semanticRole: "secondaryImage",
            // 副图要明显小于主图，否则同一列里两块一样大，主副层级消失。
            desktop: { width: "fill", maxWidth: px(420) },
            mobile: { maxWidth: px(240) },
          }),
        ],
        { gap: px(TIGHT_GAP) },
      ),
      structure(
        "text",
        "Column",
        "文字列",
        [
          textSlot("heading", {
            id: "label",
            name: "系列名",
            key: "collectionLabel",
            label: "系列名",
            level: "subtitle",
            rules: { color: SECONDARY_INK },
          }),
          textSlot("heading", { id: "title", name: "主标题", key: "title", label: "主标题", level: "h1" }),
          textSlot("text", {
            id: "description",
            name: "描述",
            key: "description",
            label: "描述",
            level: "body",
            rules: { color: SECONDARY_INK },
            desktop: { maxWidth: px(BODY_LINE_MAX) },
          }),
          textSlot("link", {
            id: "link",
            name: "次级链接",
            key: "secondaryLink",
            label: "次级链接",
            level: "body",
            desktop: { width: "fit" },
          }),
        ],
        { gap: px(TIGHT_GAP) },
      ),
    ),
  ]),
};

/** M3 左右图文：一个说明 + 两张细节图。与 M2 不是彼此的复制品。 */
const EDITORIAL_SPLIT: MasterSpec = {
  role: "editorial-split",
  title: "左右图文",
  description: "一段说明配一张主图与两张细节副图；手机三张图统一 4:5，副图组仍并排。",
  layoutType: "左图右文",
  desktopRatio: "3:2",
  visualRole: "feature-stage",
  recommendedFor: ["home", "products", "about", "custom", "contact"],
  body: blockBody([
    splitRow(
      structure(
        "media",
        "Column",
        "媒体列",
        [
          imageSlot({
            id: "hero",
            name: "主图",
            key: "splitHero",
            label: "主图",
            ratio: "3:2",
            mobileRatio: "4:5",
            semanticRole: "heroImage",
            desktop: { width: "fill" },
          }),
          // 副图组保持横排：手机只收窄不动排布，主副层级比堆成单列更重要。
          structure(
            "details",
            "Row",
            "副图组",
            [
              imageSlot({
                id: "detailA",
                name: "副图 1",
                key: "splitDetailA",
                label: "副图 1",
                ratio: "1:1",
                mobileRatio: "4:5",
                semanticRole: "secondaryImage",
                desktop: { width: "fill" },
              }),
              imageSlot({
                id: "detailB",
                name: "副图 2",
                key: "splitDetailB",
                label: "副图 2",
                ratio: "1:1",
                mobileRatio: "4:5",
                semanticRole: "secondaryImage",
                desktop: { width: "fill" },
              }),
            ],
            { gap: px(TIGHT_GAP) },
          ),
        ],
        { gap: px(TIGHT_GAP) },
      ),
      structure(
        "text",
        "Column",
        "文字列",
        [
          textSlot("heading", { id: "title", name: "主标题", key: "title", label: "主标题", level: "h1" }),
          textSlot("text", {
            id: "description",
            name: "描述",
            key: "description",
            label: "描述",
            level: "body",
            rules: { color: SECONDARY_INK },
            desktop: { maxWidth: px(BODY_LINE_MAX) },
          }),
          textSlot("link", {
            id: "link",
            name: "次级链接",
            key: "secondaryLink",
            label: "次级链接",
            level: "body",
            desktop: { width: "fit" },
          }),
        ],
        { gap: px(TIGHT_GAP) },
      ),
    ),
  ]),
};

/**
 * M4 工艺细节：竖构图主图 + 图文分栏，下面一条横向副图带。
 * 描述用 `RichTextSlot`——工序是可列举的步骤，不是一段散文；七块里唯一一处富文本描述。
 */
const CRAFT_DETAIL: MasterSpec = {
  role: "craft-detail",
  title: "工艺细节",
  description: "竖构图主图配逐步说明，下接一条两张的细节图带；手机副图带由两列改单列。",
  layoutType: "左图右文",
  desktopRatio: "4:5",
  visualRole: "feature-stage",
  recommendedFor: ["home", "products", "about", "custom"],
  body: blockBody([
    splitRow(
      structure(
        "media",
        "Column",
        "媒体列",
        [
          imageSlot({
            id: "hero",
            name: "主图",
            key: "craftHero",
            label: "主图",
            ratio: "4:5",
            semanticRole: "heroImage",
            desktop: { width: "fill" },
          }),
        ],
      ),
      structure(
        "text",
        "Column",
        "文字列",
        [
          textSlot("heading", {
            id: "step",
            name: "步骤名",
            key: "stepLabel",
            label: "步骤名",
            level: "subtitle",
            rules: { color: SECONDARY_INK },
          }),
          textSlot("heading", { id: "title", name: "主标题", key: "title", label: "主标题", level: "h1" }),
          textSlot("richText", {
            id: "description",
            name: "描述",
            key: "description",
            label: "描述",
            level: "body",
            rules: { color: SECONDARY_INK },
            desktop: { maxWidth: px(BODY_LINE_MAX) },
          }),
          textSlot("link", {
            id: "link",
            name: "次级链接",
            key: "secondaryLink",
            label: "次级链接",
            level: "body",
            desktop: { width: "fit" },
          }),
        ],
        { gap: px(TIGHT_GAP) },
      ),
    ),
    // 副图是细节图不是商品卡：桌面横排两张，手机单列（第 3.1 节的商品卡两列规则不适用）。
    structure(
      "strip",
      "Grid",
      "副图条",
      [
        imageSlot({
          id: "detailA",
          name: "副图 1",
          key: "craftDetailA",
          label: "副图 1",
          ratio: "3:2",
          semanticRole: "secondaryImage",
          desktop: { width: "fill" },
        }),
        imageSlot({
          id: "detailB",
          name: "副图 2",
          key: "craftDetailB",
          label: "副图 2",
          ratio: "3:2",
          semanticRole: "secondaryImage",
          desktop: { width: "fill" },
        }),
      ],
      { columns: [1, 1], gap: px(TIGHT_GAP) },
      { columns: [1] },
    ),
  ]),
};

/**
 * M5 作品网格：首发固定三格，展示已审核作品，不绑定商品、不显示品名。
 * 将来做绑定商品的网格必须另立一块母版。
 */
const CREATION_GRID: MasterSpec = {
  role: "creation-grid",
  title: "作品网格",
  description: "标题加一段说明，下接三格等宽作品；卡比例两端不变，手机由三列改两列。",
  layoutType: "卡片式布局",
  desktopRatio: "4:5",
  visualRole: "feature-stage",
  recommendedFor: ["home", "products"],
  body: blockBody([
    textSlot("heading", {
      id: "title",
      name: "主标题",
      key: "title",
      label: "主标题",
      level: "h1",
      desktop: { maxWidth: px(HEADING_MAX) },
    }),
    textSlot("text", {
      id: "description",
      name: "描述",
      key: "description",
      label: "描述",
      level: "body",
      rules: { color: SECONDARY_INK },
      desktop: { maxWidth: px(BODY_LINE_MAX) },
    }),
    structure(
      "works",
      "Grid",
      "作品卡组",
      [
        // 三格是并列关系，没有主副之分，因此不声明语义角色。
        imageSlot({ id: "workA", name: "作品图 1", key: "workA", label: "作品图 1", ratio: "4:5", desktop: { width: "fill" } }),
        imageSlot({ id: "workB", name: "作品图 2", key: "workB", label: "作品图 2", ratio: "4:5", desktop: { width: "fill" } }),
        imageSlot({ id: "workC", name: "作品图 3", key: "workC", label: "作品图 3", ratio: "4:5", desktop: { width: "fill" } }),
      ],
      { columns: [1, 1, 1], gap: px(TIGHT_GAP) },
      // 只存两端列数：768～1439px 的栏数减少是几何适配，不另存一套内容。
      { columns: [1, 1] },
    ),
  ]),
};

/**
 * M6 品牌事实：随内容增长的上图下文，主角是可核验的事实，不是影像。
 * 主图受控宽度（960）而不是铺满画布——铺满会把事实条目压到首屏之外。
 */
const MAISON_FACT: MasterSpec = {
  role: "maison-fact",
  title: "品牌事实",
  description: "受控宽度的主图加品牌名、标题与三条可核验事实，整体居中；手机事实条目由两列改单列。",
  layoutType: "中央主体",
  desktopRatio: "auto",
  visualRole: "support-stage",
  recommendedFor: ["about", "home"],
  body: blockBody(
    [
      imageSlot({
        id: "hero",
        name: "主图",
        key: "factHero",
        label: "主图",
        ratio: "3:2",
        semanticRole: "heroImage",
        desktop: { width: "fill", maxWidth: px(960) },
        mobile: { maxWidth: pct(100) },
      }),
      // 品牌名落在 H2（24/20）而主标题落在 H1（34/28）：两块相邻的 34px 衬线行
      // 会读成同一级，这里主动拉开一级，仍在 UI_GUIDE 第 2.3 节的层级内。
      textSlot("heading", {
        id: "brand",
        name: "品牌名称",
        key: "brandName",
        label: "品牌名称",
        level: "h2",
        rules: { color: SECONDARY_INK, textAlign: "center" },
      }),
      textSlot("heading", {
        id: "title",
        name: "主标题",
        key: "title",
        label: "主标题",
        level: "h1",
        rules: { textAlign: "center" },
        desktop: { maxWidth: px(HEADING_MAX) },
      }),
      structure(
        "facts",
        "Grid",
        "事实条目",
        [
          textSlot("text", {
            id: "factA",
            name: "事实 1",
            key: "factA",
            label: "事实 1",
            level: "body",
            rules: { color: SECONDARY_INK, textAlign: "center" },
          }),
          textSlot("text", {
            id: "factB",
            name: "事实 2",
            key: "factB",
            label: "事实 2",
            level: "body",
            rules: { color: SECONDARY_INK, textAlign: "center" },
          }),
          textSlot("text", {
            id: "factC",
            name: "事实 3",
            key: "factC",
            label: "事实 3",
            level: "body",
            rules: { color: SECONDARY_INK, textAlign: "center" },
          }),
        ],
        { columns: [1, 1], gap: px(BASE_GAP), maxWidth: px(880) },
        { columns: [1] },
      ),
      textSlot("link", {
        id: "link",
        name: "次级链接",
        key: "secondaryLink",
        label: "次级链接",
        level: "body",
        rules: { textAlign: "center" },
        desktop: { width: "fit" },
      }),
      imageSlot({
        id: "logo",
        name: "Logo",
        key: "logo",
        label: "Logo",
        ratio: "3:1",
        fit: "contain",
        semanticRole: "logo",
        desktop: { width: px(132) },
        mobile: { width: px(104) },
      }),
    ],
    // 中央主体默认居中（第 7.3 节）。
    { alignItems: "center" },
  ),
};

/**
 * M7 服务邀请：与 M6 共用同一种构图（随内容增长的上图下文），差别在槽位与禁区。
 * 这是有意的——两块母版不该在母版层再分叉出两种构图。
 */
const SERVICE_INVITATION: MasterSpec = {
  role: "service-invitation",
  title: "服务邀请",
  description: "宽幅主图加邀请标题、时间与地点，收在一个主行动上；手机时间与地点由两列改单列。",
  layoutType: "上图下文",
  desktopRatio: "16:9",
  visualRole: "feature-stage",
  recommendedFor: ["contact", "custom", "home"],
  body: blockBody([
    imageSlot({
      id: "hero",
      name: "主图",
      key: "invitationHero",
      label: "主图",
      ratio: "16:9",
      semanticRole: "heroImage",
      desktop: { width: "fill" },
    }),
    textSlot("heading", {
      id: "title",
      name: "主标题",
      key: "title",
      label: "主标题",
      level: "h1",
      desktop: { maxWidth: px(HEADING_MAX) },
    }),
    structure(
      "facts",
      "Grid",
      "时间与地点",
      [
        textSlot("text", {
          id: "time",
          name: "时间",
          key: "time",
          label: "时间",
          level: "body",
          rules: { color: SECONDARY_INK },
        }),
        textSlot("text", {
          id: "location",
          name: "地点",
          key: "location",
          label: "地点",
          level: "body",
          rules: { color: SECONDARY_INK },
        }),
      ],
      { columns: [1, 1], gap: px(BASE_GAP) },
      { columns: [1] },
    ),
    textSlot("button", {
      id: "action",
      name: "主行动",
      key: "primaryAction",
      label: "主行动",
      level: "body",
      // 浅色画布上用近黑底反色字（UI_GUIDE 第 4.2 节）。
      rules: { color: INVERSE_INK, fontRole: "action" },
      desktop: {
        width: "fit",
        backgroundColor: MAIN_INK,
        radius: px(0),
        padding: edges(px(16), px(32), px(16), px(32)),
      },
    }),
    imageSlot({
      id: "logo",
      name: "Logo",
      key: "logo",
      label: "Logo",
      ratio: "3:1",
      fit: "contain",
      semanticRole: "logo",
      desktop: { width: px(132) },
      mobile: { width: px(104) },
    }),
  ]),
};

const MASTER_SPECS: MasterSpec[] = [
  PAGE_HERO,
  COLLECTION_STORY,
  EDITORIAL_SPLIT,
  CRAFT_DETAIL,
  CREATION_GRID,
  MAISON_FACT,
  SERVICE_INVITATION,
];

function sectionRoleLabel(role: TemplateSectionRole): string {
  const entry = SECTION_ROLES.find(([value]) => value === role);
  if (!entry) throw new Error(`未知的区块角色：${role}`);
  return entry[1];
}

/**
 * 把母版声明的节点树落成定义。标识全部由角色推导，因此两次调用得到同一份定义。
 */
function materialize(templateId: string, spec: NodeSpec, definition: TemplateDefinitionV2): string {
  const nodeId = spec.id === "root" ? `${templateId}_root` : `${templateId}_node_${spec.id}`;
  let slotId: string | undefined;
  if (spec.slot) {
    const expected = getDynamicTemplateNodeTypeForSlot(spec.slot.type);
    if (expected !== spec.type) {
      throw new Error(`${spec.name}：槽位类型 ${spec.slot.type} 只能落在 ${expected} 上，不能落在 ${spec.type} 上。`);
    }
    slotId = `${templateId}_slot_${spec.slot.key}`;
    const slot = createDynamicTemplateSlotDefinition(spec.slot.type, spec.slot.label, spec.slot.key);
    slot.slotId = slotId;
    if (spec.slot.semanticRole) slot.semanticRole = spec.slot.semanticRole;
    slot.emptyPolicy = "hide";
    slot.desktopRules = { ...slot.desktopRules, ...spec.slot.desktopRules };
    // 槽位规则是平铺合并：只写变化的项，其余从桌面继承。
    slot.mobileRules = { ...slot.mobileRules, ...spec.slot.mobileRules };
    definition.slots[slotId] = slot;
  }
  const node = createDynamicTemplateNode(spec.type, spec.name, slotId);
  node.nodeId = nodeId;
  // 手机整体替换：原语默认把桌面默认规则克隆给手机，那不是"只覆盖改过的项"（不变量 E）。
  node.responsive = {
    desktop: { ...node.responsive.desktop, ...(spec.desktop ?? {}) },
    mobile: { ...(spec.mobile ?? {}) },
  };
  node.childIds = (spec.children ?? []).map((child) => materialize(templateId, child, definition));
  definition.nodes[nodeId] = node;
  return nodeId;
}

function summarizeSlots(definition: TemplateDefinitionV2): string {
  let image = 0;
  let content = 0;
  for (const slot of Object.values(definition.slots)) {
    if (slot.type === "image") image += 1;
    else content += 1;
  }
  return `${image} 个图片槽位，${content} 个内容槽位`;
}

/** 母版必须在定义阶段就过发布契约，不把问题留到运营点发布时才暴露。 */
function assertPublishable(definition: TemplateDefinitionV2): void {
  const result = validateDynamicTemplatePublishDefinition(definition);
  const errors = result.issues.filter((issue) => issue.level === "error");
  if (result.valid && errors.length === 0) return;
  const reported = (errors.length > 0 ? errors : result.issues).map((issue) => issue.message).join("；");
  throw new Error(`${definition.name}：发布契约不通过——${reported}`);
}

/**
 * 母版自身的标识：`tpl_launch_<role>`。这是"七块母版"这份定义集的身份，`findLaunchTemplateMaster`
 * 与合同 spec 都靠它，因此它是确定性的，两次构建得到同一个值。
 *
 * 注意它与"从母版派生出来的模板实例"的标识是两件事，见 `instantiateLaunchTemplateMaster`。
 */
function masterTemplateId(role: TemplateSectionRole): string {
  return `tpl_launch_${role.replace(/-/g, "_")}`;
}

function buildMaster(spec: MasterSpec, templateId: string = masterTemplateId(spec.role)): TemplateDefinitionV2 {
  const definition = createBlankDynamicTemplateDefinition(spec.title);
  definition.templateId = templateId;
  definition.schemaVersion = 3;
  definition.description = spec.description;
  definition.nodes = {};
  definition.slots = {};
  definition.rootNodeId = materialize(
    templateId,
    {
      id: "root",
      type: "Section",
      name: spec.title,
      // 根只承担一节，画幅与间距都不落在根上（不变量 A、B）。
      desktop: { layoutMode: "flow", height: { mode: "auto" } },
      children: [spec.body],
    },
    definition,
  );
  definition.metadata = {
    ...definition.metadata,
    category: LAUNCH_CATEGORY,
    purpose: sectionRoleLabel(spec.role),
    sectionRole: spec.role,
    layoutType: spec.layoutType,
    slotSummary: summarizeSlots(definition),
    recommendedFor: [...spec.recommendedFor],
    desktopRatio: spec.desktopRatio,
    // 手机一律随内容增长：推荐画幅落在主图外框上，不落在根高度上（第 3 节说明 1）。
    mobileRatio: "auto",
    previewDesktopWidth: PREVIEW_DESKTOP_WIDTH,
    previewMobileWidth: RESPONSIVE_CANVAS.mobile.width,
    visualRole: spec.visualRole,
    tags: [LAUNCH_CATEGORY, spec.title],
  };
  assertPublishable(definition);
  return definition;
}

// 定义只构建一次：下面的清单与权威定义集共用同一批对象，不允许各自再建一份。
const MASTER_BUILDS: ReadonlyArray<{ definition: TemplateDefinitionV2; spec: MasterSpec }> =
  MASTER_SPECS.map((spec) => ({ definition: buildMaster(spec), spec }));

/** 七块首发母版的权威定义集，顺序即文档第 3 节的 M1～M7。 */
export const LAUNCH_TEMPLATE_MASTERS: readonly TemplateDefinitionV2[] =
  MASTER_BUILDS.map(({ definition }) => definition);

/**
 * 面向界面的七条摘要：模板设计入口据此列出可用的设计起点。
 *
 * `definition` 就是 `LAUNCH_TEMPLATE_MASTERS` 里的那一份母版对象本身（只读地展示与校验用）。
 * 要从它开始做模板，走 `instantiateLaunchTemplateMaster`——直接拿母版对象去建模板会撞上
 * `templateId` 全局唯一。展示字段全部读自母版自己的声明（`MasterSpec`）或已生成的定义，
 * 因此这里不存在第二份数据源。
 */
export interface LaunchTemplateMasterEntry {
  role: TemplateSectionRole;
  /** 角色中文名，与七步向导第 1 步同一套词表（`SECTION_ROLES`）。 */
  roleLabel: string;
  templateId: string;
  name: string;
  description: string;
  layoutType: string;
  desktopRatio: string;
  visualRole: NonNullable<DynamicTemplateMetadata["visualRole"]>;
  recommendedFor: readonly string[];
  slotSummary: string;
  definition: TemplateDefinitionV2;
}

export const LAUNCH_TEMPLATE_MASTER_ENTRIES: readonly LaunchTemplateMasterEntry[] =
  MASTER_BUILDS.map(({ definition, spec }) => ({
    role: spec.role,
    roleLabel: sectionRoleLabel(spec.role),
    templateId: definition.templateId,
    name: spec.title,
    description: spec.description,
    layoutType: spec.layoutType,
    desktopRatio: spec.desktopRatio,
    visualRole: spec.visualRole,
    recommendedFor: spec.recommendedFor,
    slotSummary: definition.metadata.slotSummary,
    definition,
  }));

export function findLaunchTemplateMaster(
  role: TemplateSectionRole,
): TemplateDefinitionV2 | undefined {
  return LAUNCH_TEMPLATE_MASTERS.find((definition) => definition.metadata.sectionRole === role);
}

/**
 * 从某一块母版派生一份**新的**模板定义：节点树、槽位、响应式与母版逐节点相同，只有标识换成传入的
 * `templateId`（不传就现场生成一个稳定的新 id）。
 *
 * 为什么实例必须换标识：`DynamicTemplate.templateId` 在库里是 `@unique`（`schema.prisma`），
 * 而 `@@unique([ownerId, name])` 只管同一账号下的模板名。实例若沿用母版的 `tpl_launch_<role>`，
 * 整个部署里每块母版就只可能存在一份，第二个想从 M1 起步的人会撞上一个与他的操作对不上的 409。
 * 母版自己的 id 仍然是确定性的——那是这份定义集的身份，不是实例的身份。
 *
 * 实例与母版的联系保留在 `metadata.sectionRole` 上，不靠 id 前缀。重复从同一块母版起步时，
 * 模板重名仍会被 `@@unique([ownerId, name])` 拦下，此时由模板设计者在编辑器里改名。
 */
export function instantiateLaunchTemplateMaster(
  role: TemplateSectionRole,
  templateId: string = createDynamicTemplateStableId("tpl"),
): TemplateDefinitionV2 | undefined {
  const build = MASTER_BUILDS.find(({ spec }) => spec.role === role);
  return build ? buildMaster(build.spec, templateId) : undefined;
}
