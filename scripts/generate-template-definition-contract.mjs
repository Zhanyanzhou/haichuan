import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "contracts/page-builder/template-definition.schema.json");
const typeOutputPaths = [
  path.join(root, "client/src/page-builder/template-definition/generated/templateDefinition.generated.ts"),
  path.join(root, "server/src/modules/page-modules/generated/templateDefinition.generated.ts"),
];
const semanticValidatorSourcePath = path.join(
  root,
  "client/src/page-builder/template-definition/validateTemplateDefinition.ts",
);
const serverSemanticValidatorOutputPath = path.join(
  root,
  "server/src/modules/page-modules/generated/validateTemplateDefinition.generated.ts",
);
const checkOnly = process.argv.includes("--check");

const sourceText = await readFile(sourcePath, "utf8");
const source = JSON.parse(sourceText);
const semanticValidatorSource = await readFile(semanticValidatorSourcePath, "utf8");
const responsiveSource = await readFile(path.join(root, "client/src/page-builder/template-definition/responsive.ts"), "utf8");

function invariant(condition, message) {
  if (!condition) throw new Error(`动态模板合同无效：${message}`);
}

function stableReplacer(_key, value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]));
  }
  return value;
}

const schemaVersions = source?.properties?.schemaVersion?.enum;
const schemaVersion = source?.["x-currentSchemaVersion"];
const nodeTypes = source?.$defs?.nodeType?.enum;
const slotTypes = source?.$defs?.slotType?.enum;
const nodeRegistry = source?.["x-nodeRegistry"];
const templateInstanceSchema = source?.$defs?.templateInstanceV2;
const metadataProperties = source?.$defs?.metadata?.properties;
const nodeAuthoringSchema = source?.$defs?.nodeAuthoring;

invariant(source?.$schema === "https://json-schema.org/draft/2020-12/schema", "必须使用 JSON Schema 2020-12");
invariant(Number.isInteger(schemaVersion) && schemaVersion > 0, "schemaVersion 必须是正整数");
invariant(Array.isArray(schemaVersions) && schemaVersions.includes(1) && schemaVersions.includes(schemaVersion), "必须保留历史 schema1 和当前版本读取");
invariant(Array.isArray(nodeTypes) && nodeTypes.length > 0, "nodeType 枚举不能为空");
invariant(Array.isArray(slotTypes) && slotTypes.length > 0, "slotType 枚举不能为空");
invariant(nodeRegistry && typeof nodeRegistry === "object" && !Array.isArray(nodeRegistry), "x-nodeRegistry 缺失");
invariant(templateInstanceSchema?.type === "object", "templateInstanceV2 合同缺失");
invariant(metadataProperties && typeof metadataProperties === "object" && !Array.isArray(metadataProperties), "metadata 字段合同缺失");
invariant(nodeAuthoringSchema?.type === "object", "nodeAuthoring 合同缺失");
invariant(nodeAuthoringSchema?.additionalProperties === false, "nodeAuthoring 必须拒绝未知字段");
invariant(nodeAuthoringSchema?.properties?.structureLocked?.type === "boolean", "nodeAuthoring.structureLocked 必须是布尔值");
invariant(
  ["instanceId", "templateId", "templateVersion", "contentBySlotId", "layoutOverridesByNodeId", "hiddenSlotIds", "isVisible"]
    .every((field) => templateInstanceSchema.required?.includes(field)),
  "templateInstanceV2 必填字段不完整",
);
invariant(new Set(nodeTypes).size === nodeTypes.length, "nodeType 不得重复");
invariant(new Set(slotTypes).size === slotTypes.length, "slotType 不得重复");
invariant(
  JSON.stringify(Object.keys(nodeRegistry).sort()) === JSON.stringify([...nodeTypes].sort()),
  "nodeType 与 x-nodeRegistry 必须一一对应",
);

