/** 页面装修目录在发布交接后的定位和添加落点，不写入页面。版本沿用按 D.43，不在这里提供升级。 */

export type PageTemplateHandoffFocus = "add" | "none";

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
  hasSelection: boolean;
}) {
  const quoted = `“${input.name}”`;
  const versionLabel = `v${input.version}`;
  const add = describePageTemplateAddAction(input);

  if (input.pageHasBlocks) {
    return {
      liveStatus: `刚发布的${quoted}${versionLabel} 已定位到模板组件库。正在使用它的页面草稿会自动沿用这一版。请拖到目标位置，或${add.title}。`,
      cardAriaLabel: `刚发布的${input.name}版本${input.version}，可拖到目标位置或${add.title}`,
      add,
      focusTarget: "none" as const satisfies PageTemplateHandoffFocus,
    };
  }

  return {
    liveStatus: `刚发布的${quoted}${versionLabel} 已定位到模板组件库，可预览或添加到当前页面。`,
    cardAriaLabel: `刚发布的${input.name}版本${input.version}，可预览或添加到当前页面`,
    add,
    focusTarget: "add" as const satisfies PageTemplateHandoffFocus,
  };
}
