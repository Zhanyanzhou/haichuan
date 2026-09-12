/**
 * hero.puck.ts — HeroSection 的 Puck 适配器
 * 不包含业务渲染逻辑（HeroSection.tsx 负责）
 * 只负责 Puck 注册所需：defaultProps、render、permissions
 */

import HeroSection from "@/components/blocks/HeroSection";
import { convertPuckProps } from "../utils/puckPropsToModule";
import type { LinkTargetType } from "../utils/linkTarget";
import {
  createContentTemplateMarker,
  type ContentTemplateMarker,
} from "../generated/contentTemplates.generated";

/** Puck 扁平 props（编辑器使用） */
export interface HeroPuckProps {
  desktopImage: string;
  mobileImage: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  actionText: string;
  linkUrl: string;
  targetType: LinkTargetType;
  productId: number;
  altText: string;
  alignment: string;
  /** 文字明暗档:白盒画册统一亮图深字,暗调档已废除(2026-08-19) */
  textTone: string;
  desktopFocusX: number;
  desktopFocusY: number;
  mobileFocusX: number;
  mobileFocusY: number;
  /** 系统保留：区块级内容模板合同印记，不在 Inspector 中展示。 */
  __contentTemplate?: ContentTemplateMarker;
  /** 模板锁定标记 */
  locked?: boolean;
}

export const heroPuckConfig = {
  render: (props: HeroPuckProps) => (
    <HeroSection module={convertPuckProps("首屏主视觉", props)!} editMode />
  ),

  defaultProps: {
    desktopImage: "",
    mobileImage: "",
    eyebrow: "",
    title: "",
    subtitle: "",
    actionText: "",
    linkUrl: "",
    targetType: "none",
    productId: 0,
    altText: "",
    alignment: "center",
    textTone: "dark",
    desktopFocusX: 50,
    desktopFocusY: 50,
    mobileFocusX: 50,
    mobileFocusY: 50,
    __contentTemplate: createContentTemplateMarker("首屏主视觉"),
    locked: false,
  } satisfies HeroPuckProps,

  /** hero 测试样例不提供复制命令；锁定时进一步禁止删除与拖动。 */
  resolvePermissions: (data: { props?: HeroPuckProps }) => {
    if (data.props?.locked) {
      return { delete: false, drag: false, duplicate: false };
    }
    return { duplicate: false };
  },
};
