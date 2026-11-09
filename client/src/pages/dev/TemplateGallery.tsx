/**
 * 旧 Hero 调试台架（dev-only），不代表当前正式模板目录。
 *
 * 仅隔离调试保留的 Hero 测试样例；动态模板验收使用现有模板设计、
 * 页面预览与公开页，覆盖相同模板版本的真实内容和双端构图。
 * 路由 /__templates 仅本地开发使用,不属于公开页面。
 */
import HeroSection from "@/components/blocks/HeroSection";
import { Link } from "react-router-dom";
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
      <section className="mx-auto max-w-5xl px-6 pt-10 text-white" aria-labelledby="legacy-hero-debug-title">
        <h1 id="legacy-hero-debug-title" className="text-2xl font-normal">旧 Hero 调试台架</h1>
        <p className="mt-4 text-sm leading-7">
          此处只展示保留的 Hero 测试样例和中性占位，不代表正式模板目录，也不能用于判定整页设计已通过验收。
        </p>
        <p className="mt-2 text-sm leading-7">
          当前动态模板请从已有编辑工作区进入“模板设计”，核对同一模板版本的桌面与手机构图，再到页面预览及对应公开页检查真实内容。
        </p>
        <Link className="mt-4 inline-flex min-h-11 items-center underline underline-offset-4" to="/admin/editor/home">
          打开现有编辑工作区
        </Link>
      </section>
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
