/**
 * sectionShell.tsx — Canvas Design System 的 Section 外壳。
 *
 * 所有装修区块最终都应经由 DecorSection 渲染:
 * - 宽度档(width token)/ 密度(Brand/Commerce)/ 留白三档 / 配色预设统一在此收敛;
 * - DesignSystemStyles 幂等注入基础 token(公开页与编辑器 iframe 均可用);
 * - 区块自身只负责内容构图,不再自定 maxWidth / 纵向 padding / 字体串 / 色值。
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import {
  DESIGN_SYSTEM_BASE_CSS,
  TONE_PRESETS,
  WIDTHS,
  type DensityMode,
  type SpacingLevel,
  type ToneKey,
  type WidthToken,
} from "./tokens";
import { MASTERS, type MasterId } from "./masters";

type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

/** 幂等注入 Design System 基础样式(同 document 只注入一次)。 */
export function DesignSystemStyles() {
  if (
    typeof document !== "undefined" &&
    document.querySelector("style[data-hc-ds-base]")
  ) {
    return null;
  }
  return <style data-hc-ds-base>{DESIGN_SYSTEM_BASE_CSS}</style>;
}

export interface DecorSectionProps
  extends Omit<HTMLAttributes<HTMLElement>, "children" | "color"> {
  master: MasterId;
  /** 内容宽度档;缺省取母版定义 */
  width?: WidthToken;
  /** 双模式密度;缺省取母版 mode */
  density?: DensityMode;
  /** 纵向留白三档(紧凑/标准/宽松) */
  spacing?: SpacingLevel;
  /** 配色预设(写入 --hc-bg/--hc-ink/--hc-muted/--hc-gold/--hc-line) */
  tone?: ToneKey;
  /** 兼容存量数据的原始背景色(优先级高于 tone 的 bg) */
  background?: string;
  /** 通栏区块(Hero/沉浸图/尾章):不吃纵向节奏留白;显式传 "flow" 可覆盖母版的 bleed 默认 */
  flow?: "bleed" | "flow";
  /** 旧写法:等价于 flow="bleed" */
  bleed?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export function DecorSection({
  master: masterId,
  width,
  density,
  spacing = "normal",
  tone,
  background,
  flow,
  bleed,
  className,
  style,
  children,
  ...sectionProps
}: DecorSectionProps) {
  const master = MASTERS[masterId];
  const widthToken: WidthToken = width ?? master.width;
  const densityMode: DensityMode = density ?? master.mode;
  const tonePreset = tone ? TONE_PRESETS[tone] : null;
  const isBleed =
    flow != null
      ? flow === "bleed"
      : bleed || master.flow === "bleed" || widthToken === "full";

  const sectionVars: CSSVars = {
    "--hc-py-base":
      densityMode === "brand"
        ? "var(--hc-py-brand)"
        : "var(--hc-py-commerce)",
    ...(tonePreset
      ? {
          "--hc-bg": tonePreset.bg,
          "--hc-ink": tonePreset.ink,
          "--hc-muted": tonePreset.muted,
          "--hc-gold": tonePreset.gold,
          "--hc-line": tonePreset.line,
        }
      : {}),
  };

  return (
    <section
      {...sectionProps}
      className={`hc-section${className ? ` ${className}` : ""}`}
      data-density={densityMode}
      data-spacing={spacing}
      data-flow={isBleed ? "bleed" : "flow"}
      style={{
        ...sectionVars,
        position: "relative",
        background: background ?? tonePreset?.bg,
        ...style,
      } as CSSProperties}
    >
      <DesignSystemStyles />
      {widthToken === "full" ? (
        children
      ) : (
        <div
          className="hc-section__inner"
          style={{
            maxWidth: WIDTHS[widthToken],
            marginInline: "auto",
            paddingInline: "var(--hc-px)",
          }}
        >
          {children}
        </div>
      )}
    </section>
  );
}
