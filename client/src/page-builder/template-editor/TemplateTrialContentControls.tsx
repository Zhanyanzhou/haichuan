import { useEffect, useRef, useState } from "react";
import { Button } from "antd";

import MediaPickerField from "../fields/MediaPickerField";
import TextField from "../inspector/controls/TextField";
import type { TemplateDefinitionV2 } from "../template-definition";
import { objectPositionToPercent } from "../template-definition/imagePosition";
import { resolveTemplateSlotRules } from "../template-definition/responsive";
import { useTemplateEditorSession } from "./templateEditorSession";
import { createTemplateStressPreviewContentBySlotId } from "./templateStressPreviewEngine";
import {
  getTemplateTrialContentForSession,
  useTemplateTrialContentSession,
} from "./templateTrialContentSession";

const SUPPORTED_TRIAL_SLOT_TYPES = new Set([
  "image",
  "heading",
  "text",
  "richText",
  "button",
  "link",
]);

/** 试排独立于设计稿；预览中选择对象不会改变编辑器的选择与历史。 */
export function TemplateTrialPreviewControls({ definition, initialNodeId }: {
  definition: TemplateDefinitionV2;
  initialNodeId?: string | null;
}) {
  const previewMode = useTemplateEditorSession((state) => state.previewMode);
  const [selectedNodeId, setSelectedNodeId] = useState(initialNodeId ?? "");
  const [expanded, setExpanded] = useState(Boolean(initialNodeId));
  const controlsRef = useRef<HTMLDivElement>(null);
  const nodes = Object.values(definition.nodes).filter((node) => node.slotId
    && SUPPORTED_TRIAL_SLOT_TYPES.has(definition.slots[node.slotId]?.type));
  const selected = nodes.find((node) => node.nodeId === selectedNodeId) ?? nodes[0];
  useEffect(() => {
    if (!initialNodeId) return;
    setSelectedNodeId(initialNodeId);
    setExpanded(true);
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => {
      controlsRef.current?.querySelector<HTMLElement>("[data-template-trial-content] input:not([type=file]):not([type=hidden]),[data-template-trial-content] textarea,[data-template-trial-content] button")?.focus();
    }); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [initialNodeId]);
  if (!previewMode || !selected) return null;
  return <details className="template-editor__preview-trial" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary>自定义试排内容</summary>
    <div ref={controlsRef}>
      <p>填写后自动切到基础内容场景查看试排效果。</p>
      <label>试排对象<select aria-label="试排对象" value={selected.nodeId} onChange={(event) => setSelectedNodeId(event.target.value)}>
        {nodes.map((node) => <option key={node.nodeId} value={node.nodeId}>{node.name}</option>)}
      </select></label>
      <TemplateTrialContentControls key={selected.nodeId} definition={definition} nodeId={selected.nodeId} />
    </div>
  </details>;
}

type TrialImageValue = { src: string; alt: string };
type TrialActionValue = {
  label: string;
  __trialLink: string;
  targetType?: "page" | "external";
  pagePath?: string;
  url?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getTrialImageValue(value: unknown): TrialImageValue {
  if (!isRecord(value)) return { src: "", alt: "" };
  return {
    src: typeof value.src === "string" ? value.src : "",
    alt: typeof value.alt === "string" ? value.alt : "",
  };
}

function getTrialActionValue(value: unknown): TrialActionValue {
  if (!isRecord(value)) return { label: "", __trialLink: "" };
  const pagePath = typeof value.pagePath === "string" ? value.pagePath : "";
  const url = typeof value.url === "string" ? value.url : "";
  return {
    label: typeof value.label === "string" ? value.label : "",
    __trialLink: typeof value.__trialLink === "string" ? value.__trialLink : pagePath || url,
  };
}

function createTrialActionValue(label: string, link: string): TrialActionValue {
  const value: TrialActionValue = { label, __trialLink: link };
  const trimmed = link.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.includes("\\")) {
    value.targetType = "page";
    value.pagePath = trimmed;
  } else if (/^https:\/\/[^\s]+$/i.test(trimmed)) {
    value.targetType = "external";
    value.url = trimmed;
  }
  return value;
}

