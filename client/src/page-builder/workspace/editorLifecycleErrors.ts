import { getSafeAdminErrorMessage } from "@/constants/adminCopy";

export function getEditorErrorMessage(error: unknown, fallback: string) {
  return getSafeAdminErrorMessage(error, fallback);
}

export function getEditorHttpStatus(error: unknown) {
  const normalizedStatus = (error as { status?: unknown })?.status;
  if (typeof normalizedStatus === "number") return normalizedStatus;
  const status = (error as { response?: { status?: unknown } })?.response?.status;
  return typeof status === "number" ? status : undefined;
}

export function getEditorApiErrorMessage(error: unknown): string {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const message = (data as { message?: unknown }).message;
  return typeof message === "string" ? message.trim() : "";
}

/** 冲突恢复：复制本地草稿快照，不覆盖远端，也不写入密钥。 */
export async function copyEditorLocalConflictSnapshot(payload: unknown): Promise<boolean> {
  try {
    const text = JSON.stringify(payload, null, 2);
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
