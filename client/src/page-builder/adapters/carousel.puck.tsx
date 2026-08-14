/** carousel.puck.ts — CarouselBlock 的 Puck 适配器 */
import CarouselBlock from "@/components/blocks/CarouselBlock";
import { IMAGE_SPECS } from "../config/imageSpecs";
import { convertPuckProps } from "../utils/puckPropsToModule";
import MediaPickerField from "../fields/MediaPickerField";

export interface CarouselPuckProps {
  images: { url: string; mobileUrl?: string; link?: string; alt?: string }[];
  autoPlay: boolean;
  interval: number;
  showDots: boolean;
  showArrows: boolean;
  height: number;
  mobileHeight: number;
  locked?: boolean;
}

export const carouselPuckConfig = {
  label: "轮播图海报",
  render: (props: CarouselPuckProps) => (
    <CarouselBlock module={convertPuckProps("轮播图", props as any) as any} editMode />
  ),
  defaultProps: {
    images: [
      {
        url: "https://placehold.co/1200x500/B8944E/fff?text=珠宝轮播一",
        link: "",
        alt: "珠宝轮播图一",
      },
      {
        url: "https://placehold.co/1200x500/2C2C2C/B8944E?text=珠宝轮播二",
        link: "",
        alt: "珠宝轮播图二",
      },
      {
        url: "https://placehold.co/1200x500/1C1A18/fff?text=珠宝轮播三",
        link: "",
        alt: "珠宝轮播图三",
      },
    ],
    autoPlay: true,
    interval: 4000,
    showDots: true,
    showArrows: true,
    height: 500,
    mobileHeight: 640,
    locked: false,
  } satisfies CarouselPuckProps,
  fields: {
    images: {
      type: "array" as const,
      label: "轮播图片",
      getItemSummary: (item: any) => item.alt || item.url || "图片",
      arrayFields: {
        url: {
          type: "custom" as const,
          label: IMAGE_SPECS.carousel.image.label,
          render: ({
            value, onChange, readOnly,
          }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
            <MediaPickerField value={value} onChange={onChange} readOnly={readOnly}
              spec={IMAGE_SPECS.carousel.image} placeholder="上传轮播大图" />
          ),
        },
        mobileUrl: {
          type: "custom" as const,
          label: "手机端图片（可选）",
          render: ({
            value, onChange, readOnly,
          }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
            <MediaPickerField value={value} onChange={onChange} readOnly={readOnly}
              spec={{ width: 750, height: 1000, ratio: "3:4", label: "手机端轮播图（建议 750×1000，3:4）" }}
              placeholder="上传手机端图片（可选）" />
          ),
        },
        link: { type: "text" as const, label: "跳转链接（可选）" },
        alt: { type: "text" as const, label: "替代文本" },
      },
    } as any,
    autoPlay: {
      type: "radio" as const,
      label: "自动播放",
      options: [
        { label: "开启", value: true },
        { label: "关闭", value: false },
      ],
    },
    interval: {
      type: "number" as const,
      label: "切换间隔(ms)",
      min: 1000,
      max: 10000,
    },
    showDots: {
      type: "radio" as const,
      label: "指示点",
      options: [
        { label: "显示", value: true },
        { label: "隐藏", value: false },
      ],
    },
    showArrows: {
      type: "radio" as const,
      label: "左右箭头",
      options: [
        { label: "显示", value: true },
        { label: "隐藏", value: false },
      ],
    },
    height: {
      type: "custom" as const,
      label: "电脑端高度(px)",
      render: ({ value, onChange, readOnly }: { value?: number; onChange: (value: number) => void; readOnly?: boolean }) => (
        <div data-editor-device="desktop">
          <label className="homepage-editor__device-number-field">
            <span>电脑端高度（px）</span>
            <input
              type="number"
              min={200}
              max={800}
              value={value ?? 500}
              disabled={readOnly}
              aria-label="电脑端高度（像素）"
              onChange={(event) => onChange(Number(event.target.value) || 200)}
            />
          </label>
        </div>
      ),
    },
    mobileHeight: {
      type: "custom" as const,
      label: "手机端高度(px)",
      render: ({ value, onChange, readOnly }: { value?: number; onChange: (value: number) => void; readOnly?: boolean }) => (
        <div data-editor-device="mobile">
          <label className="homepage-editor__device-number-field">
            <span>手机端高度（px）</span>
            <input
              type="number"
              min={320}
              max={1200}
              value={value ?? 640}
              disabled={readOnly}
              aria-label="手机端高度（像素）"
              onChange={(event) => onChange(Number(event.target.value) || 320)}
            />
          </label>
        </div>
      ),
    },
  },
};
