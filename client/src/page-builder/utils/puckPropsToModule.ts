/** 当前 Puck 扁平 props 到 PageModule 的最小转换层。 */
import type { PageModule } from "@/types/pageModule";

function baseModule(
  moduleType: string,
  content: Record<string, unknown>,
  layoutConfig: Record<string, unknown> = {},
  styleConfig: Record<string, unknown> = {},
): PageModule {
  return {
    id: 0,
    pageKey: "home",
    moduleType,
    sortOrder: 0,
    isVisible: true,
    status: "PUBLISHED",
    content,
    layoutConfig: layoutConfig as PageModule["layoutConfig"],
    styleConfig: styleConfig as PageModule["styleConfig"],
    createdAt: "",
    updatedAt: "",
  };
}

export function convertPuckProps<T extends object>(type: string, input: T): PageModule | null {
  const props = input as Record<string, unknown>;
  switch (type) {
    case "首屏主视觉":
      return baseModule(
        "hero",
        {
          desktopImage: props.desktopImage,
          mobileImage: props.mobileImage,
          eyebrow: props.eyebrow,
          title: props.title,
          subtitle: props.subtitle,
          actionText: props.actionText,
          linkUrl: props.linkUrl,
          targetType: props.targetType,
          productCode: props.productCode,
          productId: Number(props.productId) || 0,
          categorySlug: props.categorySlug,
          altText: props.altText,
        },
        { template: props.alignment || "overlay" },
        {
          focusX: props.focusX ?? 50,
          focusY: props.focusY ?? 50,
          desktopFocusX: props.desktopFocusX ?? props.focusX ?? 50,
          desktopFocusY: props.desktopFocusY ?? props.focusY ?? 50,
          mobileFocusX: props.mobileFocusX ?? props.focusX ?? 50,
          mobileFocusY: props.mobileFocusY ?? props.focusY ?? 50,
        },
      );
    default:
      return null;
  }
}
