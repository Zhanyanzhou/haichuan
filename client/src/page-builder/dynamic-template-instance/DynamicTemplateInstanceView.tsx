import { useEffect, useState } from "react";
import {
  DynamicTemplateRenderer,
  type TemplateDefinitionV2,
} from "../template-definition";
import { useResolvedDynamicTemplate } from "./registry";
import type { DynamicTemplateInstanceProps } from "./types";

function useDynamicTemplateDevice(
  mobileBreakpoint = 767,
  enabled = true,
): "desktop" | "mobile" {
  const breakpoint = Number.isFinite(mobileBreakpoint)
    ? Math.min(1024, Math.max(480, Math.round(mobileBreakpoint)))
    : 767;
  const [device, setDevice] = useState<"desktop" | "mobile">(() => (
    enabled
      && typeof window !== "undefined"
      && window.matchMedia(`(max-width: ${breakpoint}px)`).matches
      ? "mobile"
      : "desktop"
  ));
  useEffect(() => {
    if (!enabled) return undefined;
    const media = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setDevice(media.matches ? "mobile" : "desktop");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [breakpoint, enabled]);
  return device;
}

export default function DynamicTemplateInstanceView({
  props,
  definition,
  deviceOverride,
  mode = "public",
  primaryHeadingLevel = 2,
}: {
  props: DynamicTemplateInstanceProps;
  definition?: TemplateDefinitionV2;
  /** 编辑器画布已有明确设备状态时优先使用，避免 iframe Portal 误读宿主窗口宽度。 */
  deviceOverride?: "desktop" | "mobile";
  mode?: "public" | "editor" | "preview";
  primaryHeadingLevel?: 1 | 2;
}) {
  const registered = useResolvedDynamicTemplate(props.templateId, props.templateVersion);
  const resolvedDefinition = definition ?? registered?.definition;
  const responsiveDevice = useDynamicTemplateDevice(
    resolvedDefinition?.metadata.mobileBreakpoint,
    deviceOverride === undefined,
  );
  const device = deviceOverride ?? responsiveDevice;
  if (props.isVisible === false) {
    if (mode !== "editor") return null;
    return (
      <section
        className="hc-dynamic-template__invalid"
        data-dynamic-template-instance-id={props.instanceId}
        data-dynamic-template-version={props.templateVersion}
        data-dynamic-template-render-mode={mode}
        role="status"
      >
        <strong>当前页面中已隐藏</strong>
        <span>可在右侧属性面板重新显示整个模板实例</span>
      </section>
    );
  }
  if (!resolvedDefinition) {
    if (mode === "public") return null;
    return (
      <section className="hc-dynamic-template__invalid" role="status">
        <strong>模板版本暂时无法读取</strong>
        <span>{props.templateId} v{props.templateVersion}</span>
      </section>
    );
  }
  if (resolvedDefinition.templateId !== props.templateId) {
    if (mode === "public") return null;
    return <section className="hc-dynamic-template__invalid" role="alert">模板身份不匹配</section>;
  }
  return (
    <section
      data-dynamic-template-instance-id={props.instanceId}
      data-dynamic-template-version={props.templateVersion}
      data-dynamic-template-render-mode={mode}
    >
      <DynamicTemplateRenderer
        definition={resolvedDefinition}
        device={device}
        contentBySlotId={props.contentBySlotId}
        hiddenSlotIds={props.hiddenSlotIds}
        layoutOverridesByNodeId={props.layoutOverridesByNodeId}
        mode={mode}
        editorSurface={mode === "editor" ? "page-instance" : undefined}
        primaryHeadingLevel={primaryHeadingLevel}
      />
    </section>
  );
}
