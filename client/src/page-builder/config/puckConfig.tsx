/** 全局 Puck 配置：只保留首屏测试模板与两个系统区块。 */
import type { Config } from "@puckeditor/core";
import type { ReactNode } from "react";
import { businessRegionPuckConfig } from "../adapters/businessRegion.puck";
import type { BusinessRegionPuckProps } from "../adapters/businessRegion.puck";
import { heroPuckConfig } from "../adapters/hero.puck";
import type { HeroPuckProps } from "../adapters/hero.puck";
import { siteConfigPuckConfig } from "../adapters/siteConfig.puck";
import type { SiteConfigPuckProps } from "../adapters/siteConfig.puck";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  DYNAMIC_TEMPLATE_INSTANCE_SCHEMA_VERSION,
  DynamicTemplateInstanceView,
  type DynamicTemplateInstanceProps,
} from "../dynamic-template-instance";
import ContentTemplateContractFrame from "../runtime/ContentTemplateContractFrame";
import {
  CONTENT_TEMPLATE_RENDER_SURFACE,
  useContentTemplateRenderSurface,
} from "../runtime/ContentTemplateRenderSurface";
import { getCategoryComponents } from "./blockMeta";

type MyComponents = {
  动态模板实例: DynamicTemplateInstanceProps;
  首屏主视觉: HeroPuckProps;
  网站全局设置: SiteConfigPuckProps;
  业务功能区: BusinessRegionPuckProps;
};

type RenderableConfig<Props> = {
  render: (props: Props) => ReactNode;
} & Record<string, unknown>;

function ContractRenderer<Props>({ moduleType, props, render }: {
  moduleType: string;
  props: Props;
  render: (props: Props) => ReactNode;
}) {
  const renderSurface = useContentTemplateRenderSurface();
  return (
    <ContentTemplateContractFrame
      moduleType={moduleType}
      mode={renderSurface === CONTENT_TEMPLATE_RENDER_SURFACE.CATALOG_PREVIEW ? "public" : "editor"}
      props={props as Record<string, unknown>}
    >
      {render(props)}
    </ContentTemplateContractFrame>
  );
}

function withContractRenderer<Props>(moduleType: string, config: RenderableConfig<Props>) {
  const render = config.render;
  return {
    ...config,
    render: (props: Props) => (
      <ContractRenderer moduleType={moduleType} props={props} render={render} />
    ),
  };
}

export const puckConfig: Config<MyComponents> = {
  components: {
    [DYNAMIC_TEMPLATE_BLOCK_TYPE]: {
      label: "模板实例",
      fields: {},
      defaultProps: {
        id: "unbound-dynamic-template-instance",
        instanceSchemaVersion: DYNAMIC_TEMPLATE_INSTANCE_SCHEMA_VERSION,
        instanceId: "unbound-dynamic-template-instance",
        templateId: "unbound",
        templateVersion: 1,
        moduleName: "模板实例",
        contentBySlotId: {},
        layoutOverridesByNodeId: {},
        hiddenSlotIds: [],
        isVisible: true,
      },
      render: (props: DynamicTemplateInstanceProps) => (
        <DynamicTemplateInstanceView props={props} mode="editor" />
      ),
    },
    首屏主视觉: withContractRenderer("首屏主视觉", heroPuckConfig),
    网站全局设置: siteConfigPuckConfig,
    业务功能区: businessRegionPuckConfig,
  },
  categories: getCategoryComponents() as Config<MyComponents>["categories"],
  root: { render: ({ children }) => <div>{children}</div>, fields: {} },
};
