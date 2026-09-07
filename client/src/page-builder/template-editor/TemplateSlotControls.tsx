import { useEffect, useId, useRef, useState } from "react";
import { getDynamicTemplateStructureLockOwnerId, type TemplateDefinitionV2 } from "../template-definition";
import TextField from "../inspector/controls/TextField";
import { CanvasDimensionInput } from "./WorkspaceCanvasControls";

export const SIMPLE_SLOT_TYPES = new Set(["ImageSlot", "HeadingSlot", "TextSlot", "ButtonSlot", "ProductSlot"]);

/** 两端一致的常用比例预设；schema 允许任意 N:M，预设之外的值由自定义输入写入。 */
const IMAGE_RATIO_PRESETS = ["1:1", "4:3", "3:4", "16:9", "9:16", "4:5"] as const;
const RATIO_PATTERN = /^(auto|[1-9][0-9]{0,3}:[1-9][0-9]{0,3})$/;

const FONT_ROLE_OPTIONS = [
  { value: "display", label: "展示标题" },
  { value: "heading", label: "标题" },
  { value: "body", label: "正文" },
  { value: "caption", label: "说明" },
  { value: "action", label: "行动" },
] as const;

const FOCUS_GRID_CELLS = [
  { value: "left top", label: "左上" },
  { value: "center top", label: "上中" },
  { value: "right top", label: "右上" },
  { value: "left center", label: "左中" },
  { value: "center center", label: "居中" },
  { value: "right center", label: "右中" },
  { value: "left bottom", label: "左下" },
  { value: "center bottom", label: "下中" },
  { value: "right bottom", label: "右下" },
] as const;

/** 自定义比例输入：仅当值通过 N:M 合同校验时提交，非法输入失焦还原。 */
function CustomRatioInput({ value, disabled, onCommit }: {
  value: string | undefined;
  disabled?: boolean;
  onCommit: (ratio: string) => void;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState(value ?? "");
  const previousValueRef = useRef<string | undefined>(value);
  useEffect(() => {
    if (previousValueRef.current === value) return;
    previousValueRef.current = value;
    setDraft(value ?? "");
  }, [value]);
  const commit = () => {
    const trimmed = draft.trim();
    if (RATIO_PATTERN.test(trimmed) && trimmed !== value) onCommit(trimmed);
    else setDraft(value ?? "");
  };
  return (
    <label className="template-editor__simple-select" htmlFor={inputId}>自定义比例
      <input
        id={inputId}
        type="text"
        value={draft}
        disabled={disabled}
        placeholder="如 21:9"
        aria-label="自定义图片比例"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); (event.target as HTMLInputElement).blur(); }
        }}
      />
    </label>
  );
}

