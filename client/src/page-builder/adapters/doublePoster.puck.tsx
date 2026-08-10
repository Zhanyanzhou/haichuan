/**
 * doublePoster.puck.ts — DoublePosterSection 的 Puck 适配器
 */

import DoublePosterSection from "@/components/blocks/DoublePosterSection";
import type { PageModule } from "@/types/pageModule";

export interface DoublePosterPuckProps {
  number: string;
  label: string;
  title: string;
  description: string;
  mainImage: string;
  detailImage: string;
  linkUrl: string;
  mainFocusX: number;
  mainFocusY: number;
  detailFocusX: number;
  detailFocusY: number;
  locked?: boolean;
}

function toPageModule(props: DoublePosterPuckProps): PageModule {
  return {
    id: 0,
    pageKey: "home",
    moduleType: "doublePoster",
    sortOrder: 0,
    isVisible: true,
    status: "PUBLISHED",
    content: {
      number: props.number,
      label: props.label,
      title: props.title,
      description: props.description,
      mainImage: props.mainImage,
      detailImage: props.detailImage,
      linkUrl: props.linkUrl,
    },
    layoutConfig: { template: "leftBigRightSmall" },
    styleConfig: {
      mainFocusX: props.mainFocusX ?? 50,
      mainFocusY: props.mainFocusY ?? 50,
      detailFocusX: props.detailFocusX ?? 50,
      detailFocusY: props.detailFocusY ?? 50,
    },
    createdAt: "",
    updatedAt: "",
  };
}

export const doublePosterPuckConfig = {
  render: (props: DoublePosterPuckProps) => (
    <DoublePosterSection module={toPageModule(props)} />
  ),
  defaultProps: {
    number: "02",
    label: "COLLECTION",
    title: "新品系列",
    description: "",
    mainImage: "",
    detailImage: "",
    linkUrl: "",
    mainFocusX: 50,
    mainFocusY: 50,
    detailFocusX: 50,
    detailFocusY: 50,
    locked: false,
  } satisfies DoublePosterPuckProps,
  fields: {
    number: { type: "text" as const, label: "编号" },
    label: { type: "text" as const, label: "标签" },
    title: { type: "text" as const, label: "标题" },
    description: { type: "textarea" as const, label: "描述" },
    mainImage: { type: "text" as const, label: "主图 URL" },
    detailImage: { type: "text" as const, label: "细节图 URL" },
    linkUrl: { type: "text" as const, label: "链接" },
    mainFocusX: {
      type: "number" as const,
      label: "主图焦点 X (%)",
      min: 0,
      max: 100,
    },
    mainFocusY: {
      type: "number" as const,
      label: "主图焦点 Y (%)",
      min: 0,
      max: 100,
    },
    detailFocusX: {
      type: "number" as const,
      label: "细节焦点 X (%)",
      min: 0,
      max: 100,
    },
    detailFocusY: {
      type: "number" as const,
      label: "细节焦点 Y (%)",
      min: 0,
      max: 100,
    },
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
