/**
 * gallery.puck.tsx — 作品画廊(Asymmetric Gallery)的 Puck 适配器
 */
import AsymmetricGalleryBlock from "@/components/blocks/AsymmetricGalleryBlock";
import { GALLERY_CONTRACT } from "../config/blockContracts";
import { IMAGE_SPECS } from "../config/imageSpecs";
import { convertPuckProps } from "../utils/puckPropsToModule";
import MediaPickerField from "../fields/MediaPickerField";
import { colorPuckField } from "../fields/ColorField";

export interface GalleryPuckItem {
  image: string;
  altText: string;
  caption: string;
  link: string;
  focusX?: number;
  focusY?: number;
}

export interface GalleryPuckProps {
  title: string;
  subtitle: string;
  items: GalleryPuckItem[];
  bgColor: string;
  locked?: boolean;
}

export const galleryPuckConfig = {
  render: (props: GalleryPuckProps) => (
    <AsymmetricGalleryBlock module={convertPuckProps("作品画廊", props as any) as any} editMode />
  ),
  defaultProps: {
    title: "系列作品",
    subtitle: "以线条、比例与光,呈现这一季的作品语言。",
    items: [
      { image: "", altText: "", caption: "FIG. 01 · 主视觉", link: "" },
      { image: "", altText: "", caption: "", link: "" },
      { image: "", altText: "", caption: "", link: "" },
      { image: "", altText: "", caption: "FIG. 02 · 细节", link: "" },
    ],
    bgColor: "#F7F4EE",
    locked: false,
  } satisfies GalleryPuckProps,
  fields: {
    title: { type: "text" as const, label: "标题" },
    subtitle: { type: "textarea" as const, label: "副标题（可选）" },
    items: {
      type: "array" as const,
      label: "画廊图片",
      getItemSummary: (item: any) => item.caption || item.altText || "图片",
      arrayFields: {
        image: {
          type: "custom" as const,
          label: "图片",
          render: ({
            value, onChange, readOnly,
          }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
            <MediaPickerField fieldKey="image" device="shared" value={value} onChange={onChange} readOnly={readOnly}
              spec={IMAGE_SPECS.gallery.primary} placeholder="上传画廊图片" />
          ),
        },
        caption: { type: "text" as const, label: "图注（可选，如 FIG. 01 · 系列名）" },
        altText: { type: "text" as const, label: "替代文字" },
        link: { type: "text" as const, label: "跳转链接（可选）" },
        focusX: { type: "number" as const, label: "焦点 X", min: 0, max: 100 },
        focusY: { type: "number" as const, label: "焦点 Y", min: 0, max: 100 },
      },
      defaultItemProps: { image: "", altText: "", caption: "", link: "", focusX: 50, focusY: 50 },
    } as any,
    bgColor: colorPuckField("背景色"),
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