/** 常用槽位直接编辑正式响应式规则，页面内容仍由页面装修负责。 */
export default function TemplateSlotControls({ definition, nodeId, device, onChange }: {
  definition: TemplateDefinitionV2; nodeId: string; device: "desktop" | "mobile";
  onChange: (update: (next: TemplateDefinitionV2) => void, label: string) => unknown;
}) {
  const node = definition.nodes[nodeId];
  const slot = definition.slots[node.slotId!];
  const rules = node.responsive[device];
  const slotRulesKey = device === "desktop" ? "desktopRules" : "mobileRules";
  const slotRules = slot[slotRulesKey];
  const locked = getDynamicTemplateStructureLockOwnerId(definition, nodeId) !== null;
  const updateRules = (mutate: (next: typeof rules) => void, label: string) => onChange((next) => mutate(next.nodes[nodeId].responsive[device]), label);
  const updateSlot = (mutate: (next: typeof slotRules) => void, label: string) => onChange((next) => mutate(next.slots[slot.slotId][slotRulesKey]), label);
  const widthUnit = typeof rules.width === "object" ? rules.width.unit : rules.width;
  const image = node.type === "ImageSlot";
  const product = node.type === "ProductSlot";
  const defaultFontWeight = node.type === "HeadingSlot" ? 600 : 400;
  const currentFocus = slotRules.objectPosition ?? "center center";
  return <section className="template-editor__composition template-editor__simple-slot" aria-label="槽位设置">
    <TextField label="槽位名称" value={node.name} readOnly={locked} maxLength={60} onChange={(name) => {
      if (!name.trim()) return;
      onChange((next) => { next.nodes[nodeId].name = name; next.slots[slot.slotId].label = name; }, "重命名槽位");
    }} />
    <p className="homepage-editor__inspector-hint">{image ? "图片" : product ? "商品" : node.type === "ButtonSlot" ? "按钮文字和链接" : "文字内容"}在页面装修中填写。</p>
    {locked ? <p role="status">此槽位已锁定，可从槽位列表解锁。</p> : null}
    <div data-template-inspector-field="responsive.*.display">
      <span>显示状态</span>
      <div className="template-editor__composition-segments" role="group" aria-label="显示状态">
        <button type="button" aria-pressed={rules.display !== "none"} disabled={locked} onClick={() => updateRules((next) => { next.display = "block"; }, "显示当前槽位")}>显示</button>
        <button type="button" aria-pressed={rules.display === "none"} disabled={locked || slot.required} title={slot.required ? "必填槽位不能隐藏" : undefined} onClick={() => updateRules((next) => { next.display = "none"; }, "隐藏当前槽位")}>隐藏</button>
      </div>
    </div>
    <fieldset disabled={locked}><legend>槽位尺寸</legend>
      <label className="template-editor__simple-select">宽度
        <select aria-label="槽位宽度方式" value={widthUnit} onChange={(event) => {
          const value = event.target.value;
          updateRules((next) => { next.width = value === "fill" || value === "auto" || value === "fit" ? value : { value: value === "%" ? 100 : 320, unit: value as "px" | "%" }; }, "调整槽位宽度");
        }}>
          <option value="fill">填满可用宽度</option><option value="auto">自动宽度</option><option value="fit">适合内容</option><option value="%">按比例</option><option value="px">固定像素</option>
          {!["fill", "auto", "fit", "%", "px"].includes(widthUnit) ? <option value={widthUnit}>当前单位（{widthUnit}）</option> : null}
        </select>
      </label>
      {typeof rules.width === "object" ? <CanvasDimensionInput allowDecimals label="槽位宽度" shortLabel={rules.width.unit} value={rules.width.value} min={1} max={rules.width.unit === "%" ? 100 : 10000} onCommit={(value) => updateRules((next) => { if (typeof next.width === "object") next.width.value = value; }, "调整槽位宽度")} /> : null}
      <label className="template-editor__simple-select">高度
        <select aria-label="槽位高度方式" value={rules.height.mode} onChange={(event) => updateRules((next) => {
          next.height = event.target.value === "auto" ? { mode: "auto" } : { mode: "fixed", value: { value: image ? 240 : 64, unit: "px" } };
        }, "调整槽位高度")}>
          <option value="auto">随内容变化</option><option value="fixed">固定高度</option>
          {rules.height.mode === "aspect-ratio" ? <option value="aspect-ratio">保持原有比例</option> : null}
        </select>
      </label>
      {rules.height.mode === "fixed" ? <CanvasDimensionInput allowDecimals label="槽位高度" shortLabel={rules.height.value?.unit ?? "px"} value={rules.height.value?.value ?? 64} min={1} max={10000} onCommit={(value) => updateRules((next) => { next.height = { mode: "fixed", value: { value, unit: next.height.value?.unit ?? "px" } }; }, "调整槽位高度")} /> : null}
    </fieldset>
    {image ? <fieldset disabled={locked}><legend>图片显示</legend>
      <div className="template-editor__composition-segments">
        {([{ value: "cover", label: "裁切填满" }, { value: "contain", label: "完整显示" }, { value: "fill", label: "拉伸填满" }] as const).map((item) => <button key={item.value} type="button" aria-pressed={slotRules.objectFit === item.value} onClick={() => updateSlot((next) => { next.objectFit = item.value; }, "调整图片显示")}>{item.label}</button>)}
      </div>
      <label className="template-editor__simple-select">图片比例
        <select aria-label="图片槽位比例" value={rules.height.mode === "auto" ? slotRules.aspectRatio ?? "" : "fixed-height"} onChange={(event) => onChange((next) => {
          next.slots[slot.slotId][slotRulesKey].aspectRatio = event.target.value || undefined;
          next.nodes[nodeId].responsive[device].height = { mode: "auto" };
        }, "按图片比例调整槽位高度")}>
          <option value="">自动</option>{rules.height.mode !== "auto" ? <option value="fixed-height">由槽位高度决定</option> : null}{IMAGE_RATIO_PRESETS.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
          {slotRules.aspectRatio && !IMAGE_RATIO_PRESETS.includes(slotRules.aspectRatio as (typeof IMAGE_RATIO_PRESETS)[number]) ? <option value={slotRules.aspectRatio}>{slotRules.aspectRatio}</option> : null}
        </select>
      </label>
      <CustomRatioInput
        value={slotRules.aspectRatio}
        onCommit={(ratio) => onChange((next) => {
          next.slots[slot.slotId][slotRulesKey].aspectRatio = ratio;
          next.nodes[nodeId].responsive[device].height = { mode: "auto" };
        }, "自定义图片比例")}
      />
      <div data-template-inspector-field={`slot.${slotRulesKey}.objectPosition`}>
        <span>图片焦点</span>
        <div className="template-editor__focus-grid" role="group" aria-label="图片焦点">
          {FOCUS_GRID_CELLS.map((cell) => <button key={cell.value} type="button" title={cell.label} aria-label={`焦点${cell.label}`} aria-pressed={currentFocus === cell.value} onClick={() => updateSlot((next) => { next.objectPosition = cell.value; }, "调整图片焦点")}>{cell.label}</button>)}
        </div>
      </div>
    </fieldset> : product ? null : <fieldset disabled={locked}><legend>文字样式</legend>
      <CanvasDimensionInput allowDecimals commitUnchanged label="槽位字号" shortLabel={`字号（${slotRules.fontSize?.unit ?? "px"}）`} value={slotRules.fontSize?.value ?? (node.type === "HeadingSlot" ? 32 : 16)} min={1} max={240} onCommit={(value) => updateSlot((next) => { next.fontSize = { value, unit: next.fontSize?.unit ?? "px" }; }, "调整槽位字号")} />
      <div className="template-editor__composition-segments" role="group" aria-label="文字对齐">
        {([{ value: "left", label: "左对齐" }, { value: "center", label: "居中" }, { value: "right", label: "右对齐" }] as const).map((item) => <button key={item.value} type="button" aria-pressed={(slotRules.textAlign ?? "left") === item.value} onClick={() => updateSlot((next) => { next.textAlign = item.value; }, "调整文字对齐")}>{item.label}</button>)}
      </div>
      <label className="template-editor__simple-select">字重
        <select aria-label="文字字重" value={String(slotRules.fontWeight ?? defaultFontWeight)} onChange={(event) => updateSlot((next) => { next.fontWeight = Number(event.target.value); }, "调整文字字重")}>
          {Array.from({ length: 9 }, (_, index) => (index + 1) * 100).map((weight) => <option key={weight} value={weight}>{weight}</option>)}
        </select>
      </label>
      <CanvasDimensionInput allowDecimals label="槽位行高" shortLabel="行高（倍）" value={slotRules.lineHeight ?? 1.6} min={0.8} max={3} onCommit={(value) => updateSlot((next) => { next.lineHeight = value; }, "调整槽位行高")} />
      <CanvasDimensionInput label="槽位最大行数" shortLabel="行" value={slotRules.maxLines ?? 3} min={1} max={20} onCommit={(value) => updateSlot((next) => { next.maxLines = value; }, "调整槽位最大行数")} />
      <label className="template-editor__simple-select">文字溢出
        <select aria-label="文字溢出策略" value={slotRules.overflow ?? ""} onChange={(event) => updateSlot((next) => { next.overflow = event.target.value ? event.target.value as "clip" | "ellipsis" | "wrap" : undefined; }, "调整文字溢出")}>
          <option value="">默认（随容器）</option>
          <option value="clip">超出裁剪</option>
          <option value="ellipsis">超出省略</option>
          <option value="wrap">始终换行</option>
        </select>
      </label>
      <label className="template-editor__simple-select">字体角色
        <select aria-label="字体角色" value={slotRules.fontRole ?? ""} onChange={(event) => updateSlot((next) => { next.fontRole = event.target.value ? event.target.value as typeof FONT_ROLE_OPTIONS[number]["value"] : undefined; }, "调整字体角色")}>
          <option value="">默认</option>
          {FONT_ROLE_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
        </select>
      </label>
    </fieldset>}
  </section>;
}
