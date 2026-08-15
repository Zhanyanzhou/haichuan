/**
 * rhythm.ts — 页面节奏规则引擎(提示级软约束,不阻断发布)。
 *
 * 输入整页 content(Puck 区块数组)与页面模式,输出节奏提示:
 * - 相邻同母版/同构图重复;
 * - 连续三个同经营分类的区块堆叠;
 * - Brand 页 CTA 过密(每 3 个区块 >1 个 CTA);
 * - 模板模式与页面模式不匹配(Brand 页出现 Commerce 母版模板,或反之)。
 *
 * 供图层栏与发布预检展示;真正的硬拦截(Commerce 专属模板上 Brand 页)
 * 由服务端发布校验承担。
 */
import { BLOCK_META } from "../config/blockMeta";
import type { DesignMode } from "./masters";

export interface RhythmInputBlock {
  type?: string;
  props?: Record<string, any>;
}

export interface RhythmHint {
  level: "info" | "warn";
  message: string;
  blockIndexes: number[];
}

const VIRTUAL_TYPES = new Set(["网站全局设置", "业务功能区"]);

const CTA_FIELDS = ["buttonText", "actionText", "primaryText"];

function hasCta(props?: Record<string, any>): boolean {
  if (!props) return false;
  return CTA_FIELDS.some(
    (field) =>
      typeof props[field] === "string" && props[field].trim().length > 0,
  );
}

function getMasterOf(type?: string): string | undefined {
  if (!type) return undefined;
  return BLOCK_META[type]?.master;
}

export function analyzePageRhythm(
  content: RhythmInputBlock[],
  pageMode: DesignMode,
): RhythmHint[] {
  const hints: RhythmHint[] = [];
  const blocks = (content ?? []).filter(
    (block) => block?.type && !VIRTUAL_TYPES.has(block.type),
  );
  // indexMap:过滤虚拟区块后在原数组中的下标,提示里指向原始位置
  const indexMap: number[] = [];
  (content ?? []).forEach((block, index) => {
    if (block?.type && !VIRTUAL_TYPES.has(block.type)) indexMap.push(index);
  });

  /* 0. 总数提示:品牌页区块超过 8 个,后半段曝光有限(2026-08-16 用户定标准 6–8) */
  if (pageMode === "brand" && blocks.length > 8) {
    hints.push({
      level: "info",
      message: `页面共 ${blocks.length} 个区块,品牌页建议控制在 6–8 个,排序靠后的区块曝光有限。`,
      blockIndexes: [],
    });
  }

  /* 1. 相邻同母版构图重复(仅排版建议,不做模式限制——模板全页面通用) */
  blocks.forEach((block, i) => {
    const meta = BLOCK_META[block.type!];
    if (!meta) return;
    const prev = i > 0 ? BLOCK_META[blocks[i - 1].type!] : undefined;
    if (prev && prev.master === meta.master) {
      hints.push({
        level: "warn",
        message: `第 ${indexMap[i - 1] + 1}、${indexMap[i] + 1} 个区块连续使用「${prev.master}」母版,构图重复;建议用留白章节或画廊调节节奏。`,
        blockIndexes: [indexMap[i - 1], indexMap[i]],
      });
    }
  });

  /* 2. 连续三个同经营分类 */
  for (let i = 2; i < blocks.length; i++) {
    const a = BLOCK_META[blocks[i - 2].type!];
    const b = BLOCK_META[blocks[i - 1].type!];
    const c = BLOCK_META[blocks[i].type!];
    if (a && b && c && a.category === b.category && b.category === c.category) {
      hints.push({
        level: "info",
        message: `第 ${indexMap[i - 2] + 1}–${indexMap[i] + 1} 个区块连续属于「${a.category}」,页面节奏趋于单一,建议穿插其他表达。`,
        blockIndexes: [indexMap[i - 2], indexMap[i - 1], indexMap[i]],
      });
    }
  }

  /* 3. Brand 页 CTA 密度:任意连续 3 个区块内 >1 个 CTA */
  if (pageMode === "brand") {
    for (let i = 0; i + 2 < blocks.length; i++) {
      const ctaCount = [0, 1, 2].filter((offset) =>
        hasCta(blocks[i + offset]?.props),
      ).length;
      if (ctaCount > 1) {
        hints.push({
          level: "info",
          message: `第 ${indexMap[i] + 1}–${indexMap[i + 2] + 1} 个区块行动入口偏密;品牌页建议每屏只保留一个主要行动。`,
          blockIndexes: [indexMap[i], indexMap[i + 1], indexMap[i + 2]],
        });
      }
    }
  }

  /* 去重:message 相同只保留一条(相邻窗口会重复触发) */
  const seen = new Set<string>();
  return hints.filter((hint) => {
    if (seen.has(hint.message)) return false;
    seen.add(hint.message);
    return true;
  });
}
