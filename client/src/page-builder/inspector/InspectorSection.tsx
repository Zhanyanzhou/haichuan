/**
 * InspectorSection — 右侧模块设置面板的静态语义化分组区。
 * 分组只负责阅读与视觉分隔，内容始终直接显示，不提供任何折叠/展开交互。
 */
import type { ReactNode } from "react";

interface InspectorSectionProps {
  title: string;
  children: ReactNode;
}

export default function InspectorSection({
  title,
  children,
}: InspectorSectionProps) {
  return (
    <section className="homepage-editor__inspector-section">
      <h3 className="homepage-editor__inspector-section-head">{title}</h3>
      <div className="homepage-editor__inspector-section-body">{children}</div>
    </section>
  );
}
