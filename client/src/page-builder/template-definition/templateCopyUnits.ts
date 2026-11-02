const ACTION_GUIDE = {
  button: { name: "按钮", suggested: "2～6", limit: 8 },
  link: { name: "链接", suggested: "2～10", limit: 12 },
} as const;

/** 中文算 1 字，英文和数字两个字符算 1 字。空白不计入。 */
export function countTemplateCopyUnits(value: string): number {
  let halves = 0;
  for (const char of value.trim()) {
    if (/\s/u.test(char)) continue;
    halves += char.charCodeAt(0) <= 0xff ? 1 : 2;
  }
  return Math.ceil(halves / 2);
}

export function describeActionCopy(
  slotType: "button" | "link",
  label: string,
): { hint: string; review: boolean } {
  const guide = ACTION_GUIDE[slotType];
  const units = countTemplateCopyUnits(label);
  if (!label.trim()) {
    return { hint: `${guide.name}建议 ${guide.suggested} 字，上限 ${guide.limit} 字。`, review: false };
  }
  if (units > guide.limit) {
    return {
      hint: `目前 ${units} 字，已超过 ${guide.limit} 字。请改短，或确认这句话在${guide.name}里仍然读得完。`,
      review: true,
    };
  }
  if (units < 2) {
    return { hint: `目前 ${units} 字，不足 2 字。建议写明点击后会去哪里。`, review: true };
  }
  return { hint: `${guide.name}建议 ${guide.suggested} 字，上限 ${guide.limit} 字。目前 ${units} 字。`, review: false };
}
