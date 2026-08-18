/**
 * gallery.puck.tsx — 作品画廊(Asymmetric Gallery)的 Puck 适配器
 */
import AsymmetricGalleryBlock from "@/components/blocks/AsymmetricGalleryBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";

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
    bgColor: "#FFFFFF",
    locked: false,
  } satisfies GalleryPuckProps,
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
