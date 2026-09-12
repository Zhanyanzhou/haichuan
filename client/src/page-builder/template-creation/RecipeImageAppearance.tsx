import { useId } from "react";
import { Input } from "antd";
import type { TemplateRecipe } from "../template-definition/generated/templateDefinition.generated";
import { isCanvasBackground, MEDIA_ROLES } from "./presets";
import { resolveMediaShapeChange } from "./mediaSelection";
import { parseRecipeRadiusInput } from "./recipeRadiusInput";
import "./RecipeImageAppearance.css";

type RecipeMedia = TemplateRecipe["media"][number];

interface RecipeImageAppearanceProps {
  recipe: TemplateRecipe;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<RecipeMedia>) => void;
  radiusInputs: Readonly<Record<string, string>>;
  onRadiusInputChange: (id: string, raw: string) => void;
}

const SHAPES = [["square", "直角"], ["rounded", "圆角"], ["circle", "圆形"]] as const;
const RATIOS = [[1, "1:1"], [4 / 5, "4:5"], [3 / 4, "3:4"], [16 / 9, "16:9"]] as const;

function FrameDiagram({ ratio = 1.5, radius = 0, adaptive = false }: {
  ratio?: number;
  radius?: number;
  adaptive?: boolean;
}) {
  const width = Math.min(70, 46 * ratio);
  const height = width / ratio;
  return <svg viewBox="0 0 96 60" aria-hidden="true" focusable="false">
    <rect x={(96 - width) / 2} y={(60 - height) / 2} width={width} height={height}
      rx={radius} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={adaptive ? "4 3" : undefined} />
    {adaptive && <path d="M39 30h18m-14-4-4 4 4 4m10-8 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />}
  </svg>;
}

/** 两种填充复用同一幅线框图，仅改变图片与外框的适配方式。 */
function FitDiagram({ mode }: { mode: RecipeMedia["fitMode"] }) {
  return <svg viewBox="0 0 120 80" aria-hidden="true" focusable="false">
    <rect x="10" y="9" width="100" height="62" fill="var(--recipe-bg)" />
    <svg x="10" y="9" width="100" height="62" viewBox="0 0 80 100"
      preserveAspectRatio={`xMidYMid ${mode === "cover" ? "slice" : "meet"}`} overflow="hidden">
      <rect x="1" y="1" width="78" height="98" fill="var(--recipe-surface, var(--recipe-bg))" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="24" cy="25" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M2 80 25 53 42 70 58 43 78 70M7 91h66" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
    <rect x="10" y="9" width="100" height="62" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>;
}

export default function RecipeImageAppearance({ recipe, selectedId, onSelect, onChange, radiusInputs, onRadiusInputChange }: RecipeImageAppearanceProps) {
  const hintId = useId();
  const selected = recipe.media.find((slot) => slot.id === selectedId) ?? recipe.media[0];
  if (!selected) return <div className="recipe-image-appearance__empty" role="status">
    当前布局没有图片。需要图片时，请返回布局步骤选择图片组合。
  </div>;

  const index = recipe.media.findIndex((slot) => slot.id === selected.id) + 1;
  const imageLabel = `图片 ${index}`;
  const background = isCanvasBackground(recipe, selected);
  const circle = selected.shape === "circle";
  const radiusRaw = radiusInputs[selected.id] ?? String(selected.borderRadius);
  const radiusInvalid = !background && !circle && parseRecipeRadiusInput(radiusRaw) === null;
  const radiusHintId = `${hintId}-radius`;
  const selectedShape = background ? "square" : circle ? "circle" : selected.borderRadius > 0 ? "rounded" : "square";
  const roleLabel = background ? "画布背景" : MEDIA_ROLES.find(([role]) => role === selected.role)?.[1] ?? selected.name;
  const change = (patch: Partial<RecipeMedia>) => onChange(selected.id, patch);

  return <div className="recipe-image-appearance">
    <div className="recipe-image-appearance__images" role="group" aria-label="选择要设置的图片">
      {recipe.media.map((slot, slotIndex) => <button key={slot.id} type="button"
        className="recipe-image-appearance__image" aria-label={`选择图片 ${slotIndex + 1}：${slot.name}`}
        aria-pressed={slot.id === selected.id} onClick={() => onSelect(slot.id)}>
        <span>图片 {slotIndex + 1}</span><strong>{slot.name}</strong>
      </button>)}
    </div>
    <div className="recipe-image-appearance__heading">
      <strong>{imageLabel} · {selected.name}</strong><span>用途：{roleLabel}</span>
    </div>
    <p id={hintId} className="recipe-image-appearance__hint">
      {background ? "背景图片跟随画布，形状和比例由画布决定。可设置图片填充方式。"
        : circle ? "圆形图片固定为 1:1。切换直角或圆角后可调整比例。"
          : "以下设置只影响当前图片，可随时切换其他图片继续调整。"}
    </p>

    <fieldset className="recipe-image-appearance__section" disabled={background} aria-describedby={hintId}>
      <legend>图片形状</legend>
      <div className="recipe-image-appearance__options">
        {SHAPES.map(([shape, label]) => <button key={shape} type="button"
          className="recipe-image-appearance__option" aria-label={`${imageLabel}形状：${label}`}
          aria-pressed={selectedShape === shape} onClick={() => {
            const patch = resolveMediaShapeChange(selected, shape);
            // 圆形只暂停圆角校验；切回矩形时仍保留先前待修正的原始输入。
            if (patch.borderRadius !== undefined && !(circle && parseRecipeRadiusInput(radiusRaw) === null)) {
              onRadiusInputChange(selected.id, String(patch.borderRadius));
            }
            change(patch);
          }}>
          <FrameDiagram ratio={shape === "circle" ? 1 : 1.5} radius={shape === "circle" ? 23 : shape === "rounded" ? 10 : 0} />
          <span>{label}</span>
        </button>)}
      </div>
      <label className="recipe-image-appearance__radius">
        圆角大小
        <Input aria-label={`${imageLabel}圆角大小`} inputMode="numeric" autoComplete="off"
          style={{ width: 148, maxWidth: "100%" }}
          value={background ? "0" : circle ? String(selected.borderRadius) : radiusRaw}
          disabled={background || circle} addonAfter="px" status={radiusInvalid ? "error" : undefined}
          aria-invalid={radiusInvalid} aria-describedby={radiusHintId}
          onChange={(event) => {
            const raw = event.target.value;
            onRadiusInputChange(selected.id, raw);
            const value = parseRecipeRadiusInput(raw);
            if (value !== null) change({ borderRadius: value });
          }} />
      </label>
      <p id={radiusHintId} role={radiusInvalid ? "alert" : undefined} style={{ margin: "8px 0 0", fontSize: 14 }}>
        {background || circle ? "当前形态不使用圆角大小；先前输入已保留，切回可调整的形态后继续检查。"
          : radiusInvalid ? "请输入 0～200 的整数。当前输入已保留，修正后才能继续确认或创建。" : "支持 0～200 的整数，0 表示直角。"}
      </p>
    </fieldset>

    <fieldset className="recipe-image-appearance__section" disabled={background || circle} aria-describedby={hintId}>
      <legend>图片比例</legend>
      <div className="recipe-image-appearance__options">
        {RATIOS.map(([ratio, label]) => <button key={label} type="button"
          className="recipe-image-appearance__option" aria-label={`${imageLabel}比例：${label}`}
          aria-pressed={!background && !selected.freeRatio && Math.abs(selected.aspectRatio - ratio) < .00001}
          onClick={() => change({ aspectRatio: ratio, freeRatio: false })}>
          <FrameDiagram ratio={ratio} /><span>{label}</span>
        </button>)}
        <button type="button" className="recipe-image-appearance__option" aria-label={`${imageLabel}比例：适应区域`}
          aria-pressed={!background && selected.freeRatio} onClick={() => change({ freeRatio: true })}>
          <FrameDiagram adaptive /><span>适应区域</span>
        </button>
      </div>
    </fieldset>

    <fieldset className="recipe-image-appearance__section">
      <legend>图片填充</legend>
      <div className="recipe-image-appearance__options recipe-image-appearance__options--fill">
        {([["cover", "填满裁切", "铺满外框，超出部分裁切"], ["contain", "完整显示", "保留整张图片，可能留白"]] as const).map(([mode, label, hint]) =>
          <button key={mode} type="button" className="recipe-image-appearance__option"
            aria-label={`${imageLabel}填充：${label}`} aria-pressed={selected.fitMode === mode}
            onClick={() => change({ fitMode: mode })}>
            <FitDiagram mode={mode} /><span>{label}</span><small>{hint}</small>
          </button>)}
      </div>
    </fieldset>
  </div>;
}
