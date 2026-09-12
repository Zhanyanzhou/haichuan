import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { type TemplateDefinitionV2 } from "../template-definition";
import { type ResolvedTemplateDefinition } from "../template-definition/responsive";
import {
  registerPendingCommittedInput,
  unregisterPendingCommittedInput,
} from "../inspector/controls/NumberField";
import TextField from "../inspector/controls/TextField";
import { CanvasDimensionInput } from "./WorkspaceCanvasControls";
import { resolveTemplateInspectorDesignFields } from "./templateInspectorCapabilities";

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

const BUTTON_BACKGROUND_OPTIONS = [
  { value: "transparent", label: "透明" },
  { value: "surface", label: "白色" },
  { value: "surface-muted", label: "柔灰" },
  { value: "brand-ink", label: "深色" },
  { value: "brand-soft", label: "浅色" },
] as const;

const BUTTON_BORDER_OPTIONS = [
  { value: "none", label: "无" },
  { value: "subtle", label: "轻" },
  { value: "strong", label: "强调" },
  { value: "accent", label: "品牌" },
] as const;

/** 自定义比例输入：草稿与已提交值分离，并接入检查器的切换门禁。 */
function CustomRatioInput({ value, disabled, onCommit }: {
  value: string | undefined;
  disabled?: boolean;
  onCommit: (ratio: string) => void;
}) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const editingRef = useRef(false);
  const skipNextBlurRef = useRef(false);
  const committedRef = useRef(value);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const commitRef = useRef<() => boolean>(() => true);
  const attachInput = useCallback((input: HTMLInputElement | null) => {
    if (inputRef.current) unregisterPendingCommittedInput(inputRef.current);
    inputRef.current = input;
    if (input) registerPendingCommittedInput(input, () => commitRef.current());
  }, []);

  useEffect(() => {
    committedRef.current = value;
    if (editingRef.current || error) return;
    setDraft(value ?? "");
  }, [error, value]);

  const restore = () => {
    editingRef.current = false;
    setDraft(committedRef.current ?? "");
    setError(null);
    inputRef.current?.removeAttribute("aria-invalid");
  };
  const commit = () => {
    if (!editingRef.current) return true;
    const trimmed = draft.trim();
    if (!RATIO_PATTERN.test(trimmed)) {
      setError("请输入有效图片比例，例如 12:5。");
      return false;
    }
    const committed = committedRef.current;
    editingRef.current = false;
    committedRef.current = trimmed;
    setDraft(trimmed);
    setError(null);
    inputRef.current?.removeAttribute("aria-invalid");
    if (trimmed !== committed) onCommit(trimmed);
    return true;
  };
  commitRef.current = commit;

  const handleBlur = (_event: FocusEvent<HTMLInputElement>) => {
    if (skipNextBlurRef.current) {
      skipNextBlurRef.current = false;
      return;
    }
    commit();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (commit()) {
        skipNextBlurRef.current = true;
        event.currentTarget.blur();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      restore();
      skipNextBlurRef.current = true;
      event.currentTarget.blur();
    }
  };

  return (
    <label className="template-editor__simple-select" htmlFor={inputId}>自定义比例
      <input
        id={inputId}
        ref={attachInput}
        type="text"
        data-committed-number-input="true"
        value={draft}
        disabled={disabled}
        placeholder="如 21:9"
        aria-label="自定义图片比例"
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          editingRef.current = true;
          setDraft(event.target.value);
          setError(null);
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      {error ? <span id={errorId} className="homepage-editor__field-error" role="alert">{error}</span> : null}
    </label>
  );
}

