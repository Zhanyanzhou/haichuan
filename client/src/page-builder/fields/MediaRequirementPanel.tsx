import { useEffect, useMemo, useState } from "react";
import { RESPONSIVE_CANVAS } from "@/page-builder/config/blockContracts";

type ImageSlot = {
  label: string;
  url?: string;
  targetRatio?: [number, number];
  recommendedSize?: string;
  required?: boolean;
};

type ImageState =
  | { status: "idle" | "loading" | "error" }
  | { status: "ready"; width: number; height: number };

type MediaSpec = {
  title: string;
  description: string;
  viewport: string;
  slots: ImageSlot[];
};

function getMediaSpec(type: string, props: Record<string, any>): MediaSpec | null {
  switch (type) {
    case "首屏主视觉":
      return {
        title: "首屏双端素材",
        description: `电脑画布为 ${RESPONSIVE_CANVAS.desktop.width}×${RESPONSIVE_CANVAS.desktop.height}，主图按 16:7 裁切；只有手机使用独立竖图。文字请在右侧字段编辑，不要烧录进图片。`,
        viewport: `电脑画布 ${RESPONSIVE_CANVAS.desktop.width}×${RESPONSIVE_CANVAS.desktop.height}｜手机独立画布 390×844（≤767px）`,
        slots: [
          { label: "电脑端主图", url: props.desktopImage, targetRatio: [16, 7], recommendedSize: "建议不低于 3360×1470（16:7）", required: true },
          { label: "手机端主图", url: props.mobileImage, targetRatio: [4, 5], recommendedSize: "建议不低于 1500×1875（4:5）", required: true },
        ],
      };
    case "单图海报":
      return {
        title: "单图海报双端素材",
        description: "平板继承电脑构图；只有手机会自动采用竖图。未填写手机图时会回退电脑图，并可能产生裁切。",
        viewport: "电脑/平板 3:2｜手机 3:4（≤767px）",
        slots: [
          { label: "电脑端海报", url: props.desktopImage, targetRatio: [3, 2], recommendedSize: "建议不低于 2400×1600", required: true },
          { label: "手机端海报", url: props.mobileImage, targetRatio: [3, 4], recommendedSize: "建议不低于 1170×1560" },
        ],
      };
    case "全屏出血图":
      return {
        title: "全屏图双端素材",
        description: "这是固定比例的全宽视觉，不随设备视口高度拉伸。手机建议单独准备竖图。",
        viewport: "电脑 21:6｜手机 4:5（≤767px）",
        slots: [
          { label: "电脑端背景图", url: props.image, targetRatio: [21, 6], recommendedSize: "建议不低于 3360×960（21:6）", required: true },
          { label: "手机端背景图", url: props.mobileImage, targetRatio: [4, 5], recommendedSize: "建议不低于 1500×1875", required: true },
        ],
      };
    case "轮播图":
      return {
        title: "轮播图双端素材",
        description: "轮播使用固定比例而不是任意高度：手机可单独选竖幅或标准竖图。每张电脑图建议配置对应手机图。",
        viewport: `电脑 ${props.desktopRatio === "standard" ? "16:9" : "21:6"}｜手机 ${props.mobileRatio === "standard" ? "4:5" : "3:4"}（≤767px）`,
        slots: (Array.isArray(props.images) ? props.images : []).flatMap((image: any, index: number) => [
          { label: `第 ${index + 1} 张电脑图`, url: image?.url, targetRatio: props.desktopRatio === "standard" ? [16, 9] : [21, 6], recommendedSize: props.desktopRatio === "standard" ? "建议 3840×2160" : "建议 3360×960", required: true },
          { label: `第 ${index + 1} 张手机图`, url: image?.mobileUrl, targetRatio: props.mobileRatio === "standard" ? [4, 5] : [3, 4], recommendedSize: props.mobileRatio === "standard" ? "建议 1600×2000" : "建议 1500×2000" },
        ]),
      };
    case "热区图":
      return {
        title: "热区图素材",
        description: "手机图与电脑图不应共用热区坐标。当前模块只保存一组坐标，若替换为不同构图的手机图，请先保持主体位置一致。",
        viewport: "手机断点：≤ 767px",
        slots: [
          { label: "电脑端热区图", url: props.image, recommendedSize: "按实际展示宽度准备，建议宽度不低于 1920px", required: true },
          { label: "手机端热区图", url: props.mobileImage, recommendedSize: "建议宽度不低于 1170px" },
        ],
      };
    case "产品展示行":
      return {
        title: "商品图片规格",
        description: "前台商品卡片固定按 3:4 裁切。所有商品列表图请保持同一比例，避免商品瀑布流高度不一致。",
        viewport: "商品列表图：3:4，建议至少 1200×1600",
        slots: [],
      };
    case "分类卡片":
      return {
        title: "分类卡片规格",
        description: "前台双列分类卡片为 16:9；三列、四列分类卡片为 3:4。请依据右侧列数准备素材。",
        viewport: "双列 16:9｜三列/四列 3:4",
        slots: [],
      };
    case "视频区块":
      return {
        title: "视频与封面规格",
        description: "封面图必须与已选的视频画面比例一致，避免首帧切换时出现跳动。",
        viewport: `当前画面比例：${props.aspectRatio || "16:9"}`,
        slots: [
          { label: "视频封面图", url: props.posterUrl, recommendedSize: `按 ${props.aspectRatio || "16:9"} 输出，长边建议不低于 1920px` },
        ],
      };
    default:
      return null;
  }
}

