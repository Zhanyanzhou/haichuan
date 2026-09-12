/**
 * 模板台架（dev-only）— 真实组件渲染的模板设计视图。
 *
 * 用途:以中性占位 + 演示文字呈现模板本身的形态(布局/排印/留白/比例),
 * 不受站点壳层与存量素材干扰。对应规则第 27 条占位体系与第 33 条画布一致性。
 * 路由 /__templates 仅本地开发使用,不属于公开页面。
 */
import HeroSection from "@/components/blocks/HeroSection";
import ContentTemplateSkeletonPreview from "@/page-builder/preview/ContentTemplateSkeletonPreview";
import type { PageModule } from "@/types/pageModule";

const mk = (
  moduleType: string,
  content: Record<string, unknown>,
  layoutConfig: Record<string, unknown> = {},
  styleConfig: Record<string, unknown> = {},
): PageModule =>
  ({
    id: 0,
    pageKey: "__templates",
    moduleType,
    sortOrder: 0,
    isVisible: true,
    status: "DRAFT",
    content,
    layoutConfig,
    styleConfig,
    createdAt: "",
    updatedAt: "",
  }) as unknown as PageModule;

function Label({ no, name, note }: { no: string; name: string; note: string }) {
  return (
    <div
      style={{
        maxWidth: 1800,
        margin: "56px auto 14px",
        paddingInline: "clamp(24px,4vw,120px)",
        display: "flex",
        gap: 14,
        alignItems: "baseline",
        fontFamily: "'Cormorant Garamond','Noto Serif SC',Georgia,serif",
      }}
    >
      <span style={{ fontWeight: 300, fontSize: 26, color: "#fff" }}>{no}</span>
      <span style={{ fontSize: 13, color: "#fff", fontFamily: "Inter,system-ui,sans-serif" }}>{name}</span>
      <span
        style={{
          fontSize: 10,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "#F7F8F8",
          fontFamily: "Inter,system-ui,sans-serif",
        }}
      >
        {note}
      </span>
    </div>
  );
}

export default function TemplateGallery() {
  return (
    <div style={{ background: "#111315", minHeight: "100vh" }}>
      <div
        style={{
          maxWidth: 1800,
          margin: "0 auto",
          padding: "40px clamp(24px,4vw,120px) 8px",
          display: "flex",
          gap: 28,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div style={{ width: 300 }}>
          <div style={{ fontSize: 12, color: "#F7F8F8", letterSpacing: "0.18em", marginBottom: 8 }}>
            首屏 · 编辑器缩略图
          </div>
          <ContentTemplateSkeletonPreview moduleType="首屏主视觉" viewport="desktop" density="overview" />
        </div>
      </div>

      <Label no="01" name="首屏 hero" note="Primary · 21:9 · 居中束 · 占位状态" />
      <div style={{ maxWidth: 1800, marginInline: "auto", background: "#fff", ["--homepage-editor-viewport-height" as string]: "760px" } as React.CSSProperties}>
        <HeroSection
          editMode
          module={mk("首屏主视觉", {
            eyebrow: "Haichuan High Jewelry — Est. 1996",
            title: "缄默的诗",
            subtitle: "以金与光，写一首安静的诗。",
            actionText: "Discover the Collection",
          }, { alignment: "center" }, { textTone: "dark" })}
        />
      </div>
    </div>
  );
}
