import { cloneElement, isValidElement, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { getContentTemplateContract } from "../generated/contentTemplates.generated";
import {
  ContentTemplateLayoutStyles,
  getContentTemplateLayout,
  templateLayoutVars,
} from "../layout/contentTemplateLayouts";

interface ContentTemplateContractFrameProps {
  moduleType: string;
  mode: "editor" | "public";
  children: ReactNode;
}

type ContractFrameStyle = CSSProperties & Record<`--hc-contract-${string}`, string | number>;

const EDITOR_SURFACE_CSS = `
.hc-contract-frame { width: 100%; min-width: 0; }
.hc-contract-frame--editor {
  --hc-contract-canvas: #FCFCFB;
  --hc-contract-surface: #F5F5F3;
  --hc-contract-surface-strong: #E4E3DF;
  --hc-contract-ink: #222222;
  --hc-contract-muted: #66645F;
  --hc-contract-line: #D7D5D0;
  --hc-contract-accent: #B8944E;
  color: var(--hc-contract-ink);
  background: var(--hc-contract-canvas);
}
.hc-contract-frame--editor[data-contract-tone="dark"] {
  --hc-contract-canvas: #171717;
  --hc-contract-surface: #242424;
  --hc-contract-surface-strong: #363636;
  --hc-contract-ink: #F8F7F4;
  --hc-contract-muted: #C5C3BE;
  --hc-contract-line: #55524D;
}
.hc-contract-frame--editor > :where(section, div),
.hc-contract-frame--editor :where(section.hc-section) {
  background: var(--hc-contract-canvas) !important;
  color: var(--hc-contract-ink) !important;
}
.hc-contract-frame--editor :where(h1, h2, h3, h4, p, strong, small, figcaption) {
  color: inherit !important;
}
.hc-contract-frame--editor :where([class*="empty"], [class*="placeholder"]) {
  border-color: var(--hc-contract-line) !important;
  background: var(--hc-contract-surface) !important;
  box-shadow: none !important;
}
.hc-contract-frame--editor :where([aria-current="true"], [class*="pagination"], [class*="handle"], [class*="hotspot"], [class*="action"], [class*="countdown"]) {
  --hc-gold: var(--hc-contract-accent);
}
.hc-contract-frame--editor :where(article, figure, [class*="card"]) {
  box-shadow: none !important;
}
@media (max-width: 767px) {
  .hc-contract-frame--editor { overflow-x: clip; }
}
`;

/**
 * 三条真实渲染链路共用的 schema v2 根框架。
 * 它只提供合同元数据、响应式比例变量与编辑画布中性表面；子节点始终是
 * adapter / 公开 Renderer 的真实输出，不在这里重新实现模板构图。
 */
export default function ContentTemplateContractFrame({
  moduleType,
  mode,
  children,
}: ContentTemplateContractFrameProps) {
  const contract = getContentTemplateContract(moduleType);
  const layout = getContentTemplateLayout(moduleType);
  if (!contract || !layout) return <>{children}</>;

  const style: ContractFrameStyle = {
    ...templateLayoutVars(layout),
    "--hc-contract-container":
      layout.width === "full" ? "100%" : layout.width === "wide" ? "1520px" : layout.width === "editorial" ? "1040px" : "1280px",
  };
  const renderedChild = mode === "editor" && isValidElement(children)
    ? cloneElement(children as ReactElement<{ editMode?: boolean }>, { editMode: true })
    : children;

  return (
    <div
      className={`hc-contract-frame hc-contract-frame--${mode}`}
      style={style}
      data-content-template-contract={contract.key}
      data-content-template-module={moduleType}
      data-content-template-renderer="real"
      data-contract-tone={contract.preview.desktop.tone}
      data-contract-visual-role={contract.visualRole}
      data-contract-height-desktop={contract.heightModeByViewport.desktop}
      data-contract-height-tablet={contract.heightModeByViewport.tablet}
      data-contract-height-mobile={contract.heightModeByViewport.mobile}
      data-contract-order-desktop={contract.order.desktop.join(",")}
      data-contract-order-tablet={contract.order.tablet.join(",")}
      data-contract-order-mobile={contract.order.mobile.join(",")}
      data-contract-role-count={contract.roles.length}
    >
      <ContentTemplateLayoutStyles />
      {mode === "editor" ? <style data-hc-contract-editor-surface>{EDITOR_SURFACE_CSS}</style> : null}
      {renderedChild}
    </div>
  );
}