const slotNodeTypes = [];
for (const [nodeType, definition] of Object.entries(nodeRegistry)) {
  invariant(["structure", "slot"].includes(definition.kind), `${nodeType}.kind 无效`);
  invariant(typeof definition.label === "string" && definition.label.length > 0, `${nodeType}.label 缺失`);
  invariant(typeof definition.rootOnly === "boolean", `${nodeType}.rootOnly 缺失`);
  invariant(typeof definition.canHaveChildren === "boolean", `${nodeType}.canHaveChildren 缺失`);
  invariant(Array.isArray(definition.allowedParents), `${nodeType}.allowedParents 缺失`);
  invariant(
    definition.allowedParents.every((parentType) => nodeTypes.includes(parentType)),
    `${nodeType}.allowedParents 包含未知节点`,
  );
  if (definition.rootOnly) {
    invariant(definition.allowedParents.length === 0, `${nodeType} 是根节点时不得声明父节点`);
  }
  if (definition.kind === "slot") {
    slotNodeTypes.push(nodeType);
    invariant(slotTypes.includes(definition.slotType), `${nodeType}.slotType 无效`);
    invariant(definition.canHaveChildren === false, `${nodeType} 槽位不得拥有子节点`);
  } else {
    invariant(definition.slotType === undefined, `${nodeType} 结构节点不得声明 slotType`);
  }
}

const mappedSlotTypes = slotNodeTypes.map((nodeType) => nodeRegistry[nodeType].slotType);
invariant(
  JSON.stringify([...mappedSlotTypes].sort()) === JSON.stringify([...slotTypes].sort()),
  "每一种 slotType 必须且只能由一个槽位节点类型承载",
);

const canonical = JSON.stringify(source, stableReplacer);
const hash = createHash("sha256").update(canonical).digest("hex");
const literal = (value) => JSON.stringify(value, null, 2);
const metadataFields = Object.keys(metadataProperties);
// Recipe 类型与运行时验证数据都从同一份 JSON Schema 派生。
function recipeType(schema) {
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  if (schema.type === "object") return `{\n${Object.entries(schema.properties).map(([key, value]) => `  ${key}${schema.required?.includes(key) ? "" : "?"}: ${recipeType(value)};`).join("\n")}\n}`;
  if (schema.type === "array") return `Array<${recipeType(schema.items)}>`;
  return schema.type === "integer" ? "number" : schema.type;
}
const metadataIntegerBounds = Object.fromEntries(
  Object.entries(metadataProperties)
    .filter(([, definition]) => definition?.type === "integer"
      && Number.isFinite(definition.minimum)
      && Number.isFinite(definition.maximum))
    .map(([field, definition]) => [field, {
      minimum: definition.minimum,
      maximum: definition.maximum,
    }]),
);

