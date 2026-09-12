import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  compileDynamicTemplateRenderPlan,
  DynamicTemplateRenderer,
  resolveEditableTargets,
  type DynamicTemplateResponsiveRules,
  type TemplateDefinitionV2,
} from "../../src/page-builder/template-definition";
import { getContentTemplateContract } from "../../src/page-builder/generated/contentTemplates.generated";
import EditableTargetOverlay, {
  type OverlayTargetDescriptor,
} from "../../src/page-builder/template-editor/EditableTargetOverlay";
import TemplateViewportFrame from "../../src/page-builder/template-editor/TemplateViewportFrame";
import { createTemplatePreviewContentBySlotId } from "../../src/page-builder/template-editor/templatePreviewModel";
import "../../src/styles/adminLuxury.css";
import "../../src/pages/admin/HomepageConfig/editor.css";
import "../../src/page-builder/template-editor/TemplateWorkspace.css";

const autoRules = (
  display: DynamicTemplateResponsiveRules["display"] = "block",
): DynamicTemplateResponsiveRules => ({
  display,
  order: 0,
  width: "fill",
  height: { mode: "auto" },
});

function createDefinition(): TemplateDefinitionV2 {
  return {
    schemaVersion: 1,
    templateId: "tpl_geometry",
    name: "几何映射测试",
    description: "宿主覆盖层真实浏览器测试",
    metadata: {
      category: "测试",
      purpose: "几何验收",
      layoutType: "自由布局",
      slotSummary: "图片和标题",
      recommendedFor: ["home"],
      desktopRatio: "16:10",
      mobileRatio: "390:844",
      mobileBreakpoint: 720,
      visualRole: "primary-stage",
      headerCompatibility: ["solid"],
      tags: ["测试"],
    },
    rootNodeId: "node_root",
    nodes: {
      node_root: {
        nodeId: "node_root",
        type: "Section",
        name: "模板根节点",
        childIds: ["node_stack"],
        props: { semanticTag: "section" },
        responsive: { desktop: autoRules(), mobile: autoRules() },
        hidden: false,
      },
      node_stack: {
        nodeId: "node_stack",
        type: "Stack",
        name: "自由布局容器",
        childIds: ["node_image", "node_heading"],
        props: {},
        responsive: {
          desktop: {
            ...autoRules(),
            layoutMode: "free",
            height: { mode: "fixed", value: { value: 680, unit: "px" } },
          },
          mobile: {
            ...autoRules(),
            layoutMode: "free",
            height: { mode: "fixed", value: { value: 844, unit: "px" } },
          },
        },
        hidden: false,
      },
      node_image: {
        nodeId: "node_image",
        type: "ImageSlot",
        name: "主视觉图片",
        slotId: "slot_image",
        childIds: [],
        props: {},
        responsive: {
          desktop: {
            ...autoRules(),
            placement: { x: 0.08, y: 0.12, width: 0.52, height: 0.7, zIndex: 0 },
          },
          mobile: {
            ...autoRules(),
            placement: { x: 0.06, y: 0.08, width: 0.88, height: 0.52, zIndex: 0 },
          },
        },
        hidden: false,
      },
      node_heading: {
        nodeId: "node_heading",
        type: "HeadingSlot",
        name: "标题",
        slotId: "slot_heading",
        childIds: [],
        props: {},
        responsive: {
          desktop: {
            ...autoRules(),
            placement: { x: 0.58, y: 0.34, width: 0.34, height: 0.24, zIndex: 1 },
          },
          mobile: {
            ...autoRules(),
            placement: { x: 0.08, y: 0.66, width: 0.84, height: 0.2, zIndex: 1 },
          },
        },
        hidden: false,
      },
    },
    slots: {
      slot_image: {
        slotId: "slot_image",
        key: "heroImage",
        type: "image",
        label: "主视觉图片",
        required: true,
        editable: true,
        hideable: false,
        validation: {},
        desktopRules: { aspectRatio: "4:3", objectFit: "cover", objectPosition: "center center" },
        mobileRules: { aspectRatio: "4:5", objectFit: "cover", objectPosition: "center center" },
      },
      slot_heading: {
        slotId: "slot_heading",
        key: "heading",
        type: "heading",
        label: "标题",
        required: true,
        editable: true,
        hideable: false,
        validation: { minLength: 1, maxLength: 80 },
        desktopRules: { fontRole: "display", fontSize: { value: 3, unit: "rem" }, maxLines: 2 },
        mobileRules: { fontRole: "heading", fontSize: { value: 2, unit: "rem" }, maxLines: 3 },
      },
    },
    defaultContent: {
      slot_image: {
        src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 3'%3E%3Crect width='4' height='3' fill='%23deddd8'/%3E%3C/svg%3E",
        alt: "中性占位",
      },
      slot_heading: "共享几何覆盖层",
    },
  };
}

