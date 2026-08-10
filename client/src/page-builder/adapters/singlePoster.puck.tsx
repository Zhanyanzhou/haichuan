/**
 * singlePoster.puck.ts — SinglePosterSection 的 Puck 适配器
 */

import SinglePosterSection from "@/components/blocks/SinglePosterSection";
import type { PageModule } from "@/types/pageModule";

export interface SinglePosterPuckProps {
  number: string;
  label: string;
  title: string;
  subtitle: string;
  desktopImage: string;
  mobileImage: string;
  linkUrl: string;
  template: string;
  focusX: number;
  focusY: number;
  locked?: boolean;
}

function toPageModule(props: SinglePosterPuckProps): PageModule {
  return {
    id: 0,
    pageKey: "home",
    moduleType: "singlePoster",
    sortOrder: 0,
    isVisible: true,
    status: "PUBLISHED",
    content: {
      number: props.number,
      label: props.label,
      title: props.title,
      subtitle: props.subtitle,
      desktopImage: props.desktopImage,
      mobileImage: props.mobileImage,
      linkUrl: props.linkUrl,
    },
    layoutConfig: { template: props.template || "leftTextRightImage" },
    styleConfig: { focusX: props.focusX ?? 50, focusY: props.focusY ?? 50 },
    createdAt: "",
    updatedAt: "",
  };
}

export const singlePosterPuckConfig = {
  render: (props: SinglePosterPuckProps) => (
    <SinglePosterSection module={toPageModule(props)} />
  ),
  defaultProps: {
    number: "01",
    label: "SIGNATURE",
    title: "经典系列",
    subtitle: "",
    desktopImage: "",
    mobileImage: "",
    linkUrl: "",
    template: "leftTextRightImage",
    focusX: 50,
    focusY: 50,
    locked: false,
  } satisfies SinglePosterPuckProps,
  fields: {
    number: { type: "text" as const, label: "编号" },
    label: { type: "text" as const, label: "标签" },
    title: { type: "text" as const, label: "标题" },
    subtitle: { type: "text" as const, label: "副标题" },
    desktopImage: { type: "text" as const, label: "图片 URL" },
    mobileImage: { type: "text" as const, label: "手机端图片 URL（建议填写）" },
    linkUrl: { type: "text" as const, label: "链接" },
    template: {
      type: "radio" as const,
      label: "布局",
      options: [
        { label: "左文右图", value: "leftTextRightImage" },
        { label: "左图右文", value: "leftImageRightText" },
      ],
    },
    focusX: { type: "number" as const, label: "焦点 X (%)", min: 0, max: 100 },
    focusY: { type: "number" as const, label: "焦点 Y (%)", min: 0, max: 100 },
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