export default function TemplateTrialContentControls({
  definition,
  nodeId,
}: {
  definition: TemplateDefinitionV2;
  nodeId: string;
}) {
  const sessionId = useTemplateEditorSession((state) => state.sessionId);
  const device = useTemplateEditorSession((state) => state.device);
  const breakpoint = useTemplateEditorSession((state) => state.breakpoint);
  const previewMode = useTemplateEditorSession((state) => state.previewMode);
  const trialState = useTemplateTrialContentSession((state) => ({
    sessionId: state.sessionId,
    contentBySlotId: state.contentBySlotId,
  }));
  const setSlotContent = useTemplateTrialContentSession((state) => state.setSlotContent);
  const clearSlotContent = useTemplateTrialContentSession((state) => state.clearSlotContent);
  const node = definition.nodes[nodeId];
  const slot = node?.slotId ? definition.slots[node.slotId] : undefined;
  if (!previewMode || !sessionId || !slot || !SUPPORTED_TRIAL_SLOT_TYPES.has(slot.type)) return null;

  const sessionContent = getTemplateTrialContentForSession(trialState, sessionId);
  const hasTrialContent = Object.prototype.hasOwnProperty.call(sessionContent, slot.slotId);
  // 表单与基础试排使用同一有效内容；只改说明或链接时保留已有图片/文案。
  // 引擎按槽位自有属性识别显式清空，不能用 truthy 回退覆盖用户清空。
  const trialValue = createTemplateStressPreviewContentBySlotId(definition, "short-text", sessionContent)[slot.slotId];
  const textValue = typeof trialValue === "string" ? trialValue : "";
  const imageValue = getTrialImageValue(trialValue);
  const actionValue = getTrialActionValue(trialValue);
  const imageRules = resolveTemplateSlotRules(definition, slot.slotId, breakpoint);
  const imageAspectRatio = imageRules.aspectRatio?.replace(":", " / ");
  const imageFit = imageRules.objectFit ?? "cover";
  const imageFocus = objectPositionToPercent(imageRules.objectPosition);
  const setValue = (value: unknown) => {
    useTemplateEditorSession.getState().setPreviewScenario("short-text");
    setSlotContent(sessionId, slot.slotId, value);
  };
  const maxLength = typeof slot.validation.maxLength === "number"
    ? slot.validation.maxLength
    : undefined;

  return (
    <section
      className="homepage-editor__inspector-section template-editor__trial-content-section"
      aria-label="试排内容（仅本次编辑）"
      data-template-trial-content={slot.slotId}
    >
      <div className="homepage-editor__inspector-section-head">
        <strong>试排内容（仅本次编辑）</strong>
        <span>只检查构图，不保存到模板</span>
      </div>
      <div className="homepage-editor__inspector-section-body">
        {slot.type === "image" ? (
          <>
            <div className="homepage-editor__inspector-field" aria-label="试排图片">
              <label>试排图片</label>
              <MediaPickerField
                fieldKey={`trial:${slot.slotId}`}
                value={imageValue.src}
                placeholder="选择本次试排图片"
                sessionOnly
                device={device}
                previewAspectRatio={imageAspectRatio}
                previewFit={imageFit}
                previewFocus={imageFocus}
                onChange={(src) => setValue({ ...imageValue, src })}
              />
              <p
                className="homepage-editor__properties-hint"
                data-template-trial-image-target={breakpoint}
              >
                目标构图：{breakpoint === "tablet" ? "平板端" : breakpoint === "desktop" ? "桌面端" : "移动端"} · {imageAspectRatio ?? "自适应比例"} · {imageFit}
              </p>
            </div>
            <TextField
              label="试排图片说明"
              value={imageValue.alt}
              maxLength={160}
              placeholder="仅用于本次可读性检查"
              onChange={(alt) => setValue({ ...imageValue, alt })}
            />
          </>
        ) : null}
        {["heading", "text", "richText"].includes(slot.type) ? (
          <TextField
            label={slot.type === "heading" ? "试排标题" : slot.type === "richText" ? "试排富文本" : "试排正文"}
            value={textValue}
            rows={slot.type === "heading" ? undefined : 4}
            maxLength={maxLength}
            placeholder={Number(definition.schemaVersion) >= 3 ? "未设置试排时显示模板默认内容" : "未设置试排时显示系统中性示例"}
            onChange={setValue}
          />
        ) : null}
        {slot.type === "button" || slot.type === "link" ? (
          <>
            <TextField
              label={slot.type === "button" ? "试排按钮文案" : "试排链接文案"}
              value={actionValue.label}
              maxLength={maxLength}
              placeholder="例如：查看系列"
              onChange={(label) => setValue(createTrialActionValue(label, actionValue.__trialLink))}
            />
            <TextField
              label="试排链接"
              value={actionValue.__trialLink}
              maxLength={500}
              hint="本站路径或 HTTPS 链接；仅用于本次预览"
              placeholder="/collections/example"
              onChange={(link) => setValue(createTrialActionValue(actionValue.label, link))}
            />
          </>
        ) : null}
        {hasTrialContent ? (
          <Button size="small" onClick={() => clearSlotContent(sessionId, slot.slotId)}>
            清空当前槽位试排内容
          </Button>
        ) : (
          <small>试排值不会进入保存、发布、撤销历史或公开页面。</small>
        )}
      </div>
    </section>
  );
}
