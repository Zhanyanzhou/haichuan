import type {
  EditableTargetLocatorAttribute,
} from "../template-definition/editableTargets";

export interface ExplicitEditableTargetLocator {
  attributes: readonly EditableTargetLocatorAttribute[];
  value: string;
}

export function findElementsByEditableTargetLocator(
  root: HTMLElement,
  locator: ExplicitEditableTargetLocator,
): HTMLElement[] {
  if (!locator.value || locator.attributes.length === 0) return [];
  const selector = locator.attributes.map((attribute) => `[${attribute}]`).join(",");
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((element) =>
    locator.attributes.some((attribute) => {
      const current = element.getAttribute(attribute);
      if (!current) return false;
      return attribute === "data-editor-field"
        ? current.split(/\s+/).includes(locator.value)
        : current === locator.value;
    }),
  );
}
