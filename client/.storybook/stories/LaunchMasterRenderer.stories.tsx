import type { Meta, StoryObj } from "@storybook/react-vite";
import { DynamicTemplateInstanceView } from "../../src/page-builder/dynamic-template-instance";
import { createDynamicTemplateInstanceProps } from "../../src/page-builder/dynamic-template-instance/types";
import {
  LAUNCH_TEMPLATE_MASTER_ENTRIES,
  type LaunchTemplateMasterEntry,
} from "../../src/page-builder/template-creation/launchTemplateSet";
import type { TemplateDefinitionV2 } from "../../src/page-builder/template-definition";

/**
 * 生产 Renderer 的只读预览。定义与槽位结构全部来自 launchTemplateSet.ts
 * （首发七母模板的唯一实现源），本文件只提供预览用的页面内容与视口，
 * 不复制任何模板结构。
 */

const FIXTURE_IMAGE = { src: "/storybook-fixture.jpg", alt: "海川珠宝视觉基线夹具图" };

const LONG_ZH = "海川工坊以可核验的工艺记录每一件作品从蜡模到成色的完整过程";
const LONG_LIST = ["蜡模定型并核对重量与轮廓", "石膏灌制后检查气泡与收缩", "失蜡浇铸并记录金属批次", "打磨抛光并复核表面纹理", "镶嵌完成后逐项核对尺寸"].join("\n");

type ContentVariant = "baseline" | "longText" | "missingImage" | "extremeRatio";

function contentFor(definition: TemplateDefinitionV2, variant: ContentVariant): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  for (const slot of Object.values(definition.slots)) {
    const key = slot.key ?? "";
    if (slot.type === "image") {
      if (variant === "missingImage") continue;
      content[slot.slotId] = {
        src: FIXTURE_IMAGE.src,
        alt: variant === "extremeRatio" && key === "heroBackground"
          ? "极端比例横幅夹具"
          : `海川珠宝 ${slot.label}`,
      };
      continue;
    }
    if (slot.type === "button" || slot.type === "link") {
      content[slot.slotId] = { label: variant === "longText" ? "预约顾问了解工艺详情" : "预约顾问", targetType: "page" };
      continue;
    }
    if (variant === "longText" && key === "description") {
      content[slot.slotId] = slot.type === "richText" ? LONG_LIST : `${LONG_ZH}，${LONG_ZH}`;
      continue;
    }
    content[slot.slotId] = variant === "longText" ? LONG_ZH : "海川珠宝";
  }
  return content;
}

function Preview({ entry, variant, device }: { entry: LaunchTemplateMasterEntry; variant: ContentVariant; device: "desktop" | "mobile" }) {
  const props = createDynamicTemplateInstanceProps({
    templateId: entry.definition.templateId,
    version: 1,
    name: entry.name,
  });
  const instanceProps = { ...props, contentBySlotId: contentFor(entry.definition, variant) };
  const frameStyle = { width: device === "desktop" ? 1440 : 390, margin: "0 auto", background: "#ffffff" };
  return (
    <div data-story-device={device} data-story-variant={variant} data-story-role={entry.role} style={frameStyle}>
      <DynamicTemplateInstanceView
        props={instanceProps}
        definition={entry.definition}
        deviceOverride={device}
        mode="preview"
        primaryHeadingLevel={entry.role === "page-hero" ? 1 : 2}
      />
    </div>
  );
}

const meta = {
  title: "页面构建器/生产 Renderer",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const entries = Object.fromEntries(LAUNCH_TEMPLATE_MASTER_ENTRIES.map((entry) => [entry.role, entry]));

function story(role: string, variant: ContentVariant, device: "desktop" | "mobile"): Story {
  const entry = entries[role];
  const render = () => <Preview entry={entry} variant={variant} device={device} />;
  return { render };
}

export const PageHeroDesktop: Story = story("page-hero", "baseline", "desktop");
export const PageHeroMobile: Story = story("page-hero", "baseline", "mobile");
export const PageHeroLongTextDesktop: Story = story("page-hero", "longText", "desktop");
export const PageHeroMissingImageDesktop: Story = story("page-hero", "missingImage", "desktop");
export const PageHeroExtremeRatioDesktop: Story = story("page-hero", "extremeRatio", "desktop");
export const CraftDetailDesktop: Story = story("craft-detail", "baseline", "desktop");
export const CraftDetailMobile: Story = story("craft-detail", "baseline", "mobile");
export const CraftDetailLongTextDesktop: Story = story("craft-detail", "longText", "desktop");
export const CraftDetailMissingImageDesktop: Story = story("craft-detail", "missingImage", "desktop");
