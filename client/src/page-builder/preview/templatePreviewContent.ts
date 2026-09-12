import type { RegisteredContentTemplateKey } from "../generated/contentTemplates.generated";
const previewPortrait = new URL("../preview-assets/neutral-template-preview-v1/template-preview-portrait.svg", import.meta.url).href;
const previewWide = new URL("../preview-assets/neutral-template-preview-v1/template-preview-wide.svg", import.meta.url).href;

type PreviewProps = Record<string, unknown>;

/** 只用于首屏测试模板目录与画布预览，不会写入 PageDocument。 */
export const TEMPLATE_PREVIEW_CONTENT: Record<RegisteredContentTemplateKey, PreviewProps> = {
  hero: {
    desktopImage: previewWide,
    mobileImage: previewPortrait,
    eyebrow: "QUIET LIGHT",
    title: "光，沿线而生",
    subtitle: "以克制的比例，留住金属与肌肤之间的呼吸。",
    actionText: "探索作品",
    alignment: "left",
    textTone: "light",
    desktopFocusX: 68,
    desktopFocusY: 45,
    mobileFocusX: 48,
    mobileFocusY: 40,
  },
};

export function getTemplatePreviewContent(key: RegisteredContentTemplateKey) {
  return TEMPLATE_PREVIEW_CONTENT[key] ?? {};
}
