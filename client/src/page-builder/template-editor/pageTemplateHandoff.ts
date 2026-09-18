/** 页面装修目录在发布交接后的定位、添加落点和升级主次，不写入页面。 */

export type PageTemplateHandoffFocus = "add" | "upgrade" | "none";

export function resolvePublishedTemplateInsertionIndex(
  contentLength: number,
  selectedRootIndex: number | null,
  requestedInsertionIndex?: number,
) {
  const length = Math.max(0, contentLength);
  if (requestedInsertionIndex !== undefined) {
    return Math.min(length, Math.max(0, requestedInsertionIndex));
  }
  if (selectedRootIndex !== null && selectedRootIndex >= 0 && selectedRootIndex < length) {
    return selectedRootIndex + 1;
  }
  return length;
}

export function describePageTemplateAddAction(input: {
  name: string;
  version: number;
  pageHasBlocks: boolean;
  hasSelection: boolean;
}) {
  const destination = !input.pageHasBlocks
    ? "添加到页面"
    : input.hasSelection
      ? "添加到所选模块之后"
      : "添加到页面末尾";
  return {
    label: "添加到页面",
    title: destination,
    ariaLabel: `添加到页面：${input.name} v${input.version}`,
  };
}

export function describePageTemplateHandoff(input: {
  name: string;
  version: number;
  pageHasBlocks: boolean;
  upgradeCount: number;
  hasSelection: boolean;
}) {
  const quoted = `“${input.name}”`;
  const versionLabel = `v${input.version}`;
  const add = describePageTemplateAddAction(input);
  const upgradeCount = Math.max(0, input.upgradeCount);

  if (upgradeCount > 0) {
    return {
      liveStatus: `刚发布的${quoted}${versionLabel} 已定位到模板组件库。当前页面有 ${upgradeCount} 处旧实例可升级；也可拖到目标位置添加新实例。`,
      cardAriaLabel: `刚发布的${input.name}版本${input.version}，可升级已有实例，或拖到目标位置添加`,
      add,
      upgradeLabel: `升级 ${upgradeCount} 处`,
      upgradeAriaLabel: `升级页面中的${input.name}模板实例，共 ${upgradeCount} 处`,
      focusTarget: "upgrade" as const satisfies PageTemplateHandoffFocus,
    };
  }

  if (input.pageHasBlocks) {
    return {
      liveStatus: `刚发布的${quoted}${versionLabel} 已定位到模板组件库。请拖到目标位置，或${add.title}。`,
      cardAriaLabel: `刚发布的${input.name}版本${input.version}，可拖到目标位置或${add.title}`,
      add,
      upgradeLabel: null,
      upgradeAriaLabel: `升级页面中的${input.name}模板实例，共 0 处`,
      focusTarget: "none" as const satisfies PageTemplateHandoffFocus,
    };
  }

  return {
    liveStatus: `刚发布的${quoted}${versionLabel} 已定位到模板组件库，可预览或添加到当前页面。`,
    cardAriaLabel: `刚发布的${input.name}版本${input.version}，可预览或添加到当前页面`,
    add,
    upgradeLabel: null,
    upgradeAriaLabel: `升级页面中的${input.name}模板实例，共 0 处`,
    focusTarget: "add" as const satisfies PageTemplateHandoffFocus,
  };
}
