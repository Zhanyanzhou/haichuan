/**
 * migratePuckData.ts — 旧模板类型向新模板体系的一次性迁移(编辑器载入时执行)。
 *
 * 原则:
 * - 只在编辑器载入草稿/发布稿时转换;公开渲染器保留旧类型分支,
 *   已发布历史版本(PageDocumentRevision)不受影响,永久可渲染。
 * - 转换只做字段搬运与截断,不丢链接;超出新模板字段容量的旧文案按契约上限截断。
 * - 幂等:已是新类型的数据原样返回(浅拷贝,不改原对象)。
 *
 * 迁移映射(2026-08 模板收敛):
 * - 分割面板   → 单图海报(品牌故事,38/62;split 比例丢弃,body 并入副标题)
 * - 图文混排   → 按 template 拆解:textOnly→文字横幅(品牌宣言);
 *                imageBackground→全屏出血图(沉浸视觉);其余→单图海报
 * - 礼赠指南   → 按场景选购(分类数据原样保留)
 */
import { isSafeInternalPath } from "./linkTarget";

type PuckBlock = { type?: string; props?: Record<string, any> };
type PuckDocument = {
  content?: PuckBlock[];
  zones?: Record<string, PuckBlock[]>;
  [key: string]: any;
};

function clampText(value: unknown, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length <= max ? text : `${text.slice(0, Math.max(max - 1, 0))}…`;
}

function safeLink(value: unknown): string {
  return isSafeInternalPath(value) ? (value as string) : "";
}

function focusFallback(props: Record<string, any>) {
  const x = Number(props.focusX ?? 50);
  const y = Number(props.focusY ?? 50);
  return {
    desktopFocusX: x,
    desktopFocusY: y,
    mobileFocusX: x,
    mobileFocusY: y,
  };
}

/**
 * 条目级链接归一(2026-08-18 P1-3):
 * 旧条目的裸 link 站内路径在编辑器载入时补写跳转三件套,
 * 让统一链接字段的面板正确回显;原 link 字段保留不删,旧渲染兼容无忧。
 * 幂等:已有三件套痕迹(targetType/productId)的条目不动。
 */
const ITEM_LINK_ARRAYS: Record<string, string[]> = {
  轮播图: ["images"],
  作品画廊: ["items"],
  分类卡片: ["categories"],
  按场景选购: ["categories"],
  热区图: ["desktopHotspots", "mobileHotspots", "hotspots"],
};

function normalizeItemLinkTarget(item: Record<string, any>) {
  if (item?.targetType != null || item?.productId != null) return item;
  const link = isSafeInternalPath(item?.link) ? item.link : "";
  if (!link) return item;
  const productMatch = /^\/products\/(\d+)$/.exec(link);
  return {
    ...item,
    targetType: productMatch ? "product" : "page",
    productId: productMatch ? Number(productMatch[1]) : 0,
    linkUrl: productMatch ? "" : link,
  };
}

function normalizeItemLinks(block: PuckBlock): PuckBlock {
  const arrayKeys = ITEM_LINK_ARRAYS[block?.type ?? ""];
  if (!arrayKeys || !block?.props) return block;
  const nextProps = { ...block.props };
  let touched = false;
  for (const key of arrayKeys) {
    const list = nextProps[key];
    if (!Array.isArray(list)) continue;
    const nextList = list.map((item) =>
      item && typeof item === "object" ? normalizeItemLinkTarget(item) : item,
    );
    if (nextList.some((item, i) => item !== list[i])) {
      nextProps[key] = nextList;
      touched = true;
    }
  }
  return touched ? { ...block, props: nextProps } : block;
}

function migrateBlock(block: PuckBlock): PuckBlock {
  const p = block?.props ?? {};
  switch (block?.type) {
    case "分割面板":
      return {
        type: "单图海报",
        props: {
          ...p,
          number: "",
          label: clampText(p.subtitle, 16),
          title: clampText(p.title, 24),
          subtitle: clampText(p.body || p.subtitle, 48),
          desktopImage: p.image || "",
          mobileImage: "",
          linkUrl: safeLink(p.linkUrl),
          actionText: clampText(p.buttonText, 12) || "查看系列",
          template: p.template === "imageRight" ? "leftTextRightImage" : "leftImageRightText",
          ...focusFallback(p),
        },
      };

    case "图文混排": {
      const linkUrl = safeLink(p.linkUrl);
      if (p.template === "textOnly") {
        return {
          type: "文字横幅",
          props: {
            ...p,
            eyebrow: clampText(p.label, 60),
            title: clampText(p.title, 100),
            body: p.body || "",
            buttonText: clampText(p.buttonText, 30),
            linkUrl,
            backgroundImage: "",
            template: "center",
            bgColor: "#FBF9F6",
            textColor: "#2C2C2C",
            spacing: p.spacing === "spacious" ? "spacious" : p.spacing === "compact" ? "compact" : "normal",
          },
        };
      }
      if (p.template === "imageBackground") {
        return {
          type: "全屏出血图",
          props: {
            ...p,
            image: p.image || "",
            mobileImage: "",
            title: clampText(p.title, 24),
            subtitle: clampText(p.body, 48),
            buttonText: clampText(p.buttonText, 12),
            linkUrl,
            targetType: p.targetType || "none",
            productId: Number(p.productId) || 0,
            template: "textCenter",
            overlayPreset: "soft",
            altText: clampText(p.imageAlt, 80),
            ...focusFallback(p),
          },
        };
      }
      return {
        type: "单图海报",
        props: {
          ...p,
          number: "",
          label: clampText(p.label, 16),
          title: clampText(p.title, 24),
          subtitle: clampText(p.body, 48),
          desktopImage: p.image || "",
          mobileImage: "",
          linkUrl,
          actionText: clampText(p.buttonText, 12) || "查看系列",
          template: p.template === "textRightImageLeft" ? "leftImageRightText" : "leftTextRightImage",
          ...focusFallback(p),
        },
      };
    }

    case "礼赠指南":
      return {
        type: "按场景选购",
        props: {
          ...p,
          title: p.title || "礼赠选款",
          subtitle: p.subtitle || "不必猜测心意，从送礼对象开始挑选。",
        },
      };

    default:
      return block;
  }
}

/** 迁移整份 Puck 文档(content 与全部 zones)。幂等;不修改入参。 */
export function migratePuckData<T extends PuckDocument>(data: T): T {
  if (!data || typeof data !== "object") return data;
  const next: PuckDocument = { ...data };
  // 存量清洗(2026-08-16 用户决策:全部模块可删):历史草稿中仅业务功能区允许保持锁定。
  const unlock = (block: any) => {
    if (block?.type === "业务功能区") return block;
    if (block?.props?.locked) {
      return { ...block, props: { ...block.props, locked: false } };
    }
    return block;
  };
  if (Array.isArray(next.content)) {
    next.content = next.content.map((block) =>
      normalizeItemLinks(unlock(migrateBlock(block))),
    );
  }
  if (next.zones && typeof next.zones === "object") {
    next.zones = Object.fromEntries(
      Object.entries(next.zones).map(([zoneKey, blocks]) => [
        zoneKey,
        Array.isArray(blocks)
          ? blocks.map((block) => normalizeItemLinks(unlock(migrateBlock(block))))
          : blocks,
      ]),
    );
  }
  return next as T;
}
