import { createHash } from "node:crypto";
import type { TemplateDefinitionV2 } from "./generated/templateDefinition.generated";

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return String(value);
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
  );
}

/** 已通过 V2 结构校验的定义使用同一规范化摘要，供保存、预检与精确版本水合交叉核验。 */
export function calculateDynamicTemplateDefinitionChecksum(
  definition: TemplateDefinitionV2,
): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(definition)))
    .digest("hex");
}

export function matchesDynamicTemplateDefinitionChecksum(
  definition: TemplateDefinitionV2,
  storedChecksum: string,
): boolean {
  return /^[a-f0-9]{64}$/i.test(storedChecksum)
    && calculateDynamicTemplateDefinitionChecksum(definition) === storedChecksum.toLowerCase();
}