const generated = `/**
 * 自动生成，禁止手改。
 * 来源：contracts/page-builder/template-definition.schema.json
 * SHA-256：${hash}
 */

export const DYNAMIC_TEMPLATE_SCHEMA_VERSION = ${schemaVersion};
export const DYNAMIC_TEMPLATE_SUPPORTED_SCHEMA_VERSIONS = ${literal(schemaVersions)} as const;
/** 统一模板产品模型版本；JSON Schema 自身仍独立按 schemaVersion 演进。 */
export const TEMPLATE_DEFINITION_MODEL_VERSION = 2 as const;
export const DYNAMIC_TEMPLATE_SCHEMA_HASH = ${JSON.stringify(hash)};
export const TEMPLATE_RECIPE_SCHEMA = ${literal(source.$defs.templateRecipe)} as const;
export interface TemplateRecipe ${recipeType(source.$defs.templateRecipe)}
export const DYNAMIC_TEMPLATE_NODE_TYPES = ${literal(nodeTypes)} as const;
export const DYNAMIC_TEMPLATE_SLOT_TYPES = ${literal(slotTypes)} as const;
export const DYNAMIC_TEMPLATE_NODE_REGISTRY = ${literal(nodeRegistry)} as const;
export const DYNAMIC_TEMPLATE_METADATA_FIELDS = ${literal(metadataFields)} as const;
export const DYNAMIC_TEMPLATE_METADATA_INTEGER_BOUNDS = ${literal(metadataIntegerBounds)} as const;

export type DynamicTemplateNodeType = typeof DYNAMIC_TEMPLATE_NODE_TYPES[number];
export type DynamicTemplateSlotType = typeof DYNAMIC_TEMPLATE_SLOT_TYPES[number];
export type DynamicTemplateDevice = "desktop" | "mobile";
export type TemplateBreakpoint = "desktop" | "tablet" | "mobile";
export type DynamicTemplateLengthUnit = "px" | "%" | "rem" | "vw" | "vh";
export type DynamicTemplateDisplay = "block" | "flex" | "grid" | "none";
export type DynamicTemplateHeightMode = "auto" | "fit" | "fill" | "min-height" | "aspect-ratio" | "fixed" | "viewport";
export type DynamicTemplateLayoutMode = "flow" | "free";

export interface DynamicTemplateLength {
  value: number;
  unit: DynamicTemplateLengthUnit;
}

export type DynamicTemplateSize = "auto" | "fill" | "fit" | DynamicTemplateLength;

export interface DynamicTemplateBoxSpacing {
  top: DynamicTemplateLength;
  right: DynamicTemplateLength;
  bottom: DynamicTemplateLength;
  left: DynamicTemplateLength;
}

export interface DynamicTemplateHeightRule {
  mode: DynamicTemplateHeightMode;
  value?: DynamicTemplateLength;
  ratio?: { width: number; height: number };
}

export interface DynamicTemplatePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface DynamicTemplateResponsiveRules {
  display: DynamicTemplateDisplay;
  hidden?: boolean;
  direction?: "row" | "column";
  wrap?: "nowrap" | "wrap";
  order: number;
  width: DynamicTemplateSize;
  height: DynamicTemplateHeightRule;
  maxWidth?: DynamicTemplateLength;
  minWidth?: DynamicTemplateLength;
  minHeight?: DynamicTemplateLength;
  maxHeight?: DynamicTemplateLength;
  gap?: DynamicTemplateLength;
  padding?: DynamicTemplateBoxSpacing;
  margin?: DynamicTemplateBoxSpacing;
  alignItems?: "start" | "center" | "end" | "stretch";
  justifyContent?: "start" | "center" | "end" | "space-between" | "space-around";
  columns?: number[];
  backgroundToken?: string;
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundGradient?: { from: string; to: string; angle: number } | null;
  opacity?: number;
  borderToken?: string;
  radius?: DynamicTemplateLength;
  overflow?: "visible" | "hidden" | "clip";
  layoutMode?: DynamicTemplateLayoutMode;
  placement?: DynamicTemplatePlacement;
  anchor?: DynamicTemplateAnchor;
}

export interface DynamicTemplateAnchor {
  horizontal: "left" | "center" | "right";
  vertical: "top" | "center" | "bottom";
  offsetX: { value: number; unit: "px" | "%" };
  offsetY: { value: number; unit: "px" | "%" };
}

/** 长度、高度与锚点原子覆盖；间距和自由矩形按成员继承。 */
export type DynamicTemplateResponsiveOverride = Partial<Omit<
  DynamicTemplateResponsiveRules, "padding" | "margin" | "placement" | "anchor"
>> & {
  padding?: Partial<DynamicTemplateBoxSpacing>;
  margin?: Partial<DynamicTemplateBoxSpacing>;
  placement?: Partial<DynamicTemplatePlacement> | null;
  anchor?: DynamicTemplateAnchor | null;
};

export interface DynamicTemplateResponsiveMap {
  desktop: DynamicTemplateResponsiveRules;
  /** schema1 必须是完整规则，schema2 是有意修改的属性；读取必须经过 resolver。 */
  mobile: DynamicTemplateResponsiveOverride;
  tablet?: DynamicTemplateResponsiveOverride;
}

export interface DynamicTemplateNodeProps {
  semanticTag?: "section" | "div" | "header" | "article" | "aside" | "nav";
  dividerStyle?: "solid" | "dashed" | "dotted";
  spacerSize?: DynamicTemplateLength;
  contentTemplateLayoutData?: Record<string, unknown>;
  contentTemplateDesignProps?: Record<string, string | number | boolean>;
}

/** 仅供母模板作者工作流使用；页面实例和公开 Renderer 必须忽略。 */
export interface DynamicTemplateNodeAuthoring {
  structureLocked?: boolean;
}

export interface DynamicTemplateInstanceEditPolicy {
  position: boolean;
  size: boolean;
  zIndex: boolean;
  imageFit?: boolean;
  imageFocus?: boolean;
  typography?: boolean;
  spacing?: boolean;
  minWidthPercent: number;
  maxWidthPercent: number;
  maxOffsetPercent: number;
  minFontSizePx?: number;
  maxFontSizePx?: number;
  maxSpacingPx?: number;
}

export interface DynamicTemplateNode {
  nodeId: string;
  type: DynamicTemplateNodeType;
  name: string;
  slotId?: string;
  childIds: string[];
  props: DynamicTemplateNodeProps;
  authoring?: DynamicTemplateNodeAuthoring;
  instanceEditPolicy?: DynamicTemplateInstanceEditPolicy;
  responsive: DynamicTemplateResponsiveMap;
  hidden: boolean;
}

export interface DynamicTemplateSlotValidation {
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  recommendedWidth?: number;
  recommendedHeight?: number;
  allowedProtocols?: Array<"https" | "page" | "product" | "category" | "none">;
}

export interface DynamicTemplateSlotRules {
  fontFamily?: "system" | "serif" | "sans";
  color?: string;
  letterSpacing?: number;
  aspectRatio?: string;
  objectFit?: "cover" | "contain" | "fill";
  objectPosition?: string;
  fontRole?: "display" | "heading" | "body" | "caption" | "action";
  fontSize?: DynamicTemplateLength;
  fontWeight?: number;
  lineHeight?: number;
  textAlign?: "left" | "center" | "right";
  maxLines?: number;
  overflow?: "clip" | "ellipsis" | "wrap";
}

export interface DynamicTemplateSlotDefinition {
  semanticRole?: string;
  slotId: string;
  key: string;
  type: DynamicTemplateSlotType;
  label: string;
  required: boolean;
  editable: boolean;
  hideable: boolean;
  /** 页面实例显式清空时的公开渲染策略；未声明按 hide。 */
  emptyPolicy?: "hide" | "use-default";
  validation: DynamicTemplateSlotValidation;
  desktopRules: DynamicTemplateSlotRules;
  tabletRules?: DynamicTemplateSlotRules;
  mobileRules: DynamicTemplateSlotRules;
}

export interface DynamicTemplateCanvasSize {
  width: number;
  height: number;
  aspectRatio: number;
}

export interface DynamicTemplateMetadata {
  category: string;
  purpose: string;
  layoutType: string;
  slotSummary: string;
  recommendedFor: string[];
  desktopRatio: string;
  mobileRatio: string;
  canvasSize?: DynamicTemplateCanvasSize;
  previewDesktopWidth?: number;
  previewMobileWidth?: number;
  previewTabletWidth?: number;
  mobileBreakpoint?: number;
  minViewportWidth?: number;
  maxViewportWidth?: number;
  defaultBackgroundToken?: string;
  visualRole?: "primary-stage" | "feature-stage" | "support-stage";
  headerCompatibility?: Array<"solid" | "overlay-light">;
  tags: string[];
}

/** 统一母模板的正式产品合同。 */
export interface TemplateDefinitionV2 {
  /** 创建来源快照；重新打开时不能用它覆盖人工精修后的节点树。 */
  templateRecipe?: TemplateRecipe;
  schemaVersion: typeof DYNAMIC_TEMPLATE_SUPPORTED_SCHEMA_VERSIONS[number];
  templateId: string;
  name: string;
  description?: string;
  metadata: DynamicTemplateMetadata;
  rootNodeId: string;
  nodes: Record<string, DynamicTemplateNode>;
  slots: Record<string, DynamicTemplateSlotDefinition>;
  defaultContent: Record<string, unknown>;
  /** 仅用于模板画布、缩略图和异常场景预览，不参与页面或公开渲染。 */
  previewContent?: Record<string, unknown>;
}

export interface TemplateInstanceLayoutOverride {
  offsetXPercent?: number;
  offsetYPercent?: number;
  widthPercent?: number;
  zIndex?: number;
  objectFit?: "cover" | "contain" | "fill";
  imageScalePercent?: number;
  focusXPercent?: number;
  focusYPercent?: number;
  fontSizePx?: number;
  textAlign?: "left" | "center" | "right";
  marginTopPx?: number;
  marginBottomPx?: number;
}

export type TemplateInstanceLayoutOverridesByNodeId = Record<
  string,
  Partial<Record<DynamicTemplateDevice, TemplateInstanceLayoutOverride>>
>;

/** 页面文档持久化的统一实例合同，不复制母模板节点树。 */
export interface TemplateInstanceV2 {
  instanceId: string;
  templateId: string;
  templateVersion: number;
  contentBySlotId: Record<string, unknown>;
  layoutOverridesByNodeId: TemplateInstanceLayoutOverridesByNodeId;
  hiddenSlotIds: string[];
  isVisible: boolean;
}

export interface DynamicTemplateNodeRegistryEntry {
  label: string;
  kind: "structure" | "slot";
  rootOnly: boolean;
  allowedParents: readonly DynamicTemplateNodeType[];
  canHaveChildren: boolean;
  slotType?: DynamicTemplateSlotType;
}

export function isDynamicTemplateNodeType(value: unknown): value is DynamicTemplateNodeType {
  return typeof value === "string" && (DYNAMIC_TEMPLATE_NODE_TYPES as readonly string[]).includes(value);
}

export function isDynamicTemplateSlotType(value: unknown): value is DynamicTemplateSlotType {
  return typeof value === "string" && (DYNAMIC_TEMPLATE_SLOT_TYPES as readonly string[]).includes(value);
}

export function getDynamicTemplateNodeRegistryEntry(
  type: DynamicTemplateNodeType,
): DynamicTemplateNodeRegistryEntry {
  return DYNAMIC_TEMPLATE_NODE_REGISTRY[type] as DynamicTemplateNodeRegistryEntry;
}
`;

