/** 项目内可持久化的 Puck 文档最小结构。 */
export type PuckProps = Record<string, unknown>;

export type PuckBlock = {
  type?: string;
  props?: PuckProps;
};

export type PuckDocument = {
  content?: PuckBlock[];
  zones?: Record<string, PuckBlock[]>;
  root?: unknown;
  [key: string]: unknown;
};

export function isPuckBlock(value: unknown): value is PuckBlock {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const block = value as Record<string, unknown>;
  return (block.type === undefined || typeof block.type === "string")
    && (block.props === undefined
      || (typeof block.props === "object" && block.props !== null && !Array.isArray(block.props)));
}

export function isPuckDocument(value: unknown): value is PuckDocument {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
