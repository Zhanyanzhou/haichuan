import { CanvasDimensionInput } from "./WorkspaceCanvasControls";
import { AppstoreOutlined, ColumnWidthOutlined, ColumnHeightOutlined } from "@ant-design/icons";
import { type TemplateDefinitionV2 } from "../template-definition";
import { type ResolvedTemplateDefinition } from "../template-definition/responsive";
import TextField from "../inspector/controls/TextField";
import { resolveTemplateInspectorDesignFields } from "./templateInspectorCapabilities";

/** 原生结构容器使用同一套快捷操作，直接更新既有响应式规则。 */
export default function TemplateContainerControls({ definition, nodeId, device, showNodeName = true, onChange }: {
  definition: ResolvedTemplateDefinition; nodeId: string; device: "desktop" | "mobile";
  showNodeName?: boolean;
  onChange: (update: (next: ResolvedTemplateDefinition) => void, label: string) => unknown;
}) {
  const node = definition.nodes[nodeId];
  const rules = node.responsive[device];
  const resolvedFields = resolveTemplateInspectorDesignFields({ definition, device, targetId: nodeId }).fields;
  const hasField = (field: string) => resolvedFields.some((candidate) => candidate.field === field);
  const locked = Boolean(resolvedFields.find((candidate) => candidate.field === "node.name")?.disabledReason);
  const layout = rules.display === "grid" ? "grid" : rules.display === "flex" ? rules.direction ?? "row" : "custom";
  const uniformPadding = rules.padding && Object.values(rules.padding).every((side) => side.unit === "px" && side.value === rules.padding!.top.value) ? rules.padding.top.value : undefined;
  const update = (mutate: (value: typeof rules) => void, label: string) => onChange((next) => mutate(next.nodes[nodeId].responsive[device]), label);
  const rowChildren = layout === "row" ? node.childIds.map((childId) => {
    const child = definition.nodes[childId];
    if (!child) return null;
    const childRules = child.responsive[device];
    const widthUnit = typeof childRules.width === "object" ? childRules.width.unit : childRules.width;
    const childLocked = Boolean(resolveTemplateInspectorDesignFields({ definition, device, targetId: childId })
      .fields.find((field) => field.field === "responsive.width")?.disabledReason);
    return { child, childRules, widthUnit, childLocked };
  }).filter((child): child is NonNullable<typeof child> => Boolean(child)) : [];
  return <section className="template-editor__composition" aria-label="容器可视化布局">
    {showNodeName ? <TextField transactional validate={(name) => name.trim() ? null : "节点名称不能为空。"} label="节点名称" value={node.name} readOnly={locked} maxLength={60} onChange={(name) => {
      onChange((next) => { next.nodes[nodeId].name = name; }, "重命名节点");
    }} /> : null}
    {locked ? <p role="status">结构已锁定，解除锁定后可调整布局。</p> : null}
    <fieldset disabled={locked || rules.layoutMode === "free"}><legend>布局方式</legend>
      <div className="template-editor__composition-layouts">{([
        { value: "row", label: "左右排列", icon: <ColumnWidthOutlined /> },
        { value: "column", label: "上下排列", icon: <ColumnHeightOutlined /> },
        { value: "grid", label: "分列排列", icon: <AppstoreOutlined /> },
      ] as const).map((item) => <button type="button" key={item.value} aria-label={`容器布局：${item.label}`} aria-pressed={layout === item.value}
        onClick={() => { if (layout !== item.value) update((next) => {
          next.display = item.value === "grid" ? "grid" : "flex";
          if (item.value === "grid") next.columns ??= [1, 1];
          else next.direction = item.value;
        }, `切换为${item.label}`); }}><span className="template-editor__composition-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span></button>)}</div>
      {rules.layoutMode === "free" ? <small>当前为自由叠放，可在精确设置中切回顺序布局。</small> : null}
    </fieldset>
    {layout === "grid" && hasField("responsive.columns") ? <fieldset disabled={locked || rules.layoutMode === "free"}><legend>列宽比例</legend><div className="template-editor__composition-segments">
      {[[1, 1], [2, 3], [1, 2]].map((columns) => <button type="button" key={columns.join(":")} aria-label={`容器列宽：${columns.join(":")}`} aria-pressed={rules.columns?.join(":") === columns.join(":")}
        onClick={() => { if (rules.columns?.join(":") !== columns.join(":")) update((next) => { next.columns = columns; }, "调整容器列宽"); }}>{columns.join(":")}</button>)}
    </div></fieldset> : null}
    {rowChildren.length ? <section className="template-editor__composition-child-widths" aria-label="左右排列子项宽度">
      <h4>子项宽度</h4>
      <small>直接设置每个子项的真实宽度；比例和像素值会立即用于画布。</small>
      {rowChildren.map(({ child, childRules, widthUnit, childLocked }) => <fieldset key={child.nodeId} disabled={locked || childLocked}>
        <legend>{child.name}</legend>
        <label className="template-editor__simple-select">宽度方式
          <select aria-label={`${child.name}宽度方式`} value={widthUnit} onChange={(event) => {
            const value = event.target.value;
            onChange((next) => {
              next.nodes[child.nodeId].responsive[device].width = value === "fill" || value === "auto" || value === "fit"
                ? value
                : { value: value === "%" ? 50 : 320, unit: value as "px" | "%" };
            }, `调整${child.name}宽度方式`);
          }}>
            <option value="fill">填满可用宽度</option><option value="auto">自动宽度</option><option value="fit">适合内容</option><option value="%">按比例</option><option value="px">固定像素</option>
            {!['fill', 'auto', 'fit', '%', 'px'].includes(widthUnit) ? <option value={widthUnit}>当前单位（{widthUnit}）</option> : null}
          </select>
        </label>
        {typeof childRules.width === "object" ? <CanvasDimensionInput
          allowDecimals
          label={`${child.name}宽度`}
          shortLabel={childRules.width.unit}
          value={childRules.width.value}
          min={1}
          max={childRules.width.unit === "%" ? 100 : 10000}
          onCommit={(value) => onChange((next) => {
            const nextWidth = next.nodes[child.nodeId].responsive[device].width;
            if (typeof nextWidth === "object") nextWidth.value = value;
          }, `调整${child.name}宽度`)}
        /> : null}
        {childLocked ? <small>此子项受结构锁定保护，请先在模板结构中解锁。</small> : null}
      </fieldset>)}
    </section> : null}
    {hasField("responsive.alignItems") ? <fieldset disabled={locked}><legend>对齐方式</legend><div className="template-editor__composition-segments">
      {([{ value: "start", label: "靠前" }, { value: "center", label: "居中" }, { value: "end", label: "靠后" }] as const).map((item) =>
        <button type="button" key={item.value} aria-label={`容器对齐：${item.label}`} aria-pressed={rules.alignItems === item.value}
          onClick={() => { if (rules.alignItems !== item.value) update((next) => { next.alignItems = item.value; }, `调整容器${item.label}对齐`); }}>{item.label}</button>)}
    </div></fieldset> : null}
    <fieldset disabled={locked || rules.layoutMode === "free" || !["flex", "grid"].includes(rules.display)}><legend>槽位间距</legend>
      {rules.layoutMode === "free" ? <small>自由叠放不使用排列间距。</small> : null}
      <CanvasDimensionInput label="槽位间距" shortLabel={rules.gap?.unit ?? "px"} value={rules.gap?.value ?? 0} min={0} max={200} onCommit={(value) => update((next) => { next.gap = { value, unit: next.gap?.unit ?? "px" }; }, "调整槽位间距")} />
    </fieldset>
    <fieldset disabled={locked}><legend>留白</legend><div className="template-editor__composition-segments">
      {[{ value: 16, label: "紧凑" }, { value: 32, label: "标准" }, { value: 64, label: "宽松" }].map((item) =>
        <button type="button" key={item.value} aria-label={`容器留白：${item.label}`} aria-pressed={uniformPadding === item.value}
          onClick={() => { if (uniformPadding !== item.value) update((next) => {
            const side = { value: item.value, unit: "px" as const };
            next.padding = { top: side, right: side, bottom: side, left: side };
          }, `调整容器${item.label}留白`); }}>{item.label}</button>)}
    </div><small>{uniformPadding === undefined ? "当前留白为自定义值" : `四边内边距 ${uniformPadding} px`}</small></fieldset>
  </section>;
}
