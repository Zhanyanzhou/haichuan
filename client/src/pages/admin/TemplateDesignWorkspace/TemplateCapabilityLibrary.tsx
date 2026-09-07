import {
  getDynamicTemplateNodeRegistryEntry,
  type DynamicTemplateNodeType,
} from "@/page-builder/template-definition";
import type { TemplateAuthoringInsertRequest } from "./templateAuthoringAdapter";

const CAPABILITY_GROUPS: ReadonlyArray<{
  key: "section" | "pattern" | "slot";
  label: string;
  nodeTypes: readonly DynamicTemplateNodeType[];
}> = [
  {
    key: "section",
    label: "Section 结构",
    nodeTypes: ["Container", "Grid", "Row", "Column", "Stack"],
  },
  {
    key: "pattern",
    label: "Pattern 构图",
    nodeTypes: [
      "HeroTemplate",
      "GalleryTemplate",
      "DoublePosterTemplate",
      "TextBannerTemplate",
    ],
  },
  {
    key: "slot",
    label: "Slot 槽位",
    nodeTypes: [
      "ImageSlot",
      "HeadingSlot",
      "TextSlot",
      "ButtonSlot",
      "ProductSlot",
    ],
  },
];

export default function TemplateCapabilityLibrary({
  disabled,
  onInsert,
}: {
  disabled: boolean;
  onInsert: (request: TemplateAuthoringInsertRequest) => void;
}) {
  return (
    <div
      className="template-design-workspace__capabilities"
      aria-label="Section、Pattern 与 Slot 能力"
    >
      {CAPABILITY_GROUPS.map((group) => (
        <section key={group.key} className="template-design-workspace__capability-group">
          <h3>{group.label}</h3>
          <div className="template-design-workspace__capability-list">
            {group.nodeTypes.map((nodeType) => (
              <button
                key={nodeType}
                type="button"
                disabled={disabled}
                data-template-insert-source="capability-library"
                data-template-node-type={nodeType}
                onClick={() => onInsert({
                  source: "capability-library",
                  nodeType,
                })}
              >
                {getDynamicTemplateNodeRegistryEntry(nodeType).label}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
