import { isSafeContactWechatQrCode } from "./contact-wechat-qr-code";

/** 与发布准备度使用同一组占位标记，避免把草稿提示公开到联系页。 */
const FORMAL_CONTENT_PLACEHOLDER_MARKERS = [
  "待确认",
  "待配置",
  "请填写",
  "正在准备",
  "正在整理",
  "正在完善",
  "内容建设中",
  "即将上线",
] as const;

export type PublicContactSettings = {
  contactPhone: string;
  contactWechat: string;
  contactWechatQrCode: string;
  contactEmail: string;
  contactAddress: string;
  businessHours: string;
};

export const EMPTY_PUBLIC_CONTACT: PublicContactSettings = {
  contactPhone: "",
  contactWechat: "",
  contactWechatQrCode: "",
  contactEmail: "",
  contactAddress: "",
  businessHours: "",
};

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || text.length > max) return "";
  if (FORMAL_CONTENT_PLACEHOLDER_MARKERS.some((marker) => text.includes(marker))) return "";
  return text;
}

/** 只保留联系页会展示的字段。未保存、占位、超长、无效邮箱和不安全二维码都变成空字符串。 */
export function toPublicContactSettings(stored: unknown): PublicContactSettings {
  const source = typeof stored === "object" && stored !== null && !Array.isArray(stored)
    ? stored as Record<string, unknown>
    : {};
  const email = cleanText(source.contactEmail, 100);
  const qr = typeof source.contactWechatQrCode === "string" ? source.contactWechatQrCode.trim() : "";
  return {
    contactPhone: cleanText(source.contactPhone, 30),
    contactWechat: cleanText(source.contactWechat, 100),
    contactWechatQrCode: isSafeContactWechatQrCode(qr) ? qr : "",
    contactEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
    contactAddress: cleanText(source.contactAddress, 300),
    businessHours: cleanText(source.businessHours, 100),
  };
}
