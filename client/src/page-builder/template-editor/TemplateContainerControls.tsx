import { CanvasDimensionInput } from "./WorkspaceCanvasControls";
import { AppstoreOutlined, ColumnWidthOutlined, ColumnHeightOutlined } from "@ant-design/icons";
import { getDynamicTemplateStructureLockOwnerId, type TemplateDefinitionV2 } from "../template-definition";

/** 原生结构容器使用同一套快捷操作，直接更新既有响应式规则。 */
export default function TemplateContainerControls({ definition, nodeId, device, onChange }: {
  definition: TemplateDefinitionV2; nodeId: string; device: "desktop" | "mobile";
  onChange: (update: (next: TemplateDefinitionV2) => void, label: string) => unknown;
}) {
  const node = definition.nodes[nodeId];
  const rules = node.responsive[device];
  const locked = getDynamicTemplateStructureLockOwnerId(definition, nodeId) !== null;
  const layout = rules.display === "grid" ? "grid" : rules.display === "flex" ? rules.direction ?? "row" : "custom";
  const uniformPadding = rules.padding && Object.values(rules.padding).every((side) => side.unit === "px" && side.value === rules.padding!.top.value) ? rules.padding.top.value : undefined;
  const update = (mutate: (value: typeof rules) => void, label: string) => onChange((next) => mutate(next.nodes[nodeId].responsive[device]), label);
  return <section className="template-editor__composition" aria-label="容器可视化布局">
    <div className="template-editor__composition-heading">{node.name}</div>
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
    {layout === "grid" ? <fieldset disabled={locked || rules.layoutMode === "free"}><legend>列宽比例</legend><div className="template-editor__composition-segments">
      {[[1, 1], [2, 3], [1, 2]].map((columns) => <button type="button" key={columns.join(":")} aria-label={`容器列宽：${columns.join(":")}`} aria-pressed={rules.columns?.join(":") === columns.join(":")}
        onClick={() => { if (rules.columns?.join(":") !== columns.join(":")) update((next) => { next.columns = columns; }, "调整容器列宽"); }}>{columns.join(":")}</button>)}
    </div></fieldset> : null}
    <fieldset disabled={locked || rules.layoutMode === "free"}><legend>对齐方式</legend><div className="template-editor__composition-segments">
      {([{ value: "start", label: "靠前" }, { value: "center", label: "居中" }, { value: "end", label: "靠后" }] as const).map((item) =>
        <button type="button" key={item.value} aria-label={`容器对齐：${item.label}`} aria-pressed={rules.alignItems === item.value}
          onClick={() => { if (rules.alignItems !== item.value) update((next) => { next.alignItems = item.value; }, `调整容器${item.label}对齐`); }}>{item.label}</button>)}
    </div></fieldset>
    <fieldset disabled={locked}><legend>槽位间距</legend>
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
