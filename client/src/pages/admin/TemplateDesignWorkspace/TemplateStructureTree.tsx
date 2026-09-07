import type { TemplateDefinitionV2 } from "@/page-builder/template-definition";

function TemplateTreeBranch({
  definition,
  nodeId,
  selectedNodeId,
  onSelect,
}: {
  definition: TemplateDefinitionV2;
  nodeId: string;
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
}) {
  const node = definition.nodes[nodeId];
  if (!node) return null;

  return (
    <li>
      <button
        type="button"
        aria-current={selectedNodeId === nodeId ? "true" : undefined}
        onClick={() => onSelect(nodeId)}
      >
        <span>{node.name}</span>
        <small>{node.type}</small>
      </button>
      {node.childIds.length > 0 ? (
        <ul>
          {node.childIds.map((childId) => (
            <TemplateTreeBranch
              key={childId}
              definition={definition}
              nodeId={childId}
              selectedNodeId={selectedNodeId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default function TemplateStructureTree({
  definition,
  selectedNodeId,
  onSelect,
}: {
  definition: TemplateDefinitionV2 | null;
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
}) {
  if (!definition) {
    return <p className="template-design-workspace__empty-note">请先新建或打开模板草稿。</p>;
  }

  return (
    <nav aria-label="模板结构树" className="template-design-workspace__tree">
      <ul>
        <TemplateTreeBranch
          definition={definition}
          nodeId={definition.rootNodeId}
          selectedNodeId={selectedNodeId}
          onSelect={onSelect}
        />
      </ul>
    </nav>
  );
}
