import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Alert, Button, Checkbox, Input, Modal, Select, Switch, Tag, theme } from "antd";
import { createDynamicTemplateStableId } from "../template-definition/nodeRegistry";
import { TEMPLATE_RECIPE_SCHEMA, type TemplateDefinitionV2, type TemplateRecipe } from "../template-definition/generated/templateDefinition.generated";
import { validateTemplateRecipe } from "../template-definition/validateTemplateDefinition";
import { isCanvasBackground, imageRatioLabel, ALIGNMENTS, MARGINS, MARGIN_VALUES, RADIUS_VALUES, SPACING_VALUES, paletteFor, recommendedAlignment, BACKGROUNDS, CANVAS_PRESETS, CONTENTS, LAYOUTS, MEDIA_PRESETS, MEDIA_ROLES, PURPOSES, RADII, SPACINGS, STYLES, changeRecipePurpose, createContentSlot, createMediaSlots, createRecommendedRecipe, recommendedFor, styleFor, type RecipeSection } from "./presets";
import { generateTemplateFromRecipe } from "./generateTemplateFromRecipe";
import TemplateRecipePreview from "./TemplateRecipePreview";
import RecipeOptionPreview from "./RecipeOptionPreview";
import { applyInheritedMediaRadius, refreshRecipeMediaHistory, restoreRecipeMediaStructure, nextCustomMediaName, selectRecipeMediaPreset, type RecipeMediaHistory } from "./mediaSelection";
import RecipeImageAppearance from "./RecipeImageAppearance";
import { hasInvalidRecipeRadiusInputs } from "./recipeRadiusInput";
import "./NewTemplateRecipeModal.css";

const popupContainer = (trigger: HTMLElement) => trigger.closest<HTMLElement>(".ant-modal-content") ?? document.body;
const STEPS = ["用途", "尺寸", "布局", "图片", "内容", "风格", "确认"];
const dimensionValid = (value: number) => Number.isInteger(value) && value >= 1 && value <= 4096;
const CONTENT_LIMIT = TEMPLATE_RECIPE_SCHEMA.properties.content.maxItems;
const RECOMMENDATION_SECTIONS = [["canvas", "尺寸"], ["layout", "布局"], ["media", "图片"], ["content", "内容"], ["style", "风格"]] as const;
const labelOf = (options: readonly (readonly [string, string, ...string[]])[], key: string) => options.find(([id]) => id === key)?.[1] ?? key;

