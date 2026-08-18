/**
 * beforeAfter.puck.ts — 改款前后对比的 Puck 适配器
 */
import BeforeAfterBlock from "@/components/blocks/BeforeAfterBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";
import type { LinkTargetType } from "../utils/linkTarget";

export interface BeforeAfterPuckProps {
  title: string;
  subtitle: string;
  beforeImage: string;
  afterImage: string;
  beforeLabel: string;
  afterLabel: string;
  beforeAltText: string;
  afterAltText: string;
  beforeFocusX: number;
  beforeFocusY: number;
  afterFocusX: number;
  afterFocusY: number;
  actionText: string;
  linkUrl: string;
  targetType: LinkTargetType;
  productId: number;
  bgColor: string;
  locked?: boolean;
}

export const beforeAfterPuckConfig = {
  render: (props: BeforeAfterPuckProps) => (
    <BeforeAfterBlock
      module={convertPuckProps("改款对比", props as any) as any}
      editMode
    />
  ),
  defaultProps: {
    title: "珠宝改款",
    subtitle: "旧物的情感,以新的形态延续。",
    beforeImage: "",
    afterImage: "",
    beforeLabel: "改款前",
    afterLabel: "改款后",
    beforeAltText: "",
    afterAltText: "",
    beforeFocusX: 50,
    beforeFocusY: 50,
    afterFocusX: 50,
    afterFocusY: 50,
    actionText: "",
    linkUrl: "",
    targetType: "none",
    productId: 0,
    bgColor: "#FFFFFF",
    locked: false,
  } satisfies BeforeAfterPuckProps,
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