/** 常用槽位直接编辑正式响应式规则，页面内容仍由页面装修负责。 */
export default function TemplateSlotControls({ definition, nodeId, device, onChange }: {
  definition: ResolvedTemplateDefinition; nodeId: string; device: "desktop" | "mobile";
  onChange: (update: (next: ResolvedTemplateDefinition) => void, label: string) => unknown;
}) {
  const node = definition.nodes[nodeId];
  const slot = definition.slots[node.slotId!];
  const rules = node.responsive[device];
  const slotRulesKey = device === "desktop" ? "desktopRules" : "mobileRules";
  const slotRules = slot[slotRulesKey];
  const resolvedFields = resolveTemplateInspectorDesignFields({ definition, device, targetId: nodeId }).fields;
  const hasField = (field: string) => resolvedFields.some((candidate) => candidate.field === field);
  const locked = Boolean(resolvedFields.find((candidate) => candidate.field === "node.name")?.disabledReason);
  const updateRules = (mutate: (next: typeof rules) => void, label: string) => onChange((next) => mutate(next.nodes[nodeId].responsive[device]), label);
  const updateSlot = (mutate: (next: typeof slotRules) => void, label: string) => onChange((next) => mutate(next.slots[slot.slotId][slotRulesKey]), label);
  const widthUnit = typeof rules.width === "object" ? rules.width.unit : rules.width;
  const image = hasField("slotRules.objectFit");
  const product = node.type === "ProductSlot";
  const button = node.type === "ButtonSlot";
  const defaultFontWeight = node.type === "HeadingSlot" ? 600 : 400;
  const currentFocus = slotRules.objectPosition ?? "center center";
  const paddingSides = rules.padding ? Object.values(rules.padding) : [];
  const uniformPadding = paddingSides.length === 4 && paddingSides.every((side) => (
    side.unit === paddingSides[0].unit && side.value === paddingSides[0].value
  )) ? paddingSides[0] : undefined;
  return <section
    className="template-editor__composition template-editor__simple-slot"
    aria-label="槽位设计设置"
  >
    <TextField transactional validate={(name) => name.trim() ? null : "节点名称不能为空。"} label="节点名称" value={node.name} readOnly={locked} maxLength={60} onChange={(name) => {
      onChange((next) => { next.nodes[nodeId].name = name; }, "重命名节点");
    }} />
    {locked ? <p role="status">此槽位已锁定，可从槽位列表解锁。</p> : null}
    <div data-template-inspector-field="responsive.*.display">
      <span>显示状态</span>
      <div className="template-editor__composition-segments" role="group" aria-label="显示状态">
        <button type="button" aria-pressed={rules.display !== "none"} disabled={locked} onClick={() => updateRules((next) => { next.display = "block"; }, "显示当前槽位")}>显示</button>
        <button type="button" aria-pressed={rules.display === "none"} disabled={locked} onClick={() => updateRules((next) => { next.display = "none"; }, "隐藏当前槽位")}>隐藏</button>
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
    {button ? <fieldset disabled={locked}><legend>按钮外观</legend>
      <div className="template-editor__composition-segments" role="group" aria-label="按钮背景">
        {BUTTON_BACKGROUND_OPTIONS.map((item) => <button
          key={item.value}
          type="button"
          aria-label={`按钮背景：${item.label}`}
          aria-pressed={(rules.backgroundToken ?? "transparent") === item.value}
          onClick={() => updateRules((next) => {
            next.backgroundToken = item.value === "transparent" ? undefined : item.value;
          }, "调整按钮背景")}
        >{item.label}</button>)}
      </div>
      <div className="template-editor__composition-segments" role="group" aria-label="按钮边框">
        {BUTTON_BORDER_OPTIONS.map((item) => <button
          key={item.value}
          type="button"
          aria-label={`按钮边框：${item.label}`}
          aria-pressed={(rules.borderToken ?? "none") === item.value}
          onClick={() => updateRules((next) => {
            next.borderToken = item.value === "none" ? undefined : item.value;
          }, "调整按钮边框")}
        >{item.label}</button>)}
      </div>
      <CanvasDimensionInput
        allowDecimals
        label="按钮圆角"
        shortLabel={rules.radius?.unit ?? "px"}
        value={rules.radius?.value ?? 0}
        min={0}
        max={1000}
        onCommit={(value) => updateRules((next) => {
          next.radius = { value, unit: next.radius?.unit ?? "px" };
        }, "调整按钮圆角")}
      />
      <CanvasDimensionInput
        allowDecimals
        label="按钮内边距"
        shortLabel={uniformPadding?.unit ?? "px"}
        value={uniformPadding?.value ?? rules.padding?.top.value ?? 0}
        min={0}
        max={1000}
        onCommit={(value) => updateRules((next) => {
          const side = { value, unit: uniformPadding?.unit ?? "px" as const };
          next.padding = { top: side, right: side, bottom: side, left: side };
        }, "调整按钮内边距")}
      />
      {!uniformPadding && rules.padding ? <small>当前四边内边距不同；输入新值会统一四边。</small> : null}
    </fieldset> : null}
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
      {hasField("slotRules.objectPosition") ? <div data-template-inspector-field={`slot.${slotRulesKey}.objectPosition`}>
        <span>图片焦点</span>
        <div className="template-editor__focus-grid" role="group" aria-label="图片焦点">
          {FOCUS_GRID_CELLS.map((cell) => <button key={cell.value} type="button" title={cell.label} aria-label={`焦点${cell.label}`} aria-pressed={currentFocus === cell.value} onClick={() => updateSlot((next) => { next.objectPosition = cell.value; }, "调整图片焦点")}>{cell.label}</button>)}
        </div>
      </div> : null}
    </fieldset> : !hasField("slotRules.fontSize") ? null : <fieldset disabled={locked}><legend>文字样式</legend>
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
