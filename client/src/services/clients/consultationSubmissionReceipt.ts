export type ConsultationSubmissionReceipt = {
  /** 兼容旧客户端的来源记录 ID；不得作为 Lead ID 使用。 */
  id: number;
  /** Inquiry / SelectionInquiry 的来源记录 ID。 */
  sourceId: number;
  /** 统一咨询域的 canonical Lead ID，仅用于本人咨询详情路径。 */
  leadId: number;
  status: string;
  createdAt: string;
};

const CONSULTATION_STATUS_COPY: Record<string, string> = {
  PENDING: "待顾问联系",
  PROCESSING: "顾问处理中",
  CONTACTED: "顾问已联系",
  FOLLOWING: "持续跟进中",
  REPLIED: "顾问已回复",
  COMPLETED: "已完成",
  INVALID: "已关闭",
  CLOSED: "已结束",
};

export function getConsultationSubmissionStatusCopy(status: string): string {
  return CONSULTATION_STATUS_COPY[status.trim().toUpperCase()] ?? "状态已更新";
}

export function parseConsultationSubmissionReceipt(
  value: unknown,
): ConsultationSubmissionReceipt | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = Number(record.id);
  const sourceId = Number(record.sourceId);
  const leadId = Number(record.leadId);
  if (
    !Number.isSafeInteger(id)
    || id <= 0
    || !Number.isSafeInteger(sourceId)
    || sourceId <= 0
    || id !== sourceId
    || !Number.isSafeInteger(leadId)
    || leadId <= 0
    || typeof record.status !== "string"
    || !record.status.trim()
    || typeof record.createdAt !== "string"
    || Number.isNaN(Date.parse(record.createdAt))
  ) {
    return null;
  }
  return {
    id,
    sourceId,
    leadId,
    status: record.status,
    createdAt: record.createdAt,
  };
}
