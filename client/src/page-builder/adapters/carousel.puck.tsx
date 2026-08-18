/** carousel.puck.ts — CarouselBlock 的 Puck 适配器 */
import CarouselBlock from "@/components/blocks/CarouselBlock";
import { CAROUSEL_CONTRACT } from "../config/blockContracts";
import { convertPuckProps } from "../utils/puckPropsToModule";

export interface CarouselPuckProps {
  images: { url: string; mobileUrl?: string; link?: string; alt?: string }[];
  autoPlay: boolean;
  interval: number;
  showDots: boolean;
  showArrows: boolean;
  desktopRatio: "wide" | "standard";
  mobileRatio: "portrait" | "standard";
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
    desktopRatio: CAROUSEL_CONTRACT.defaults.desktopRatio,
    mobileRatio: CAROUSEL_CONTRACT.defaults.mobileRatio,
    locked: false,
  } satisfies CarouselPuckProps,
  resolvePermissions: (data: any) =>
    data.props?.locked ? { delete: false, drag: false } : {},
};
