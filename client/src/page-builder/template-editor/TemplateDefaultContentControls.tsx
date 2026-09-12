import { useState } from "react";
import TextField from "../inspector/controls/TextField";
import NumberField from "../inspector/controls/NumberField";
import SwitchField from "../inspector/controls/SwitchField";
import MediaPickerField from "../fields/MediaPickerField";
import {
  getDynamicTemplateStructureLockOwnerId,
  type TemplateDefinitionV2,
} from "../template-definition";
import { resetTemplateNodeRule, resetTemplateSlotRule, resolveTemplateNodeRules, resolveTemplateSlotRules, setTemplateNodeRule, setTemplateSlotRule, type TemplateBreakpoint } from "../template-definition/responsive";
import { useTemplateEditorSession } from "./templateEditorSession";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const colorError = (value: string) => /^#[0-9a-f]{6}$/i.test(value) || value === "" ? null : "请输入六位颜色值，例如 #181A1B。";

/** 默认内容属于模板；临时试排另存会话。每次提交沿用编辑器命令与撤销历史。 */
export default function TemplateDefaultContentControls({ nodeId, breakpoint: overrideBreakpoint, disabled = false, section = "all", onOpenPageScope }: {
  nodeId: string; breakpoint?: TemplateBreakpoint; disabled?: boolean; onOpenPageScope?: () => void;
  section?: "all" | "content" | "text-style" | "background";
}) {
  const draft = useTemplateEditorSession((state) => state.draft);
  const currentBreakpoint = useTemplateEditorSession((state) => state.breakpoint);
  const breakpoint = overrideBreakpoint ?? currentBreakpoint;
  const [error, setError] = useState<string | null>(null);
  const executeCommand = useTemplateEditorSession((state) => state.executeCommand);
  if (!draft || Number(draft.definition.schemaVersion) < 3) return null;
  const definition = draft.definition;
  const node = definition.nodes[nodeId];
  if (!node) return null;
  const slot = node.slotId ? definition.slots[node.slotId] : undefined;
  const locked = disabled || Boolean(getDynamicTemplateStructureLockOwnerId(definition, nodeId));
  const rules = resolveTemplateNodeRules(definition, nodeId, breakpoint);
  const slotRules = slot ? resolveTemplateSlotRules(definition, slot.slotId, breakpoint) : undefined;
  const value = slot ? definition.defaultContent[slot.slotId] : undefined;
  const record = isRecord(value) ? value : {};
  const text = typeof value === "string" ? value : "";
  const image = slot?.type === "image";
  const action = slot?.type === "button" || slot?.type === "link";
  const textSlot = slot && ["heading", "text", "richText", "badge", "icon", "button", "link"].includes(slot.type);
  const change = (label: string, transform: (next: TemplateDefinitionV2) => void) => {
    if (locked) return;
    const result = executeCommand({ type: "transform-definition", label, transform: (next) => { transform(next); return next; } });
    setError(result.ok ? null : result.message);
  };
  const content = (nextValue: unknown) => change("修改槽位默认内容", (next) => { if (slot) next.defaultContent[slot.slotId] = nextValue; });
  const nodeStyle = (key: string, nextValue: unknown) => change("修改模板外观", (next) => {
    if (nextValue !== undefined) setTemplateNodeRule(next, nodeId, breakpoint, key, nextValue);
    else if (breakpoint === "desktop") delete (next.nodes[nodeId].responsive.desktop as unknown as Record<string, unknown>)[key];
    else resetTemplateNodeRule(next, nodeId, breakpoint, key);
  });
  const textStyle = (key: string, nextValue: unknown) => change("修改槽位排版", (next) => {
    if (!slot) return;
    if (nextValue !== undefined) setTemplateSlotRule(next, slot.slotId, breakpoint, key, nextValue);
    else if (breakpoint === "desktop") delete (next.slots[slot.slotId].desktopRules as Record<string, unknown>)[key];
    else resetTemplateSlotRule(next, slot.slotId, breakpoint, key);
  });
  const colorField = (label: string, current: string | undefined, onChange: (color: string | undefined) => void) => (
    <TextField transactional label={label} value={current ?? ""} placeholder="继承预设" readOnly={locked} validate={colorError} onChange={(next) => onChange(next || undefined)} />
  );
  return <>
    {error ? <p role="alert">{error}</p> : null}
    {(section === "all" || section === "content") && slot && (image || textSlot) ? <section className="homepage-editor__inspector-section" aria-label="模板默认内容" data-template-default-content={slot.slotId}>
      <div className="homepage-editor__inspector-section-head"><strong>模板默认内容</strong><span>所有设备共享 · 随模板保存</span></div>
      <div className="homepage-editor__inspector-section-body">
        {image ? <>
          <MediaPickerField fieldKey={`default:${slot.slotId}`} value={typeof value === "string" ? value : typeof record.src === "string" ? record.src : ""}
            readOnly={locked} placeholder="选择默认图片" previewAspectRatio={slotRules?.aspectRatio?.replace(":", " / ")} previewFit={slotRules?.objectFit}
            onChange={(src) => content({ ...record, src, alt: typeof record.alt === "string" ? record.alt : "" })} />
          <TextField transactional label="默认图片说明" value={typeof record.alt === "string" ? record.alt : ""} maxLength={160} readOnly={locked}
            onChange={(alt) => content({ src: typeof value === "string" ? value : typeof record.src === "string" ? record.src : "", alt })} />
        </> : <TextField transactional key={slot.slotId} label={action ? "默认按钮文字" : "默认文字"}
          value={action ? typeof record.label === "string" ? record.label : "" : text}
          rows={action || slot.type === "heading" ? undefined : 3} maxLength={slot.validation.maxLength ?? 100000} readOnly={locked}
          onChange={(next) => content(action ? { ...record, label: next } : next)} />}
        {onOpenPageScope ? <button type="button" className="template-native__page-scope-link" onClick={onOpenPageScope}>设置页面开放范围</button> : null}
      </div>
    </section> : null}
    {(section === "all" || section === "background" || (section === "text-style" && textSlot)) ? <section className="homepage-editor__inspector-section" aria-label={section === "text-style" ? "模板颜色与字体" : "模板颜色与背景"}>
      <div className="homepage-editor__inspector-section-head"><strong>{textSlot && section !== "background" ? "颜色与字体" : "背景与颜色"}</strong><span>{({ desktop: "桌面基础", tablet: "平板独立设置", mobile: "手机独立设置" })[breakpoint]}</span></div>
      <div className="homepage-editor__inspector-section-body">
        {textSlot && section !== "background" ? <>
          {colorField("文字颜色", slotRules?.color, (color) => textStyle("color", color))}
          <label className="template-editor__simple-select">字体<select aria-label="字体" disabled={locked} value={slotRules?.fontFamily ?? "system"} onChange={(event) => textStyle("fontFamily", event.target.value)}>
            <option value="system">系统字体</option><option value="sans">无衬线</option><option value="serif">衬线</option>
          </select></label>
          <NumberField label="字间距" unit="px" min={-5} max={30} step={0.1} value={slotRules?.letterSpacing ?? 0} disabled={locked} onChange={(next) => textStyle("letterSpacing", next)} />
        </> : null}
        {section !== "text-style" ? <>
        {colorField(action ? "按钮背景颜色" : "背景颜色", rules.backgroundColor, (color) => nodeStyle("backgroundColor", color))}
        {!slot ? <>
          <MediaPickerField fieldKey={`background:${nodeId}`} value={rules.backgroundImage ?? ""} readOnly={locked} placeholder="选择背景图片" onChange={(src) => nodeStyle("backgroundImage", src)} />
          <SwitchField label="背景渐变" value={Boolean(rules.backgroundGradient)} disabled={locked} onChange={(enabled) => nodeStyle("backgroundGradient", enabled ? { from: rules.backgroundColor ?? "#FFFFFF", to: "#ECEEEF", angle: 135 } : null)} />
          {rules.backgroundGradient ? <>
            {colorField("渐变起始颜色", rules.backgroundGradient.from, (from) => nodeStyle("backgroundGradient", { ...rules.backgroundGradient, from: from ?? "#FFFFFF" }))}
            {colorField("渐变结束颜色", rules.backgroundGradient.to, (to) => nodeStyle("backgroundGradient", { ...rules.backgroundGradient, to: to ?? "#FFFFFF" }))}
            <NumberField label="渐变角度" unit="°" min={0} max={360} value={rules.backgroundGradient.angle} disabled={locked} onChange={(angle) => nodeStyle("backgroundGradient", { ...rules.backgroundGradient, angle })} />
          </> : null}
        </> : null}
        <NumberField label="不透明度" unit="%" min={0} max={100} value={(rules.opacity ?? 1) * 100} disabled={locked} onChange={(next) => nodeStyle("opacity", next / 100)} />
        </> : null}
      </div>
    </section> : null}
  </>;
}
