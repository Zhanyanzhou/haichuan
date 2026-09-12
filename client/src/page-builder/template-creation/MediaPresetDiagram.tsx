import type { TemplateRecipe } from "../template-definition/generated/templateDefinition.generated";

function ImageTile({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  return <g data-media-diagram-image="true">
    <rect x={x} y={y} width={width} height={height} rx="2" fill="var(--recipe-fill)" />
    <polyline points={`${x + width * .12},${y + height * .78} ${x + width * .36},${y + height * .48} ${x + width * .57},${y + height * .62} ${x + width * .88},${y + height * .18}`} fill="none" />
  </g>;
}

/** 图片组合用简洁线框表达数量与主次；实际排版继续由当前配方生成。 */
export default function MediaPresetDiagram({ preset, canvas }: { preset: string; canvas: TemplateRecipe["canvas"] }) {
  const ratio = canvas.width > 0 && canvas.height > 0 ? canvas.width / canvas.height : 1;
  const width = 60 * Math.min(1, ratio / (60 / 36));
  const height = width / ratio;
  return <span className="template-recipe__media-diagram" aria-hidden="true">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" width={width} height={height}
      data-media-preset-diagram={preset} data-canvas-width={canvas.width} data-canvas-height={canvas.height}>
      <rect x="1" y="1" width="98" height="98" rx="4" className="template-recipe__diagram-frame" fill="var(--recipe-bg)" />
      {preset === "none" && <path d="M39 50 H61" />}
      {(preset === "hero" || preset === "heroLogo" || preset === "custom") && <ImageTile x={10} y={16} width={80} height={68} />}
      {preset === "heroLogo" && <rect x="67" y="7" width="24" height="21" rx="3" fill="var(--recipe-bg)" data-media-diagram-logo="true" />}
      {preset === "heroOne" && <><ImageTile x={9} y={16} width={51} height={68} /><ImageTile x={67} y={16} width={24} height={68} /></>}
      {preset === "heroTwo" && <><ImageTile x={9} y={16} width={51} height={68} /><ImageTile x={67} y={16} width={24} height={28} /><ImageTile x={67} y={56} width={24} height={28} /></>}
      {preset === "two" && <><ImageTile x={9} y={16} width={38} height={68} /><ImageTile x={53} y={16} width={38} height={68} /></>}
      {preset === "three" && [9, 38, 67].map((x) => <ImageTile key={x} x={x} y={16} width={24} height={68} />)}
      {(preset === "background" || preset === "backgroundHero") && <ImageTile x={2} y={2} width={96} height={96} />}
      {preset === "backgroundHero" && <ImageTile x={10} y={16} width={80} height={68} />}
      {preset === "custom" && <><rect x="68" y="44" width="25" height="32" fill="var(--recipe-bg)" stroke="none" /><path d="M73 60 H88 M80.5 48 V72" /></>}
    </svg>
  </span>;
}
