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
