/**
 * hero.puck.ts — HeroSection 的 Puck 适配器
 * 不包含业务渲染逻辑（HeroSection.tsx 负责）
 * 只负责 Puck 注册所需：fields、defaultProps、render、permissions
 */

import HeroSection from "@/components/blocks/HeroSection";
import type { PageModule } from "@/types/pageModule";

/** Puck 扁平 props（编辑器使用） */
export interface HeroPuckProps {
  desktopImage: string;
  mobileImage: string;
  title: string;
  subtitle: string;
  actionText: string;
  linkUrl: string;
  altText: string;
  alignment: string;
  focusX: number;
  focusY: number;
  /** 模板锁定标记 */
  locked?: boolean;
}

/** 将 Puck 扁平 props 转为 PageModule（HeroSection 原生接口） */
function toPageModule(props: HeroPuckProps): PageModule {
  return {
    id: 0, // Puck 管理 id，不是数据库 id
    pageKey: "home",
    moduleType: "hero",
    sortOrder: 0,
    isVisible: true,
    status: "PUBLISHED",
    content: {
      desktopImage: props.desktopImage,
      mobileImage: props.mobileImage,
      title: props.title,
      subtitle: props.subtitle,
      actionText: props.actionText,
      linkUrl: props.linkUrl,
      altText: props.altText,
    },
    layoutConfig: {
      template: props.alignment || "overlay",
    },
    styleConfig: {
      focusX: props.focusX ?? 50,
      focusY: props.focusY ?? 50,
    },
    createdAt: "",
    updatedAt: "",
  };
}

export const heroPuckConfig = {
  render: (props: HeroPuckProps) => (
    <HeroSection module={toPageModule(props)} />
  ),

  defaultProps: {
    desktopImage: "",
    mobileImage: "",
    title: "海川珠宝",
    subtitle: "CAMPAIGN / NEW COLLECTION",
    actionText: "探索新品",
    linkUrl: "/products",
    altText: "海川珠宝 Hero",
    alignment: "center",
    focusX: 50,
    focusY: 50,
    locked: false,
  } satisfies HeroPuckProps,

  fields: {
    desktopImage: { type: "text" as const, label: "桌面端图片 URL" },
    mobileImage: { type: "text" as const, label: "移动端图片 URL" },
    title: { type: "text" as const, label: "标题" },
    subtitle: { type: "text" as const, label: "副标题" },
    actionText: { type: "text" as const, label: "按钮文字" },
    linkUrl: { type: "text" as const, label: "按钮链接" },
    altText: { type: "text" as const, label: "图片替代文字" },
    alignment: {
      type: "radio" as const,
      label: "对齐",
      options: [
        { label: "居中", value: "center" },
        { label: "左对齐", value: "left" },
      ],
    },
    focusX: { type: "number" as const, label: "焦点 X (%)", min: 0, max: 100 },
    focusY: { type: "number" as const, label: "焦点 Y (%)", min: 0, max: 100 },
  },

  /** 模板锁定：locked 属性为 true 时禁止删除/拖动 */
  resolvePermissions: (data: any, _params: any) => {
    if (data.props?.locked) {
      return { delete: false, drag: false, duplicate: false };
    }
    return {};
  },
};
