/**
 * CollapsibleSection.tsx — 可折叠的分区容器。
 * 高级设置等低频分区默认收起；展开状态由用户控制。
 * 复用 homepage-editor__inspector-section 样式体系。
 */
import { useState, type ReactNode } from "react";

interface CollapsibleSectionProps {
  title: string;
  /** 默认是否收起（默认 true） */
  defaultCollapsed?: boolean;
  description?: string;
  children: ReactNode;
}

export default function CollapsibleSection({
  title,
  defaultCollapsed = true,
  description,
  children,
}: CollapsibleSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <section className="homepage-editor__inspector-section homepage-editor__inspector-section--collapsible">
      <h3 className="homepage-editor__inspector-section-head">
        <button
          type="button"
          className="homepage-editor__inspector-section-toggle"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((current) => !current)}
        >
          <span>{title}</span>
          <i aria-hidden>{collapsed ? "+" : "−"}</i>
        </button>
        {description ? (
          <span className="homepage-editor__inspector-section-description">
            {description}
          </span>
        ) : null}
      </h3>
      {!collapsed ? (
        <div className="homepage-editor__inspector-section-body">{children}</div>
      ) : null}
    </section>
  );
}