const semanticValidatorGenerated = `/**
 * 自动生成，禁止手改。
 * 语义校验单一源：client/src/page-builder/template-definition/validateTemplateDefinition.ts
 * TemplateDefinition Schema SHA-256：${hash}
 */

${semanticValidatorSource
  .replace(
    'from "./generated/templateDefinition.generated";',
    'from "./templateDefinition.generated";',
  )
  .replace(
    'from "../generated/contentTemplates.generated";',
    'from "./contentTemplates.generated";',
  )
  .replace(
    'from "./responsive";',
    'from "./templateResponsive.generated";',
  )}`;

invariant(
  semanticValidatorGenerated.includes('from "./templateDefinition.generated";'),
  "服务端语义校验器未正确改写生成类型导入",
);
invariant(
  semanticValidatorGenerated.includes('from "./contentTemplates.generated";'),
  "服务端语义校验器未正确改写内容模板合同导入",
);

const responsiveOutputPath = path.join(root, "server/src/modules/page-modules/generated/templateResponsive.generated.ts");
const responsiveGenerated = `/** 自动生成，禁止手改。来源：client/src/page-builder/template-definition/responsive.ts */\n${responsiveSource.replaceAll('from "./generated/templateDefinition.generated";', 'from "./templateDefinition.generated";')}`;
let mismatched = false;
if (checkOnly) {
  if (await readFile(responsiveOutputPath, "utf8").catch(() => "") !== responsiveGenerated) {
    console.error("动态模板响应式解析生成物不一致");
    mismatched = true;
  }
} else await writeFile(responsiveOutputPath, responsiveGenerated, "utf8");
for (const outputPath of typeOutputPaths) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  if (checkOnly) {
    const current = await readFile(outputPath, "utf8").catch(() => "");
    if (current !== generated) {
      console.error(`动态模板生成物不一致：${path.relative(root, outputPath)}`);
      mismatched = true;
    }
  } else {
    await writeFile(outputPath, generated, "utf8");
  }
}

await mkdir(path.dirname(serverSemanticValidatorOutputPath), { recursive: true });
if (checkOnly) {
  const current = await readFile(serverSemanticValidatorOutputPath, "utf8").catch(() => "");
  if (current !== semanticValidatorGenerated) {
    console.error(`动态模板生成物不一致：${path.relative(root, serverSemanticValidatorOutputPath)}`);
    mismatched = true;
  }
} else {
  await writeFile(serverSemanticValidatorOutputPath, semanticValidatorGenerated, "utf8");
}

if (mismatched) process.exitCode = 1;
else {
  console.log(
    `动态模板合同一致：schema v${schemaVersion} · ${nodeTypes.length} 种节点 · ${slotTypes.length} 种槽位 · SHA-256 ${hash.slice(0, 12)}`,
  );
}
