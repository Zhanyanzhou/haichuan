/**
 * InspectorSection — 右侧模块设置面板的可折叠分组区。
 * 默认展开/折叠由 defaultOpen 控制；用户切换在会话内保持（组件内 state）。
 */
import { useEffect, useState, type ReactNode } from "react";

interface InspectorSectionProps {
  title: string;
  defaultOpen?: boolean;
  /** 切换模块时重置折叠状态，避免沿用上一个模板的展开记录。 */
  resetKey?: string;
  children: ReactNode;
}

export default function InspectorSection({
  title,
  defaultOpen = true,
  resetKey,
  children,
}: InspectorSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen, resetKey]);

  return (
    <section className="homepage-editor__inspector-section">
      <button
        type="button"
        className="homepage-editor__inspector-section-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{title}</span>
        <span className="homepage-editor__inspector-section-icon" aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open && <div className="homepage-editor__inspector-section-body">{children}</div>}
    </section>
  );
}