function formatRatio(width: number, height: number) {
  const ratio = width / height;
  return ratio >= 1 ? `${ratio.toFixed(2)}:1` : `1:${(1 / ratio).toFixed(2)}`;
}

function ImageCheck({ slot }: { slot: ImageSlot }) {
  const [state, setState] = useState<ImageState>({ status: "idle" });

  useEffect(() => {
    if (!slot.url) {
      setState({ status: "idle" });
      return;
    }

    let active = true;
    const image = new Image();
    setState({ status: "loading" });
    image.onload = () => {
      if (active) setState({ status: "ready", width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      if (active) setState({ status: "error" });
    };
    image.src = slot.url;
    return () => {
      active = false;
    };
  }, [slot.url]);

  const result = useMemo(() => {
    if (state.status !== "ready" || !slot.targetRatio) return null;
    const sourceRatio = state.width / state.height;
    const targetRatio = slot.targetRatio[0] / slot.targetRatio[1];
    const delta = Math.abs(sourceRatio / targetRatio - 1);
    if (delta <= 0.04) return { tone: "is-good", text: "比例匹配" };
    if (delta <= 0.18) return { tone: "is-watch", text: "会有轻微裁切" };
    return { tone: "is-risk", text: "裁切风险较高" };
  }, [slot.targetRatio, state]);

  return (
    <div className="homepage-media-spec__slot">
      <div>
        <strong>{slot.label}{slot.required ? "（必填）" : ""}</strong>
        <span>{slot.recommendedSize}</span>
      </div>
      {!slot.url && <em className={slot.required ? "is-risk" : ""}>{slot.required ? "尚未配置" : "可选"}</em>}
      {state.status === "loading" && <em>正在读取尺寸</em>}
      {state.status === "error" && <em className="is-risk">无法读取图片尺寸</em>}
      {state.status === "ready" && (
        <em className={result?.tone}>
          当前 {state.width}×{state.height}（{formatRatio(state.width, state.height)}）{result ? ` · ${result.text}` : ""}
        </em>
      )}
    </div>
  );
}

export default function MediaRequirementPanel({ type, props }: { type: string; props: Record<string, any> }) {
  const spec = useMemo(() => getMediaSpec(type, props), [props, type]);
  if (!spec) return null;

  return (
    <section className="homepage-media-spec" aria-label="图片规格与裁切校验">
      <div className="homepage-media-spec__heading">
        <span>图片规格与裁切校验</span>
        <strong>{spec.title}</strong>
      </div>
      <p>{spec.description}</p>
      <div className="homepage-media-spec__viewport">{spec.viewport}</div>
      {spec.slots.map((slot) => <ImageCheck key={slot.label} slot={slot} />)}
    </section>
  );
}
