/**
 * imageText.puck.ts — ImageTextBlock 的 Puck 适配器
 */

import ImageTextBlock from "@/components/blocks/ImageTextBlock";
import { IMAGE_TEXT_CONTRACT } from "../config/blockContracts";
import { convertPuckProps } from "../utils/puckPropsToModule";
import type { LinkTargetType } from "../utils/linkTarget";

export interface ImageTextPuckProps {
  label: string;
  title: string;
  body: string;
  image: string;
  imageAlt: string;
  buttonText: string;
  linkUrl: string;
  targetType: LinkTargetType;
  productId: number;
  template: string;
  spacing: string;
  focusX: number;
  focusY: number;
  locked?: boolean;
}

export const imageTextPuckConfig = {
  render: (props: ImageTextPuckProps) => (
    <ImageTextBlock module={convertPuckProps("图文混排", props)!} editMode />
  ),
  defaultProps: {
    label: "",
    title: "品牌故事",
    body: "",
    image: "",
    imageAlt: "",
    buttonText: "",
    linkUrl: "",
    targetType: "none",
    productId: 0,
    template: IMAGE_TEXT_CONTRACT.defaults.template,
    spacing: IMAGE_TEXT_CONTRACT.defaults.spacing,
    focusX: 50,
    focusY: 50,
    locked: false,
  } satisfies ImageTextPuckProps,
  resolvePermissions: (data: { props?: ImageTextPuckProps }) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
