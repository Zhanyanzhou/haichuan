import { useCallback, useEffect, useState } from "react";
import {
  DynamicTemplateRenderer,
  type TemplateDefinitionV2,
} from "../template-definition";
import { useResolvedDynamicTemplate } from "./registry";
import type { DynamicTemplateInstanceProps } from "./types";
import { hasExplicitDynamicTemplateInstanceImage } from "./mediaReferences";
import { resolveTemplateBreakpoint, type TemplateBreakpoint } from "../template-definition/responsive";

function useDynamicTemplateDevice(
  mobileBreakpoint = 767,
  enabled = true,
  schemaVersion: TemplateDefinitionV2["schemaVersion"] = 1,
): TemplateBreakpoint {
  const breakpoint = Number.isFinite(mobileBreakpoint)
    ? Math.min(1024, Math.max(480, Math.round(mobileBreakpoint)))
    : 767;
  const current = useCallback((): TemplateBreakpoint => {
    if (!enabled || typeof window === "undefined") return "desktop";
    return resolveTemplateBreakpoint({ schemaVersion, metadata: { mobileBreakpoint: breakpoint } as TemplateDefinitionV2["metadata"] }, window.innerWidth);
  }, [breakpoint, enabled, schemaVersion]);
  const [device, setDevice] = useState<TemplateBreakpoint>(current);
  useEffect(() => {
    if (!enabled) return undefined;
    const media = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const tablet = window.matchMedia("(max-width: 1023px)");
    const update = () => setDevice(current());
    update();
    media.addEventListener("change", update);
    tablet.addEventListener("change", update);
    return () => { media.removeEventListener("change", update); tablet.removeEventListener("change", update); };
  }, [breakpoint, current, enabled]);
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
  deviceOverride?: TemplateBreakpoint;
  mode?: "public" | "editor" | "preview";
  primaryHeadingLevel?: 1 | 2;
}) {
  const registered = useResolvedDynamicTemplate(props.templateId, props.templateVersion);
  const resolvedDefinition = definition ?? registered?.definition;
  const responsiveDevice = useDynamicTemplateDevice(
    resolvedDefinition?.metadata.mobileBreakpoint,
    deviceOverride === undefined,
    resolvedDefinition?.schemaVersion,
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
  if (
    mode === "public"
    && !hasExplicitDynamicTemplateInstanceImage(
      resolvedDefinition,
      props.contentBySlotId,
      props.hiddenSlotIds,
    )
  ) {
    return null;
  }
  return (
    <section
      data-dynamic-template-instance-id={props.instanceId}
      data-dynamic-template-version={props.templateVersion}
      data-dynamic-template-render-mode={mode}
    >
      <DynamicTemplateRenderer
        definition={resolvedDefinition}
        device={device === "tablet" ? "desktop" : device}
        breakpoint={device}
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