export default function NewTemplateRecipeModal({ onCancel, onCreate }: {
  onCancel: () => void;
  onCreate: (definition: TemplateDefinitionV2) => void;
}) {
  const { token } = theme.useToken();
  const [recipe, setRecipe] = useState<TemplateRecipe>(() => ({ ...createRecommendedRecipe("general"), layout: "topImageBottomContent",
    media: createMediaSlots(["heroImage"]), content: [createContentSlot("title"), createContentSlot("description")], rules: { aspectLocked: false, mediaArrangement: "row" } }));
  const [step, setStep] = useState(0);
  const [returnToConfirm, setReturnToConfirm] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [recommendationSections, setRecommendationSections] = useState<RecipeSection[]>([]);
  const [recommendationNotice, setRecommendationNotice] = useState("");
  const [selected, setSelected] = useState({ purpose: false, canvas: false, layout: false });
  const [dirty, setDirty] = useState<Partial<Record<RecipeSection, boolean>>>({});
  const [customSize, setCustomSize] = useState(false);
  const [dimensionInputs, setDimensionInputs] = useState<Partial<Record<"width" | "height", string>>>({});
  const [moreSizes, setMoreSizes] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mediaPreset, setMediaPreset] = useState("hero");
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [moreLayouts, setMoreLayouts] = useState(false);
  const [structureNotice, setStructureNotice] = useState("");
  const [previousStructure, setPreviousStructure] = useState<{ media: TemplateRecipe["media"]; preset: string; edited: Record<string, boolean> } | null>(null);
  const [mediaHistory, setMediaHistory] = useState<RecipeMediaHistory>({});
  const [mediaRadiusEdited, setMediaRadiusEdited] = useState<Record<string, boolean>>({});
  const [radiusInputs, setRadiusInputs] = useState<Record<string, string>>({});
  const [styleEdited, setStyleEdited] = useState<Partial<Record<keyof TemplateRecipe["style"], boolean>>>({});
  const [lockedRatio, setLockedRatio] = useState<number | null>(null);
  const [templateId] = useState(() => createDynamicTemplateStableId("tpl"));
  const [name, setName] = useState("未命名模板");
  const [open, setOpen] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const customSizeFields = useRef<HTMLDivElement>(null);
  const [trigger] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const recommendation = recommendedFor(recipe.purpose);
  const dimensionsValid = dimensionValid(recipe.canvas.width) && dimensionValid(recipe.canvas.height);
  const purposeValid = selected.purpose && (recipe.purpose !== "custom" || Boolean(recipe.customPurpose?.trim()));
  const radiusInputsInvalid = hasInvalidRecipeRadiusInputs(recipe, radiusInputs);
  const stepValid = step === 0 ? purposeValid : step === 1 ? selected.canvas && dimensionsValid : step === 2 ? selected.layout && recipe.media.every((slot) => slot.name.trim())
    : step === 3 ? !radiusInputsInvalid && recipe.media.every((slot) => slot.name.trim()) : step === 4 ? recipe.content.length <= CONTENT_LIMIT && recipe.content.every((slot) => slot.name.trim() && slot.defaultContent.length <= slot.maxLength) : true;
  const generated = useMemo(() => {
    try { return { definition: generateTemplateFromRecipe(recipe, { templateId, name: name.trim() || "未命名模板" }), error: "" }; }
    catch (error) { return { definition: null, error: error instanceof Error ? error.message : "模板方案无效，请返回检查配置。" }; }
  }, [recipe, templateId, name]);
  const canConfirm = Boolean(purposeValid && selected.canvas && dimensionsValid && selected.layout && generated.definition && !radiusInputsInvalid);
  const errorSteps = useMemo(() => {
    if (!generated.error) return [];
    const steps = new Set<number>();
    const fields = { canvas: 1, layout: 2, media: 2, content: 4, style: 5 };
    for (const issue of validateTemplateRecipe(recipe).issues) {
      const section = issue.path.split(".")[1];
      if (section === "media" && /aspectRatio|freeRatio|shape|fitMode|borderRadius/.test(issue.path)) steps.add(3);
      else if (section in fields) steps.add(fields[section as keyof typeof fields]);
    }
    if (steps.size) return [...steps];
    if (/圆形图片/.test(generated.error)) return [3];
    if (/Logo|背景图/.test(generated.error)) return [2];
    if (!recipe.media.length && !recipe.content.length) return [2, 4];
    return [1, 2, 3, 4];
  }, [generated.error, recipe]);
  const suggestedRecipe = useMemo(() => createRecommendedRecipe(recipe.purpose), [recipe.purpose]);
  const editStep = (index: number) => { setReturnToConfirm(true); setSubmitError(""); setStep(index); };
  const applyRecommendations = () => {
    if (!recommendationSections.length) return;
    const includes = (key: RecipeSection) => recommendationSections.includes(key);
    const style = includes("style") ? suggestedRecipe.style : recipe.style;
    setRecipe({ ...recipe,
      ...Object.fromEntries(recommendationSections.map((key) => [key, suggestedRecipe[key]])),
      ...(includes("media") ? { media: suggestedRecipe.media.map((slot) => ({ ...slot, borderRadius: slot.role === "logo" || slot.role === "backgroundImage" ? 0 : RADIUS_VALUES[style.radius] })) }
        : includes("style") ? { media: applyInheritedMediaRadius(recipe.media, RADIUS_VALUES[style.radius], mediaRadiusEdited) } : {}),
      ...(includes("canvas") ? { rules: { ...recipe.rules, aspectLocked: false } } : {}),
    });
    setDirty((previous) => ({ ...previous, ...Object.fromEntries(recommendationSections.map((key) => [key, false])) }));
    if (includes("canvas")) { setCustomSize(false); setDimensionInputs({}); setLockedRatio(null); }
    if (includes("media")) { setMediaPreset(recommendation.mediaPreset); setMediaRadiusEdited({}); setRadiusInputs({}); setMediaHistory({}); setPreviousStructure(null); setStructureNotice(""); }
    if (includes("style")) setStyleEdited({});
    setSelected((previous) => ({ ...previous, canvas: previous.canvas || includes("canvas"), layout: previous.layout || includes("layout") }));
    setRecommendationNotice(`已应用${RECOMMENDATION_SECTIONS.filter(([key]) => includes(key)).map(([, label]) => label).join("、")}推荐；其他配置已保留。`);
    setRecommendationSections([]);
  };
  useEffect(() => {
    setPreviewOpen(false);
    const frame = requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      heading.current?.parentElement?.scrollTo({ top: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [step]);
  const update = <K extends RecipeSection>(key: K, value: TemplateRecipe[K], edited = mediaRadiusEdited) => {
    setDirty((previous) => ({ ...previous, [key]: true }));
    if (key === "media") setMediaHistory((previous) => refreshRecipeMediaHistory(previous, value as TemplateRecipe["media"], edited));
    setRecipe((previous) => {
      const style = key === "style" ? value as TemplateRecipe["style"] : previous.style;
      const radius = RADIUS_VALUES[style.radius];
      const media = key === "media" ? value as TemplateRecipe["media"] : previous.media;
      return { ...previous, [key]: value, ...(key === "style" ? { media: applyInheritedMediaRadius(media, radius, edited) } : {}) };
    });
  };
  const changeDimension = (axis: "width" | "height", input: string) => {
    // 保留原始输入；无效值仅阻止生成，不能由数字控件在失焦时改成另一个尺寸。
    const value = input.trim() && Number.isFinite(Number(input)) ? Number(input) : 0;
    let { width, height } = recipe.canvas;
    if (axis === "width") width = value; else height = value;
    const inputs = { ...dimensionInputs, [axis]: input };
    if (lockedRatio && value > 0) {
      if (axis === "width") height = Math.round(value / lockedRatio); else width = Math.round(value * lockedRatio);
      inputs[axis === "width" ? "height" : "width"] = String(axis === "width" ? height : width);
    }
    setDimensionInputs(inputs);
    update("canvas", { width, height, aspectRatio: height > 0 ? width / height : 0 });
    setSelected((previous) => ({ ...previous, canvas: true }));
  };
  const styleUpdate = (patch: Partial<TemplateRecipe["style"]>) => {
    setStyleEdited((previous) => ({ ...previous, ...Object.fromEntries(Object.keys(patch).map((key) => [key, true])) }));
    update("style", { ...recipe.style, ...patch });
  };
  const updateMediaSlot = (id: string, patch: Partial<TemplateRecipe["media"][number]>) => {
    const edited = patch.borderRadius !== undefined || patch.shape !== undefined ? { ...mediaRadiusEdited, [id]: true } : mediaRadiusEdited;
    setMediaRadiusEdited(edited);
    update("media", recipe.media.map((slot) => slot.id === id ? { ...slot, ...patch } : slot), edited);
  };
  // 候选校验与点击共用这份结果，图片卡片保留数量和角色线框图。
  const mediaCandidates = MEDIA_PRESETS.map((preset) => {
    const cached = mediaHistory[preset.id];
    const reservedIds = Object.values(mediaHistory).flatMap((entry) => entry.media.map((slot) => slot.id));
    const available = [...recipe.media, ...(cached?.media ?? []).filter((slot) => !recipe.media.some((current) => current.id === slot.id))];
    const media = preset.id === mediaPreset ? recipe.media : preset.id === "custom"
      ? cached?.media.map((slot) => recipe.media.find((current) => current.id === slot.id) ?? slot) ?? (recipe.media.length ? recipe.media : selectRecipeMediaPreset([], ["custom"], RADIUS_VALUES[recipe.style.radius], reservedIds))
      : selectRecipeMediaPreset(available, preset.roles, RADIUS_VALUES[recipe.style.radius], reservedIds);
    return { ...preset, media: applyInheritedMediaRadius(media, RADIUS_VALUES[recipe.style.radius], { ...cached?.edited, ...mediaRadiusEdited }) };
  });
  const chooseMedia = (id: string, media: TemplateRecipe["media"]) => {
    if (id === mediaPreset) return;
    const removed = recipe.media.filter((slot) => !media.some((next) => next.id === slot.id));
    setPreviousStructure({ media: structuredClone(recipe.media), preset: mediaPreset, edited: { ...mediaRadiusEdited } });
    setStructureNotice(removed.length ? `已移出：${removed.map((slot) => slot.name).join("、")}。可撤回本次变更，切回原组合也可恢复设置。` : "图片结构已更新，保留了对应图片的已有设置。");
    setMediaHistory((previous) => ({ ...previous, [mediaPreset]: { media: structuredClone(recipe.media), edited: { ...mediaRadiusEdited } } }));
    setMediaPreset(id);
    const edited = Object.fromEntries(media.filter((slot) => mediaRadiusEdited[slot.id] || mediaHistory[id]?.edited[slot.id]).map((slot) => [slot.id, true]));
    setMediaRadiusEdited(edited);
    update("media", structuredClone(media), edited);
  };
  const arrangement = recipe.rules.mediaArrangement === "column" ? "column" : "row";
  const ordinaryImages = recipe.media.filter((slot) => !isCanvasBackground(recipe, slot) && slot.role !== "logo");
  const hasCompanions = ordinaryImages.some((slot) => slot.role === "heroImage") && ordinaryImages.some((slot) => slot.role === "secondaryImage");
  const arrangementLabel = hasCompanions ? arrangement === "row" ? "主图在左，副图在右" : "主图在上，副图在下" : arrangement === "row" ? "图片并排" : "图片上下排列";
  const returnToLayout = () => { setStep(2); setPreviewOpen(false); };
  const activeImageIndex = Math.max(0, recipe.media.findIndex((slot) => slot.id === selectedImageId));
  const highlightedImage = step === 3 ? Object.values(generated.definition?.nodes ?? {}).filter((node) => node.type === "ImageSlot")[activeImageIndex] : undefined;
  const changeStructure = (media: TemplateRecipe["media"]) => {
    setPreviousStructure({ media: structuredClone(recipe.media), preset: mediaPreset, edited: { ...mediaRadiusEdited } });
    const removed = recipe.media.filter((slot) => !media.some((next) => next.id === slot.id));
    setStructureNotice(removed.length ? `已移出：${removed.map((slot) => slot.name).join("、")}。可撤回本次变更。` : "图片结构已更新，可撤回本次变更。");
    update("media", media);
  };
  const card = (key: string, label: string, active: boolean, action: () => void, preview?: React.ReactNode, recommended = false) => (
    <button type="button" key={key} className="template-recipe__card" aria-label={label} aria-pressed={active} onClick={action}>
      {preview}<strong>{label}</strong>{recommended && <Tag>推荐</Tag>}
    </button>
  );
  return <Modal open={open} title="创建模板" centered width={1320} maskClosable={false} className="template-recipe-modal"
    style={{ maxWidth: "calc(100vw - 24px)", "--recipe-bg": token.colorBgContainer, "--recipe-ink": token.colorText,
      "--recipe-border": token.colorBorder, "--recipe-muted": token.colorTextSecondary, "--recipe-fill": token.colorFillSecondary,
      "--recipe-primary": token.colorPrimary } as CSSProperties}
    onCancel={() => setOpen(false)} afterClose={() => {
      onCancel();
      // 动态挂载的 Modal 没有稳定 trigger 节点，显式恢复本次打开前的键盘位置。
      requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus(); });
    }}
    footer={<div className="template-recipe__footer">
      <Button className="template-recipe__cancel" aria-label="取消" disabled={submitting} onClick={() => setOpen(false)}>取消</Button>
      <span className="template-recipe__footer-spacer" />
      {step > 0 && <Button className="template-recipe__previous" disabled={submitting} onClick={() => setStep(step - 1)}>上一步</Button>}
      {!returnToConfirm && step >= 2 && step < 5 && <Button className="template-recipe__skip" type="text" title="未配置项使用推荐值，已修改项保留。" disabled={!stepValid || !canConfirm} onClick={() => setStep(6)}>前往确认（未配置项用推荐值）</Button>}
      {step < 6 ? <Button className="template-recipe__continue" type="primary" disabled={!stepValid || (returnToConfirm && !canConfirm)} onClick={() => { setStep(returnToConfirm ? 6 : step + 1); setReturnToConfirm(false); }}>{returnToConfirm ? "返回确认" : "下一步"}</Button>
        : <Button className="template-recipe__continue" type="primary" loading={submitting} disabled={!canConfirm || !name.trim()} onClick={() => {
          if (!generated?.definition || !canConfirm || submitting) return;
          setSubmitting(true);
          try { onCreate(generated.definition); } catch (error) { setSubmitError(error instanceof Error ? error.message : "创建失败，配置已保留。"); }
          finally { setSubmitting(false); }
        }}>创建模板</Button>}
    </div>}>
    <ol className="template-recipe__steps" aria-label="创建进度">{STEPS.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
    <button type="button" className="template-recipe__preview-toggle" aria-expanded={previewOpen} onClick={() => setPreviewOpen(!previewOpen)}>{previewOpen ? "返回选项" : "查看预览"}</button>
    <div className="template-recipe__workspace" data-preview-open={previewOpen}>
    <div className="template-recipe__body">
      <h3 ref={heading} tabIndex={-1}>{["你准备创建什么类型的模板？", "选择画布尺寸", "选择布局结构", "设置每张图片的外观", "这个模板需要展示哪些内容？", "选择基础视觉风格", "确认模板方案"][step]}</h3>
      {step === 0 && <>
        <p>用途只影响推荐，后续仍可选择任意尺寸和布局。</p>
        <p>通用模板：逐项选择配置；自定义：还可填写自己的用途名称。</p>
        <div className="template-recipe__grid">{PURPOSES.map(([id, label]) => card(id, label, selected.purpose && recipe.purpose === id, () => {
          setRecipe((previous) => { const next = changeRecipePurpose(previous, id, dirty); return { ...next, media: applyInheritedMediaRadius(next.media, RADIUS_VALUES[next.style.radius], mediaRadiusEdited), rules: { ...next.rules, mediaArrangement: next.rules.mediaArrangement ?? "row" } }; });
          if (!dirty.media) setMediaPreset(recommendedFor(id).mediaPreset);
          setSelected((previous) => ({ ...previous, purpose: true }));
          setRecommendationSections([]); setRecommendationNotice("");
        }))}</div>
        {recipe.purpose === "custom" && <label className="template-recipe__field">自定义用途<Input aria-label="自定义用途" value={recipe.customPurpose} maxLength={80} onChange={(event) => setRecipe({ ...recipe, customPurpose: event.target.value })} /></label>}
        {selected.purpose && <details className="template-recipe__recommendations">
          <summary>重新应用当前用途推荐</summary>
          <p>只替换勾选的配置。替换尺寸会解除锁比；替换图片会重建槽位与图片设置；替换内容会重建槽位及文案。未勾选部分保持不变，仅替换风格时保留已有图片的独立形态与圆角。</p>
          <div className="template-recipe__recommendation-list">{RECOMMENDATION_SECTIONS.map(([key, label]) => {
            const available = key === "style" || key === "canvas" && recommendation.ratios.length > 0 || key === "layout" && recommendation.layouts.length > 0 || key === "media" && Boolean(recommendation.mediaPreset) || key === "content" && recommendation.contents.length > 0;
            const result = key === "canvas" ? `${suggestedRecipe.canvas.width} × ${suggestedRecipe.canvas.height} px`
              : key === "layout" ? labelOf(LAYOUTS, suggestedRecipe.layout)
              : key === "media" ? suggestedRecipe.media.map((slot) => slot.name).join("、")
              : key === "content" ? suggestedRecipe.content.map((slot) => slot.name).join("、")
              : `${labelOf(STYLES, suggestedRecipe.style.variant)} · ${labelOf(BACKGROUNDS, suggestedRecipe.style.background)} · ${RADIUS_VALUES[suggestedRecipe.style.radius]} px 圆角 · ${labelOf(SPACINGS, suggestedRecipe.style.spacing)}间距（保留已有图片形态）`;
            return <div key={key}><Checkbox aria-label={`应用${label}推荐`} disabled={!available} checked={recommendationSections.includes(key)} onChange={(event) => setRecommendationSections((previous) => event.target.checked ? [...previous, key] : previous.filter((item) => item !== key))}>{label}</Checkbox><span>{available ? result : "当前用途无推荐，保留你的选择"}</span></div>;
          })}</div>
          <Button disabled={!recommendationSections.length} onClick={applyRecommendations}>确认应用已选推荐</Button>
          {recommendationNotice && <p role="status">{recommendationNotice}</p>}
        </details>}
      </>}
      {step === 1 && <>
        {["常用", "更多"].map((group, index) => (index === 0 || moreSizes) && <section key={group}><h4>{group}</h4><div className="template-recipe__grid template-recipe__grid--four">
          {CANVAS_PRESETS.slice(index * 4, index * 4 + 4).map((preset) => card(preset.name, `${preset.name} ${preset.ratio}`, selected.canvas && !customSize && recipe.canvas.width === preset.width && recipe.canvas.height === preset.height, () => {
            update("canvas", { width: preset.width, height: preset.height, aspectRatio: preset.width / preset.height });
            setSelected((previous) => ({ ...previous, canvas: true })); setCustomSize(false); setLockedRatio(null); setDimensionInputs({});
            setRecipe((previous) => ({ ...previous, rules: { ...previous.rules, aspectLocked: false } }));
          }, <><span className="template-recipe__ratio"><i style={{ width: 64 * Math.min(1, preset.width / preset.height), height: 64 * Math.min(1, preset.height / preset.width) }} /></span><small>{preset.width} × {preset.height} px</small></>, recommendation.ratios.includes(preset.ratio)))}
        </div></section>)}
        <Button type="text" aria-expanded={moreSizes} onClick={() => setMoreSizes(!moreSizes)}>{moreSizes ? "收起更多尺寸" : "更多尺寸"}</Button>
        <Button block aria-pressed={customSize} aria-expanded={customSize} onClick={() => {
          setCustomSize(true); setMoreSizes(false);
          setSelected((previous) => ({ ...previous, canvas: true })); setDirty({ ...dirty, canvas: true });
          requestAnimationFrame(() => {
            customSizeFields.current?.scrollIntoView({ block: "nearest" });
            customSizeFields.current?.querySelector("input")?.focus({ preventScroll: true });
          });
        }}>自定义尺寸</Button>
        {customSize && <div ref={customSizeFields} className="template-recipe__row">
          {([['width', '宽度'], ['height', '高度']] as const).map(([axis, label]) => <label key={axis}>{label}<Input
            role="spinbutton" inputMode="decimal" aria-label={label} aria-valuemin={1} aria-valuemax={4096}
            aria-valuenow={Number.isFinite(recipe.canvas[axis]) ? recipe.canvas[axis] : undefined}
            aria-invalid={!dimensionValid(recipe.canvas[axis])} aria-describedby="template-recipe-dimension-help"
            value={dimensionInputs[axis] ?? String(recipe.canvas[axis])} onChange={(event) => changeDimension(axis, event.target.value)}
            onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); changeDimension(axis, String(recipe.canvas[axis] + (event.key === "ArrowUp" ? 1 : -1))); } }}
          /></label>)}
          <label><Switch aria-label="锁定比例" checked={lockedRatio !== null} disabled={!dimensionsValid && lockedRatio === null} onChange={(locked) => { setLockedRatio(locked ? recipe.canvas.aspectRatio : null); setRecipe({ ...recipe, rules: { ...recipe.rules, aspectLocked: locked } }); }} /> 锁定比例</label>
          <small id="template-recipe-dimension-help" role={dimensionsValid ? undefined : "alert"}>宽度和高度须为 1–4096 px 的整数。</small>
        </div>}
      </>}
      {step === 2 && <>
        <p>先确定图文位置，再选择图片数量与排列。所有线框图均按 {recipe.canvas.width} × {recipe.canvas.height} 画幅展示。</p>
        <h4>整体构图</h4>
        <div className="template-recipe__grid template-recipe__composition-grid">
          {LAYOUTS.filter((_, index) => moreLayouts || index < 6 || recipe.layout === LAYOUTS[index][0]).map(([id, label]) => card(id, label, selected.layout && recipe.layout === id, () => { update("layout", id); setSelected({ ...selected, layout: true }); }, <RecipeOptionPreview recipe={{ ...recipe, layout: id }} />, recommendation.layouts.includes(id)))}
        </div>
        <Button type="text" aria-expanded={moreLayouts} onClick={() => setMoreLayouts(!moreLayouts)}>{moreLayouts ? "收起更多布局" : "更多布局"}</Button>
        <h4>图片区结构</h4>
        <p>这里决定几张图片、主次关系和位置；下一步分别设置图片外观。</p>
        <div className="template-recipe__grid template-recipe__composition-grid" aria-label="图片区结构选项">
          {mediaCandidates.map((preset) => card(preset.id, preset.name, mediaPreset === preset.id, () => chooseMedia(preset.id, preset.media), <RecipeOptionPreview recipe={{ ...recipe, media: preset.media }} />, recommendation.mediaPreset === preset.id))}
        </div>
        {ordinaryImages.length > 1 && <><h4>图片排列</h4><div className="template-recipe__arrangements" role="group" aria-label="图片排列">
          {(["row", "column"] as const).map((value) => card(value, hasCompanions ? value === "row" ? "主图在左，副图在右" : "主图在上，副图在下" : value === "row" ? "图片并排" : "图片上下排列", arrangement === value, () => {
            setDirty((previous) => ({ ...previous, layout: true }));
            setRecipe((previous) => ({ ...previous, rules: { ...previous.rules, mediaArrangement: value } }));
          }, <RecipeOptionPreview recipe={{ ...recipe, rules: { ...recipe.rules, mediaArrangement: value } }} />))}
        </div><p>排列方向已确定，修改单张图片比例不会自动换成另一种排列。</p></>}
        <p className="template-recipe__selection-summary">已选：{recipe.media.map((slot) => `${slot.name}${isCanvasBackground(recipe, slot) ? "（画布背景）" : ""}`).join("、") || "无图片"}</p>
        {recipe.layout === "fullImageOverlay" && <p>背景图片铺满画布；没有单独背景图时，首张主图片用作背景，原图片设置会保留。</p>}
        {structureNotice && <p role="status">{structureNotice} {previousStructure && <Button size="small" onClick={() => {
          const restored = restoreRecipeMediaStructure(previousStructure, recipe.media, mediaRadiusEdited);
          update("media", applyInheritedMediaRadius(restored.media, RADIUS_VALUES[recipe.style.radius], restored.edited), restored.edited); setMediaPreset(previousStructure.preset); setMediaRadiusEdited(restored.edited); setPreviousStructure(null); setStructureNotice("已恢复上次图片结构，保留现有图片的最新设置。");
        }}>撤回结构变更</Button>}</p>}
        {mediaPreset === "custom" && <><div className="template-recipe__slot-list">{recipe.media.map((slot, index) => <div className="template-recipe__slot-row" key={slot.id}>
          <Input aria-label={`图片槽位 ${index + 1} 名称`} value={slot.name} maxLength={80} onChange={(event) => update("media", recipe.media.map((item) => item.id === slot.id ? { ...item, name: event.target.value } : item))} />
          <Select placement="topLeft" getPopupContainer={popupContainer} aria-label={`图片槽位 ${index + 1} 类型`} value={slot.role} options={MEDIA_ROLES.map(([value, label]) => ({ value, label }))} onChange={(role) => changeStructure(recipe.media.map((item) => item.id === slot.id ? { ...item, role } : item))} />
          <Button disabled={recipe.media.length === 1} aria-label={`删除图片槽位 ${index + 1}`} onClick={() => changeStructure(recipe.media.filter((item) => item.id !== slot.id))}>删除</Button>
        </div>)}</div>
        <Button disabled={recipe.media.length >= 6} onClick={() => { const slot = createMediaSlots(["custom"])[0]; changeStructure([...recipe.media, { ...slot, borderRadius: RADIUS_VALUES[recipe.style.radius], id: `media-${crypto.randomUUID()}`, name: nextCustomMediaName(recipe.media) }]); }}>添加图片槽位</Button><small>自定义 1–6 个图片位置，创建后可继续增补。</small></>}
        <Checkbox checked={recipe.media.some((slot) => slot.role === "logo")} disabled={!recipe.media.some((slot) => slot.role === "logo") && recipe.media.length >= 6} onChange={(event) => {
          const cached = mediaHistory.$logo ?? Object.values(mediaHistory).find((entry) => entry.media.some((slot) => slot.role === "logo"));
          const logo = cached?.media.find((slot) => slot.role === "logo");
          const media = event.target.checked ? [...recipe.media, logo ? { ...logo } : { ...createMediaSlots(["logo"])[0], id: `media-${crypto.randomUUID()}` }] : recipe.media.filter((slot) => slot.role !== "logo");
          const edited = event.target.checked && logo ? { ...mediaRadiusEdited, [logo.id]: Boolean(cached?.edited[logo.id]) } : mediaRadiusEdited;
          setPreviousStructure({ media: structuredClone(recipe.media), preset: mediaPreset, edited: { ...mediaRadiusEdited } });
          setMediaHistory((previous) => ({ ...previous, [mediaPreset]: { media: structuredClone(recipe.media), edited: { ...mediaRadiusEdited } },
            ...(!event.target.checked ? { $logo: { media: recipe.media.filter((slot) => slot.role === "logo").map((slot) => ({ ...slot })), edited: { ...mediaRadiusEdited } } } : {}) }));
          setMediaRadiusEdited(edited);
          setStructureNotice(event.target.checked ? logo ? "已恢复 Logo 位置与已有设置。" : "已添加 Logo 位置。" : "已移出 Logo，再次开启或撤回可恢复设置。");
          update("media", media, edited); setMediaPreset(mediaPreset === "custom" ? "custom" : MEDIA_PRESETS.find((preset) => preset.roles.join(",") === media.map((slot) => slot.role).join(","))?.id ?? "custom");
        }}>显示 Logo 位置</Checkbox>
        <p>需要调整单张图片的形状、比例和填充，请进入下一步“图片”。</p>
      </>}
      {step === 3 && <>
        <div className="template-recipe__structure-summary"><span>{recipe.canvas.width} × {recipe.canvas.height} · {labelOf(LAYOUTS, recipe.layout)} · {recipe.media.length} 个图片位置{ordinaryImages.length > 1 ? ` · ${arrangementLabel}` : ""}</span><Button onClick={returnToLayout}>修改布局</Button></div>
        <p>选择一张图片设置外观，右侧会标出对应对象。整张画幅和排列保持不变。</p>
        <RecipeImageAppearance recipe={recipe} selectedId={selectedImageId} onSelect={setSelectedImageId} onChange={updateMediaSlot}
          radiusInputs={radiusInputs} onRadiusInputChange={(id, raw) => {
            setRadiusInputs((previous) => ({ ...previous, [id]: raw }));
            setDirty((previous) => ({ ...previous, media: true }));
          }} />
      </>}
      {step === 4 && <>
        <p>勾选需要的内容，具体文案在创建后填写。</p>
        <p role="status">已选 {recipe.content.length}/{CONTENT_LIMIT} 项内容。{recipe.content.length >= CONTENT_LIMIT && "已达到上限，请先取消一项或删除自定义文字，再添加其他内容。"}</p>
        <div className="template-recipe__grid">{CONTENTS.filter(([role]) => role !== "customText").map(([role, label]) => <Checkbox key={role} checked={recipe.content.some((slot) => slot.role === role)} disabled={recipe.content.length >= CONTENT_LIMIT && !recipe.content.some((slot) => slot.role === role)} onChange={(event) => update("content", event.target.checked ? recipe.content.length < CONTENT_LIMIT ? [...recipe.content, createContentSlot(role)] : recipe.content : recipe.content.filter((slot) => slot.role !== role))}>{label}{recommendation.contents.includes(role) && <Tag>推荐</Tag>}</Checkbox>)}</div>
        <p>Logo 和图片位置由布局统一管理。<Button type="link" onClick={returnToLayout}>修改布局</Button></p>
        <div className="template-recipe__slot-list">{recipe.content.filter((slot) => slot.role === "customText").map((slot, index) => <div key={slot.id} className="template-recipe__content-row">
          <label>自定义文字 {index + 1}<Input aria-label={`自定义文字 ${index + 1} 名称`} value={slot.name} maxLength={80} onChange={(event) => update("content", recipe.content.map((item) => item.id === slot.id ? { ...item, name: event.target.value } : item))} /></label>
          <Button aria-label={`删除自定义文字 ${index + 1}`} onClick={() => update("content", recipe.content.filter((item) => item.id !== slot.id))}>删除</Button>
        </div>)}</div>
        <Button disabled={recipe.content.length >= CONTENT_LIMIT} onClick={() => { if (recipe.content.length < CONTENT_LIMIT) update("content", [...recipe.content, createContentSlot("customText", `customText-${crypto.randomUUID()}`)]); }}>添加自定义文字</Button>
      </>}
      {step === 5 && <>
        <div className="template-recipe__grid">{STYLES.map(([id, label]) => card(id, label, recipe.style.variant === id, () => {
          const next = id === "custom" ? { ...recipe.style, variant: id } : styleFor(id);
          for (const key of Object.keys(styleEdited) as (keyof TemplateRecipe["style"])[]) Object.assign(next, { [key]: recipe.style[key] });
          update("style", next);
        }))}</div>
        {recipe.style.variant === "vibrant" && recipe.style.background !== "brand" && <p>活力风格推荐品牌色，可在配色中主动选择。</p>}
        <div className="template-recipe__style-fields">
          <label>背景<Select placement="topLeft" getPopupContainer={popupContainer} aria-label="背景" value={recipe.style.background} options={BACKGROUNDS.map(([value, label]) => ({ value, label }))} onChange={(background) => styleUpdate({ background,
            ...(background !== "custom" ? paletteFor(background, recipe.style.primaryColor) : {}) })} /></label>
          <label>圆角<Select placement="topLeft" getPopupContainer={popupContainer} aria-label="圆角" value={recipe.style.radius} options={RADII.map(([value, label]) => ({ value, label }))} onChange={(radius) => styleUpdate({ radius })} /></label>
          <label>间距<Select placement="topLeft" getPopupContainer={popupContainer} aria-label="间距" value={recipe.style.spacing} options={SPACINGS.map(([value, label]) => ({ value, label }))} onChange={(spacing) => styleUpdate({ spacing })} /></label>
          <label>内容边距<Select placement="topLeft" getPopupContainer={popupContainer} aria-label="内容边距" value={recipe.style.margin ?? "standard"} options={MARGINS.map(([value, label]) => ({ value, label }))} onChange={(margin) => styleUpdate({ margin })} /></label>
          <label>对齐<Select placement="topLeft" getPopupContainer={popupContainer} aria-label="对齐" value={recipe.style.alignment ?? recommendedAlignment(recipe.layout)} options={ALIGNMENTS.map(([value, label]) => ({ value, label }))} onChange={(alignment) => styleUpdate({ alignment })} /></label>
        </div>
        <details className="template-recipe__colors" open={recipe.style.variant === "custom" || recipe.style.background === "custom" || recipe.style.background === "brand" ? true : undefined}><summary>自定义颜色</summary><div className="template-recipe__style-fields">{([["primaryColor", "主题颜色"], ["backgroundColor", "背景颜色"], ["textColor", "文字颜色"]] as const).map(([key, label]) => <label key={key}>{label}<input aria-label={label} type="color" value={recipe.style[key]} onChange={(event) => styleUpdate({ [key]: event.target.value,
          ...(key === "primaryColor" && recipe.style.background === "brand" ? paletteFor("brand", event.target.value) : key !== "primaryColor" ? { background: "custom" } : {}) })} /></label>)}</div></details>
      </>}
      {step === 6 && <div className="template-recipe__confirmation">
        <div><label className="template-recipe__field">模板名称<Input aria-label="模板名称" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
          <dl data-template-recipe-confirmation-summary="true"><dt>模板用途<Button type="link" size="small" aria-label="修改用途" onClick={() => editStep(0)}>修改</Button></dt><dd>{recipe.purpose === "custom" ? recipe.customPurpose : labelOf(PURPOSES, recipe.purpose)}</dd>
            <dt>画布<Button type="link" size="small" aria-label="修改尺寸" onClick={() => editStep(1)}>修改</Button></dt><dd>{recipe.canvas.width} × {recipe.canvas.height} px · {CANVAS_PRESETS.find((item) => item.width === recipe.canvas.width && item.height === recipe.canvas.height)?.ratio ?? `${recipe.canvas.width}:${recipe.canvas.height}`}</dd>
            <dt>布局<Button type="link" size="small" aria-label="修改布局" onClick={() => editStep(2)}>修改</Button></dt><dd>{labelOf(LAYOUTS, recipe.layout)}</dd><dt>图片<Button type="link" size="small" aria-label="修改图片" onClick={() => editStep(3)}>修改</Button></dt><dd>{recipe.media.map((slot) => slot.name).join("、") || "无图片"}</dd>
            {ordinaryImages.length > 1 && <><dt>图片排列</dt><dd>{arrangementLabel}</dd></>}
            <dt>图片设置</dt><dd>{recipe.media.map((slot) => `${slot.name}：${isCanvasBackground(recipe, slot) ? "跟随画布" : slot.freeRatio ? "自由比例" : imageRatioLabel(slot.aspectRatio)}，${slot.fitMode === "contain" ? "完整显示" : "填满"}，${isCanvasBackground(recipe, slot) ? "无圆角" : slot.shape === "circle" ? "圆形" : `${slot.borderRadius} px 圆角`}`).join("；") || "无图片"}</dd>
            <dt>内容<Button type="link" size="small" aria-label="修改内容" onClick={() => editStep(4)}>修改</Button></dt><dd>{recipe.content.map((slot) => slot.name).join("、") || "无文字"}</dd>
            <dt>实际参数</dt><dd>圆角 {RADIUS_VALUES[recipe.style.radius]} px；基础 / 区域间距 {SPACING_VALUES[recipe.style.spacing]} / {SPACING_VALUES[recipe.style.spacing] * 2} px；四边留白 {Math.round(Math.min(recipe.canvas.width, recipe.canvas.height) * MARGIN_VALUES[recipe.style.margin ?? "standard"])} px；{labelOf(ALIGNMENTS, recipe.style.alignment ?? recommendedAlignment(recipe.layout))}</dd>
            <dt>风格<Button type="link" size="small" aria-label="修改风格" onClick={() => editStep(5)}>修改</Button></dt><dd>{labelOf(STYLES, recipe.style.variant)} · {labelOf(BACKGROUNDS, recipe.style.background)} · {labelOf(RADII, recipe.style.radius)}圆角 · {labelOf(SPACINGS, recipe.style.spacing)}间距</dd></dl>
          <dl className="template-recipe__palette-summary"><dt>实际配色</dt><dd>{([["primaryColor", "主题色"], ["backgroundColor", "背景色"], ["textColor", "文字色"]] as const).map(([key, label]) => <span key={key} className="template-recipe__color-value"><i aria-hidden="true" style={{ backgroundColor: recipe.style[key] }} />{label} {recipe.style[key].toUpperCase()}</span>)}</dd></dl>
          <p>创建后进入模板设计页面继续精修，主动保存后才会保存草稿。</p>
        </div>
      </div>}
      {submitError && <Alert type="error" showIcon message={submitError} />}
      {radiusInputsInvalid && <Alert type="warning" showIcon message="图片圆角尚未更新，请输入 0–200 的整数。"
        description={<><span>预览保留上次有效圆角，修正后才能确认创建。</span>{step !== 3 && <Button size="small" onClick={() => { setStep(3); setPreviewOpen(false); }}>修改图片圆角</Button>}</>} />}
      {generated.error && (step >= 3 || returnToConfirm || errorSteps.includes(step)) && <Alert className="template-recipe__error" type="warning" showIcon message={generated.error} description={<div className="template-recipe__error-actions">{errorSteps.map((index) => <Button key={index} size="small" onClick={() => { setStep(index); setPreviewOpen(false); }}>{`修改${STEPS[index]}`}</Button>)}</div>} />}
    </div>
    <aside className="template-recipe__live-preview" aria-label="当前方案">
      <div className="template-recipe__preview-heading"><strong>{selected.purpose ? "方案预览" : "中性示例（尚未选择用途）"}</strong><span>{recipe.canvas.width} × {recipe.canvas.height}</span></div>
      <p>{radiusInputsInvalid ? "圆角尚未更新：预览保留上次有效值，请先修正图片圆角。" : step === 6 ? "确认后进入编辑器，可继续调整。" : "随选择更新，未配置部分使用推荐值。"}</p>
      <p>示例文字仅用于预览，不会保存或发布；正式默认文案请在创建后填写。</p>
      {step === 3 && recipe.media[activeImageIndex] && <p className="template-recipe__active-image" role="status">正在设置：图片 {activeImageIndex + 1} · {recipe.media[activeImageIndex].name}</p>}
      {step === 6 && <div className="template-recipe__preview-devices" role="group" aria-label="确认预览设备">{([['desktop', '桌面'], ['mobile', '手机']] as const).map(([device, label]) => <Button key={device} size="small" aria-label={label} aria-pressed={previewDevice === device} type={previewDevice === device ? "primary" : "default"} onClick={() => setPreviewDevice(device)}>{label}</Button>)}</div>}
      {step === 6 && previewDevice === "mobile" && <p>手机布局 · 390 px，可在预览内滚动查看完整内容。</p>}
      <div className="template-recipe__preview-stage">
        {generated.definition ? <TemplateRecipePreview definition={generated.definition} device={step === 6 ? previewDevice : "desktop"} highlightedNodeId={highlightedImage?.nodeId} /> : dimensionsValid && !recipe.media.length && !recipe.content.length
          ? <div className="template-recipe__preview template-recipe__empty-preview" aria-label="生成方案预览" style={{ aspectRatio: recipe.canvas.aspectRatio, maxWidth: `calc(min(480px, 48dvh) * ${recipe.canvas.aspectRatio})`, background: recipe.style.backgroundColor }}>选择图片或内容后，在这里呈现方案。</div>
          : <p>方案暂未更新，请先修改配置。</p>}
      </div>
      <p className="template-recipe__selection-summary">{labelOf(LAYOUTS, recipe.layout)} · {recipe.media.length} 个图片位置{ordinaryImages.length > 1 ? ` · ${arrangementLabel}` : ""} · {recipe.content.length} 项内容</p>
    </aside>
    </div>
    <div className="template-recipe__announcement" aria-live="polite" aria-atomic="true">
      {selected.purpose ? `${recipe.canvas.width} × ${recipe.canvas.height} px，${labelOf(LAYOUTS, recipe.layout)}，${recipe.media.length} 个图片位置，${recipe.content.length} 项内容。${generated.error || ""}` : "尚未选择模板用途，当前展示中性示例。"}
    </div>
  </Modal>;
}
