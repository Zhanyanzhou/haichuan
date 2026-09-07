import { PicLeftOutlined, PicRightOutlined, VerticalAlignTopOutlined, VerticalAlignMiddleOutlined, VerticalAlignBottomOutlined, UndoOutlined } from "@ant-design/icons";
import { Button } from "antd";
import type { TemplateDefinitionV2 } from "../template-definition";
import { applyTemplateComposition, getTemplateComposition, resetTemplateComposition, type CompositionLayout, type CompositionAlignment, type CompositionSpacing } from "./templateCompositionPresets";

const layouts = [
  { value: "text-left", label: "左文右图", icon: <PicRightOutlined /> },
  { value: "media-left", label: "左图右文", icon: <PicLeftOutlined /> },
  { value: "media-top", label: "上图下文", icon: <VerticalAlignTopOutlined /> },
] as const;

export default function TemplateCompositionControls({ definition, selectedId, device, onChange }: {
  definition: TemplateDefinitionV2;
  selectedId: string;
  device: "desktop" | "mobile";
  onChange: (update: (next: TemplateDefinitionV2) => void, label: string) => unknown;
}) {
  const composition = getTemplateComposition(definition, selectedId, device);
  if (!composition) return null;
  const { node, layout, ratio, mediaRect, copyRect, locked, contract } = composition;
  const mobile = device === "mobile" ? composition : null;
  const horizontal = layout === "text-left" || layout === "media-left";
  const offset = (copyRect.y - mediaRect.y) / Math.max(0.001, mediaRect.height - copyRect.height);
  const alignment = Math.abs(offset) < 0.01 ? "start" : Math.abs(offset - 0.5) < 0.01 ? "center" : Math.abs(offset - 1) < 0.01 ? "end" : "custom";
  const inset = Math.min(mediaRect.x, copyRect.x) - contract.defaultGeometryByViewport[device].safeArea.x;
  const spacing = Math.abs(inset) < 0.001 ? "compact" : Math.abs(inset - 0.025) < 0.001 ? "standard" : Math.abs(inset - 0.05) < 0.001 ? "spacious" : "custom";
  const apply = (options: Parameters<typeof applyTemplateComposition>[3], label: string, targetDevice = device) =>
    onChange((next) => applyTemplateComposition(next, selectedId, targetDevice, options), label);
  const reset = () => onChange((next) => resetTemplateComposition(next, selectedId, device), "恢复当前画布默认构图");
  const hasOverrides = Boolean(node.props.contentTemplateLayoutData);
  return <section className="template-editor__composition" aria-label="可视化构图" data-composition-node={node.nodeId}>
    <div className="template-editor__composition-heading"><span>{node.name}</span>
      <Button type="text" size="small" icon={<UndoOutlined />} onClick={reset} disabled={locked || !hasOverrides}>恢复默认</Button>
    </div>
    {locked ? <p role="status">结构已锁定，解除锁定后可调整构图。</p> : null}
    <fieldset disabled={locked}>
      <legend>布局方式</legend>
      <div className="template-editor__composition-layouts">
        {layouts.map((item) => <button type="button" key={item.value} aria-label={`构图：${item.label}`} aria-pressed={layout === item.value}
          onClick={() => { if (layout !== item.value) apply({ layout: item.value as CompositionLayout }, `切换为${item.label}`); }}>
          <span className="template-editor__composition-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
        </button>)}
      </div>
      {layout === "custom" ? <small>当前为自定义构图；选择布局后可一步撤销。</small> : null}
    </fieldset>
    {horizontal ? <fieldset disabled={locked}><legend>内容比例</legend>
      <div className="template-editor__composition-ratio" aria-label={`文案 ${Math.round(ratio * 100)}%，媒体 ${100 - Math.round(ratio * 100)}%`}>
        <span style={{ flex: ratio }}>文案<strong>{Math.round(ratio * 100)}%</strong></span><span style={{ flex: 1 - ratio }}>媒体<strong>{100 - Math.round(ratio * 100)}%</strong></span>
      </div>
      <div className="template-editor__composition-segments">{[{ label: "1:1", value: 0.5 }, { label: "2:3", value: 0.4 }, { label: "1:2", value: 1 / 3 }].map((item) =>
        <button type="button" key={item.label} aria-label={`内容比例：${item.label}`} aria-pressed={Math.abs(ratio - item.value) < 0.001}
          onClick={() => { if (Math.abs(ratio - item.value) >= 0.001) apply({ ratio: item.value }, `调整内容比例 ${item.label}`); }}>{item.label}</button>)}</div>
    </fieldset> : null}
    {horizontal ? <fieldset disabled={locked}><legend>对齐方式</legend><div className="template-editor__composition-segments">
      {([{ value: "start", label: "顶部对齐", icon: <VerticalAlignTopOutlined /> }, { value: "center", label: "居中对齐", icon: <VerticalAlignMiddleOutlined /> }, { value: "end", label: "底部对齐", icon: <VerticalAlignBottomOutlined /> }] as const).map((item) =>
        <button type="button" key={item.value} aria-label={`文案对齐：${item.label}`} aria-pressed={alignment === item.value}
          onClick={() => { if (alignment !== item.value) apply({ alignment: item.value as CompositionAlignment }, `文案${item.label}`); }}>{item.icon}<span>{item.label}</span></button>)}
    </div></fieldset> : null}
    <fieldset disabled={locked}><legend>留白</legend><div className="template-editor__composition-segments">
      {([{ value: "compact", label: "紧凑" }, { value: "standard", label: "标准" }, { value: "spacious", label: "宽松" }] as const).map((item) =>
        <button type="button" key={item.value} aria-label={`构图留白：${item.label}`} aria-pressed={spacing === item.value && layout !== "custom"}
          onClick={() => { if (spacing !== item.value || layout === "custom") apply({ spacing: item.value as CompositionSpacing }, `调整${item.label}留白`); }}>{item.label}</button>)}
    </div></fieldset>
    {mobile ? <div className="template-editor__composition-mobile"><label htmlFor="template-composition-mobile-order">内容顺序</label>
      <select id="template-composition-mobile-order" aria-label="内容顺序" disabled={mobile.locked}
        value={mobile.layout === "media-top" || mobile.layout === "text-top" ? mobile.layout : "custom"}
        onChange={(event) => apply({ layout: event.target.value as CompositionLayout }, "调整内容顺序")}>
        <option value="custom" disabled>当前自定义布局</option><option value="media-top">图片在上</option><option value="text-top">文字在上</option>
      </select>
    </div> : null}
  </section>;
}