function GeometryFixture() {
  const [definition, setDefinition] = useState(createDefinition);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>("node:node_image");
  const [compactHost, setCompactHost] = useState(false);
  const [catalogHost, setCatalogHost] = useState<HTMLDivElement | null>(null);
  const [catalogFrame, setCatalogFrame] = useState<HTMLIFrameElement | null>(null);
  const [catalogSource, setCatalogSource] = useState<HTMLDivElement | null>(null);
  const content = useMemo(() => createTemplatePreviewContentBySlotId(definition), [definition]);
  const targets = useMemo(() => {
    const compiled = compileDynamicTemplateRenderPlan(definition, {
      device,
      contentBySlotId: content,
      showEmptySlots: true,
    });
    return compiled.ok
      ? resolveEditableTargets(definition, compiled.plan, getContentTemplateContract)
      : [];
  }, [content, definition, device]);
  const overlayTargets = useMemo<OverlayTargetDescriptor[]>(() => [
    ...targets,
    {
      targetId: "role:node_heading:locked-title",
      ownerNodeId: "node_heading",
      source: "builtin-contract-role",
      contractRoleId: "locked-title",
      kind: "title",
      label: "锁定结构标题角色",
      capabilities: ["select", "content", "focus"],
      locator: { attributes: ["data-template-node-id"], value: "node_heading" },
    },
  ], [targets]);
  const movableTargetIds = useMemo(() => new Set(targets.flatMap((target) =>
    target.source === "definition-node"
      && target.capabilities.includes("structure")
      && definition.nodes[target.ownerNodeId]?.responsive[device].placement
      ? [target.targetId]
      : [],
  )), [definition, device, targets]);
  const sourceWidth = device === "desktop" ? 1920 : 390;
  const sourceHeight = device === "desktop" ? 1200 : 844;

  const mutateGeometry = () => setDefinition((current) => {
    const next = structuredClone(current);
    const placement = next.nodes.node_image.responsive[device].placement!;
    next.nodes.node_image.responsive[device].placement = {
      ...placement,
      x: placement.x === 0.18 ? 0.08 : 0.18,
      y: placement.y === 0.2 ? 0.12 : 0.2,
      width: placement.width === 0.44 ? 0.52 : 0.44,
    };
    return next;
  });

  return (
    <main>
      <header>
        <button type="button" onClick={() => setDevice("desktop")}>桌面端 1920×1200</button>
        <button type="button" onClick={() => setDevice("mobile")}>移动端 390×844</button>
        <button type="button" onClick={mutateGeometry}>修改源节点几何</button>
        <button type="button" onClick={() => setCompactHost((current) => !current)}>切换宿主尺寸</button>
        <button
          type="button"
          onClick={() => setDefinition((current) => {
            const next = structuredClone(current);
            next.nodes.node_stack.childIds.reverse();
            return next;
          })}
        >重排源节点</button>
        <button
          type="button"
          onClick={() => setDefinition((current) => {
            const next = structuredClone(current);
            const rules = next.nodes.node_stack.responsive[device];
            const currentHeight = rules.height.mode === "fixed" ? rules.height.value.value : sourceHeight;
            rules.height = { mode: "fixed", value: { value: currentHeight === sourceHeight ? sourceHeight + 180 : sourceHeight, unit: "px" } };
            return next;
          })}
        >切换内容高度</button>
        <button
          type="button"
          onClick={() => setDefinition((current) => {
            const next = structuredClone(current);
            next.nodes.node_heading.hidden = !next.nodes.node_heading.hidden;
            return next;
          })}
        >
          切换标题 DOM
        </button>
        <button
          type="button"
          onClick={() => setSelectedTargetId("role:node_heading:locked-title")}
        >
          选择锁定标题角色
        </button>
        <output aria-label="当前设备">{device}</output>
        <output aria-label="当前目标">{selectedTargetId}</output>
      </header>
      <section
        className="geometry-stage template-editor__stage"
        aria-label="共享覆盖层画布"
        style={{ width: compactHost ? 720 : "100%" }}
      >
        <TemplateViewportFrame
          fallbackHeight={sourceHeight}
          sourceWidth={sourceWidth}
          autoHeight={false}
          heightMode="fixed"
          ratioLabel={`${sourceWidth}:${sourceHeight}`}
          minWidth={320}
          maxWidth={2400}
          resizable={false}
          title="几何映射隔离画布"
          onWidthChange={() => undefined}
          onHeightChange={() => undefined}
          onHeightModeChange={() => undefined}
          onRatioChange={() => undefined}
          canRestore={false}
          deviceLabel={device}
          onRestore={() => undefined}
          onDirectResizePreview={() => undefined}
          onDirectResizeCancel={() => undefined}
          onDirectResizeCommit={() => undefined}
          hasSelection={Boolean(selectedTargetId)}
          overlayTargets={overlayTargets}
          selectedOverlayTargetId={selectedTargetId}
          movableOverlayTargetIds={movableTargetIds}
          resizeOverlayTargetIds={movableTargetIds}
          onOverlayTargetSelect={(target) => setSelectedTargetId(target.targetId)}
        >
          <DynamicTemplateRenderer
            definition={definition}
            device={device}
            contentBySlotId={content}
            mode="editor"
            editorSurface="template-definition"
            interactionOwner="host-overlay"
          />
        </TemplateViewportFrame>
      </section>

      <section aria-label="目录共享覆盖层" className="catalog-fixture">
        <div ref={setCatalogHost} className="catalog-host">
          <iframe
            ref={setCatalogFrame}
            title="目录几何隔离画布"
            srcDoc="<!doctype html><html><body><div id='catalog-root'></div></body></html>"
            onLoad={(event) => {
              const root = event.currentTarget.contentDocument?.getElementById("catalog-root");
              if (!root) return;
              const source = event.currentTarget.contentDocument!.createElement("div");
              source.setAttribute("data-template-node-id", "node_image");
              source.style.cssText = "position:absolute;left:40px;top:30px;width:180px;height:120px;background:#deddd8";
              root.replaceChildren(source);
              setCatalogSource(source);
            }}
          />
          <EditableTargetOverlay
            sourceFrame={catalogFrame}
            sourceRoot={catalogSource?.parentElement ?? null}
            hostRoot={catalogHost}
            targets={targets.filter((target) => target.targetId === "node:node_image") as OverlayTargetDescriptor[]}
            surface="catalog"
            annotations
          />
        </div>
      </section>

      {(["public", "preview", "thumbnail"] as const).map((mode) => (
        <section key={mode} aria-label={`${mode}隔离面`} data-isolation-surface={mode}>
          <DynamicTemplateRenderer
            definition={definition}
            device={device}
            contentBySlotId={content}
            mode={mode}
          />
        </section>
      ))}
      <section aria-label="page-instance隔离面" data-isolation-surface="page-instance">
        <DynamicTemplateRenderer
          definition={definition}
          device={device}
          contentBySlotId={content}
          mode="editor"
          editorSurface="page-instance"
        />
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<GeometryFixture />);
