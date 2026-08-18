/**
 * specCheck.ts — 图片规格检查的单一来源(2026-08-18 P1-5)。
 *
 * 尺寸探测 hook 与比例容差此前散落三处(MediaPickerField/MediaField/ImageStatus),
 * 各自 8% / 8% / 8%/24% 不一;统一为同源常量与同一探测实现。
 * 注:MediaField 与其内部 MediaPickerField 仍各自挂载一个探测 hook
 * (同 URL 双探测由浏览器 HTTP 缓存缓解);后续若要真正单次探测,
 * 需提升为共享 context,此处先收敛容差与实现。
 */
import { useEffect, useState } from "react";
import type { MediaSpec } from "./MediaPickerField";

/** 比例偏差 ≤ 8% 判定「尺寸合适」 */
export const SPEC_TOLERANCE_GOOD = 0.08;
/** 比例偏差 ≤ 24% 判定「轻微偏差」,超出为「高风险」 */
export const SPEC_TOLERANCE_WATCH = 0.24;

/** 探测图片真实尺寸(供比例/清晰度检查;组件卸载或 URL 变化时取消) */
export function useImageNaturalSize(url: string | undefined): {
  loaded: boolean;
  width: number;
  height: number;
  error: boolean;
} {
  const [state, setState] = useState({
    loaded: false,
    width: 0,
    height: 0,
    error: false,
  });

  useEffect(() => {
    if (!url || url.trim().length === 0) {
      setState({ loaded: false, width: 0, height: 0, error: false });
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        setState({
          loaded: true,
          width: img.naturalWidth,
          height: img.naturalHeight,
          error: false,
        });
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        setState({ loaded: false, width: 0, height: 0, error: true });
      }
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}

/** 实际宽高相对规格的比例偏差(0~∞) */
export function ratioDeviation(
  spec: Pick<MediaSpec, "width" | "height"> | undefined,
  actualWidth: number,
  actualHeight: number,
): number | null {
  if (!spec || actualWidth === 0 || actualHeight === 0) return null;
  const targetRatio = spec.width / spec.height;
  return Math.abs(actualRatio(actualWidth, actualHeight) - targetRatio) / targetRatio;
}

function actualRatio(width: number, height: number) {
  return width / height;
}

/** 对比推荐尺寸与实际尺寸,返回匹配状态;无规格或未加载返回 null */
export function sizeMatchStatus(
  spec: MediaSpec | undefined,
  actualWidth: number,
  actualHeight: number,
): "good" | "watch" | "risk" | null {
  const deviation = ratioDeviation(spec, actualWidth, actualHeight);
  if (deviation === null) return null;
  if (deviation <= SPEC_TOLERANCE_GOOD) return "good";
  if (deviation <= SPEC_TOLERANCE_WATCH) return "watch";
  return "risk";
}
