export type VisualViewport = "desktop" | "mobile";

export interface VisualRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EffectiveVisualNode {
  enabled?: boolean;
  rect?: VisualRect;
  zIndex?: number;
  ratio?: number;
  sizePreset?: string;
  positionPreset?: string;
  fit?: "cover" | "contain";
  zoom?: number;
  focus?: { x: number; y: number };
  typography?: {
    sizeLevel?: "xs" | "sm" | "md" | "lg" | "xl";
    align?: "left" | "center" | "right";
    color?: string;
    maxLines?: number;
    safeBand?: "none" | "light" | "dark";
    /** 行距倍数（1–2.5），数值型，由面板滑杆写入 */
    lineHeight?: number;
    /** 字间距 em（-0.05–0.5），数值型，由面板滑杆写入 */
    letterSpacing?: number;
  };
}

type UnknownRecord = Record<string, any>;

export function isVisualRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
};

export function resolveVisualNode(
  props: Record<string, unknown> | undefined,
  nodeId: string,
  viewport: VisualViewport,
): EffectiveVisualNode {
  const overrides = isVisualRecord(props?.__instanceOverrides)
    ? props.__instanceOverrides
    : undefined;
  if (!overrides) return {};

  if (overrides.version === 2) {
    const nodes = isVisualRecord(overrides.nodes) ? overrides.nodes : {};
    const node = isVisualRecord(nodes[nodeId]) ? nodes[nodeId] : {};
    const rects = isVisualRecord(node.rectByViewport) ? node.rectByViewport : {};
    const directRect = isVisualRecord(rects[viewport]) ? rects[viewport] : undefined;
    const rawRect = directRect;
    const mediaView = isVisualRecord(node.mediaView) ? node.mediaView : {};
    const focusByViewport = isVisualRecord(mediaView.focusByViewport)
      ? mediaView.focusByViewport
      : {};
    const directFocus = isVisualRecord(focusByViewport[viewport])
      ? focusByViewport[viewport]
      : undefined;
    const rawFocus = directFocus;
    const typography = isVisualRecord(node.typography) ? node.typography : undefined;
    return {
      enabled: typeof node.enabled === "boolean" ? node.enabled : undefined,
      rect: rawRect
        ? {
            x: clamp(rawRect.x, 0, 1, 0),
            y: clamp(rawRect.y, 0, 1, 0),
            width: clamp(rawRect.width, 0.01, 1, 1),
            height: clamp(rawRect.height, 0.01, 1, 1),
          }
        : undefined,
      zIndex: (() => {
        const zIndexes = isVisualRecord(node.zIndexByViewport)
          ? node.zIndexByViewport
          : {};
        const direct = zIndexes[viewport];
        const rawZIndex = direct;
        return Number.isInteger(Number(rawZIndex))
          ? clamp(rawZIndex, 0, 20, 2)
          : undefined;
      })(),
      ratio: Number.isFinite(Number(node.ratio))
        ? clamp(node.ratio, 0.25, 4, 1)
        : undefined,
      sizePreset: typeof node.sizePreset === "string" ? node.sizePreset : undefined,
      positionPreset: typeof node.positionPreset === "string" ? node.positionPreset : undefined,
      fit: mediaView.fit === "contain" ? "contain" : mediaView.fit === "cover" ? "cover" : undefined,
      zoom: Number.isFinite(Number(mediaView.zoom))
        ? clamp(mediaView.zoom, 1, 3, 1)
        : undefined,
      focus: rawFocus
        ? {
            x: clamp(rawFocus.x, 0, 100, 50),
            y: clamp(rawFocus.y, 0, 100, 50),
          }
        : undefined,
      typography: typography
        ? {
            sizeLevel: ["xs", "sm", "md", "lg", "xl"].includes(typography.sizeLevel)
              ? typography.sizeLevel
              : undefined,
            align: ["left", "center", "right"].includes(typography.align)
              ? typography.align
              : undefined,
            color: typeof typography.color === "string" ? typography.color : undefined,
            maxLines: Number.isFinite(Number(typography.maxLines))
              ? clamp(typography.maxLines, 1, 12, 4)
              : undefined,
            safeBand: ["none", "light", "dark"].includes(typography.safeBand)
              ? typography.safeBand
              : undefined,
            lineHeight: Number.isFinite(Number(typography.lineHeight))
              ? clamp(typography.lineHeight, 1, 2.5, 1.5)
              : undefined,
            letterSpacing: Number.isFinite(Number(typography.letterSpacing))
              ? clamp(typography.letterSpacing, -0.05, 0.5, 0)
              : undefined,
          }
        : undefined,
    };
  }

  if (overrides.version === 1) {
    const slots = isVisualRecord(overrides.slots) ? overrides.slots : {};
    const slot = isVisualRecord(slots[nodeId]) ? slots[nodeId] : {};
    const focusByViewport = isVisualRecord(slot.focusByViewport)
      ? slot.focusByViewport
      : {};
    const rawFocus = isVisualRecord(focusByViewport[viewport])
      ? focusByViewport[viewport]
      : viewport === "mobile" && isVisualRecord(focusByViewport.desktop)
        ? focusByViewport.desktop
        : undefined;
    return {
      sizePreset: typeof slot.sizePreset === "string" ? slot.sizePreset : undefined,
      positionPreset: typeof slot.positionPreset === "string" ? slot.positionPreset : undefined,
      fit: slot.fit === "contain" ? "contain" : slot.fit === "cover" ? "cover" : undefined,
      zoom: Number.isFinite(Number(slot.zoom)) ? clamp(slot.zoom, 1, 3, 1) : undefined,
      focus: rawFocus
        ? {
            x: clamp(rawFocus.x, 0, 100, 50),
            y: clamp(rawFocus.y, 0, 100, 50),
          }
        : undefined,
    };
  }

  return {};
}

