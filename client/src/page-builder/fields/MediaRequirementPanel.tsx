import { useEffect, useMemo, useState } from "react";

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
        description: "首屏采用 cover 裁切，电脑与手机需要分别构图；文字请在右侧字段编辑，不要烧录进图片。",
        viewport: "电脑验收画布 1440×900（16:10）｜手机验收画布 390×844（约 9:19.5）",
        slots: [
          { label: "电脑端主图", url: props.desktopImage, targetRatio: [16, 10], recommendedSize: "建议不低于 2880×1800", required: true },
          { label: "手机端主图", url: props.mobileImage, targetRatio: [390, 844], recommendedSize: "建议不低于 1170×2532", required: true },
        ],
      };
    case "单图海报":
      return {
        title: "单图海报双端素材",
        description: "窄屏会自动采用手机端图片；未填写时会回退为电脑端图片，并可能产生裁切。",
        viewport: "电脑验收画布 1440×900｜平板竖屏、手机端使用竖构图",
        slots: [
          { label: "电脑端海报", url: props.desktopImage, targetRatio: [16, 10], recommendedSize: "建议不低于 2400×1500", required: true },
          { label: "手机端海报", url: props.mobileImage, targetRatio: [3, 4], recommendedSize: "建议不低于 1170×1560" },
        ],
      };
    case "全屏出血图":
      return {
        title: "全屏图双端素材",
        description: "此模块会铺满视口。若复用电脑图，手机端通常会大幅裁切，因此建议单独上传手机图。",
        viewport: "电脑验收画布 1440×900（16:10）｜手机验收画布 390×844（约 9:19.5）",
        slots: [
          { label: "电脑端背景图", url: props.image, targetRatio: [16, 10], recommendedSize: "建议不低于 2880×1800", required: true },
          { label: "手机端背景图", url: props.mobileImage, targetRatio: [390, 844], recommendedSize: "建议不低于 1170×2532", required: true },
        ],
      };
    case "轮播图":
      return {
        title: "轮播图双端素材",
        description: "轮播图在不同端使用不同高度。每一张电脑图都应有对应的手机图，避免推广文案或主体被裁掉。",
        viewport: `电脑高度 ${props.height || 500}px｜手机高度 ${props.mobileHeight || 640}px`,
        slots: (Array.isArray(props.images) ? props.images : []).flatMap((image: any, index: number) => [
          { label: `第 ${index + 1} 张电脑图`, url: image?.url, targetRatio: [3, 1], recommendedSize: "建议 1920×640 或更高", required: true },
          { label: `第 ${index + 1} 张手机图`, url: image?.mobileUrl, targetRatio: [1, 2], recommendedSize: "建议 750×1500 或更高", required: true },
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
