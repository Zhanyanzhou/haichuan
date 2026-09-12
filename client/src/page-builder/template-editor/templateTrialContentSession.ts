import { create } from "zustand";

export type TemplateTrialContentBySlotId = Record<string, unknown>;

interface TemplateTrialContentSessionState {
  sessionId: string | null;
  contentBySlotId: TemplateTrialContentBySlotId;
  setSlotContent: (sessionId: string, slotId: string, value: unknown) => void;
  clearSlotContent: (sessionId: string, slotId: string) => void;
}

/**
 * 模板试排内容只存在于当前浏览器内存中。
 * 它不属于 TemplateDefinition、草稿仓储或页面实例，也不接入任何持久化中间件。
 */
export const useTemplateTrialContentSession = create<TemplateTrialContentSessionState>((set) => ({
  sessionId: null,
  contentBySlotId: {},
  setSlotContent: (sessionId, slotId, value) => set((current) => ({
    sessionId,
    contentBySlotId: {
      ...(current.sessionId === sessionId ? current.contentBySlotId : {}),
      [slotId]: structuredClone(value),
    },
  })),
  clearSlotContent: (sessionId, slotId) => set((current) => {
    if (current.sessionId !== sessionId || !(slotId in current.contentBySlotId)) return current;
    const next = { ...current.contentBySlotId };
    delete next[slotId];
    return { sessionId, contentBySlotId: next };
  }),
}));

export function getTemplateTrialContentForSession(
  state: Pick<TemplateTrialContentSessionState, "sessionId" | "contentBySlotId">,
  sessionId: string | null,
): TemplateTrialContentBySlotId {
  return sessionId && state.sessionId === sessionId ? state.contentBySlotId : {};
}

export function mergeTemplateTrialContent(
  baseContentBySlotId: Record<string, unknown>,
  trialContentBySlotId: TemplateTrialContentBySlotId,
): Record<string, unknown> {
  if (Object.keys(trialContentBySlotId).length === 0) return baseContentBySlotId;
  return {
    ...baseContentBySlotId,
    ...structuredClone(trialContentBySlotId),
  };
}