function cleanRecord(value: UnknownRecord): UnknownRecord | undefined {
  const entries = Object.entries(value).flatMap(([key, child]) => {
    if (child === undefined) return [];
    if (isVisualRecord(child)) {
      const cleaned = cleanRecord(child);
      return cleaned ? [[key, cleaned] as const] : [];
    }
    return [[key, child] as const];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function toVisualOverridesV2(source: unknown): UnknownRecord {
  if (isVisualRecord(source) && source.version === 2) return structuredClone(source);
  const next: UnknownRecord = { version: 2 };
  if (!isVisualRecord(source) || source.version !== 1) return next;
  const layout = isVisualRecord(source.layout) ? source.layout : {};
  if (layout.framePreset || layout.compositionPreset) {
    next.frame = {
      heightPreset: layout.framePreset,
      compositionPreset: layout.compositionPreset,
    };
  }
  const nodes: UnknownRecord = {};
  if (isVisualRecord(source.slots)) {
    for (const [nodeId, rawSlot] of Object.entries(source.slots)) {
      if (!isVisualRecord(rawSlot)) continue;
      nodes[nodeId] = {
        ratio: typeof rawSlot.ratioPreset === "string"
          ? Number(rawSlot.ratioPreset.split("/")[0]) / Number(rawSlot.ratioPreset.split("/")[1])
          : undefined,
        sizePreset: rawSlot.sizePreset,
        positionPreset: rawSlot.positionPreset,
        mediaView: {
          fit: rawSlot.fit,
          zoom: rawSlot.zoom,
          focusByViewport: rawSlot.focusByViewport,
        },
      };
    }
  }
  if (isVisualRecord(source.textRoles)) {
    for (const [nodeId, rawRole] of Object.entries(source.textRoles)) {
      if (!isVisualRecord(rawRole)) continue;
      nodes[nodeId] = {
        ...(isVisualRecord(nodes[nodeId]) ? nodes[nodeId] : {}),
        enabled: rawRole.enabled,
        typography: {
          align: rawRole.align,
          safeBand: rawRole.safeBand,
        },
      };
    }
  }
  if (Object.keys(nodes).length) next.nodes = nodes;
  return cleanRecord(next) ?? { version: 2 };
}

export function setVisualOverridePath(
  source: unknown,
  path: string[],
  value: unknown,
): UnknownRecord | undefined {
  const root = toVisualOverridesV2(source);
  let cursor = root;
  for (const key of path.slice(0, -1)) {
    cursor[key] = isVisualRecord(cursor[key]) ? { ...cursor[key] } : {};
    cursor = cursor[key];
  }
  const leaf = path[path.length - 1];
  if (value === undefined || value === "") delete cursor[leaf];
  else cursor[leaf] = value;
  const cleaned = cleanRecord(root);
  if (!cleaned || Object.keys(cleaned).every((key) => key === "version")) return undefined;
  return { version: 2, ...cleaned };
}
