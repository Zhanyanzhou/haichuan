/**
 * SectionRenderer.tsx — 渲染一个分区：静态区用 InspectorSection，折叠区用 CollapsibleSection。
 */
import type { ReactNode } from "react";
import InspectorSection from "./InspectorSection";
import CollapsibleSection from "./CollapsibleSection";

interface SectionRendererProps {
  title: string;
  description?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  children: ReactNode;
}

export default function SectionRenderer({
  title,
  description,
  collapsible,
  defaultCollapsed,
  children,
}: SectionRendererProps) {
  if (collapsible) {
    return (
      <CollapsibleSection
        title={title}
        description={description}
        defaultCollapsed={defaultCollapsed}
      >
        {children}
      </CollapsibleSection>
    );
  }
  return (
    <InspectorSection title={title}>
      {description ? (
        <p className="homepage-editor__section-note">{description}</p>
      ) : null}
      {children}
    </InspectorSection>
  );
}
