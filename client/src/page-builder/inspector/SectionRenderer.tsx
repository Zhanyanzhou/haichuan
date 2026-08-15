/**
 * SectionRenderer.tsx — 渲染一个分区。
 * 2026-08-16 起折叠机制退役（用户决策：编辑面板不折叠、字段全平铺），仅静态分区。
 */
import type { ReactNode } from "react";
import InspectorSection from "./InspectorSection";

interface SectionRendererProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export default function SectionRenderer({
  title,
  description,
  children,
}: SectionRendererProps) {
  return (
    <InspectorSection title={title}>
      {description ? (
        <p className="homepage-editor__section-note">{description}</p>
      ) : null}
      {children}
    </InspectorSection>
  );
}
