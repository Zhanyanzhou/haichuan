/**
 * 联系页属性面板与店铺资料之间的字段对照。
 * 只比较和裁剪字符串，不读取接口，也不把签认兜底值写回店铺资料。
 */
import { isDialablePhone } from "@/config/publicContact";

export const CONTACT_FACT_KEYS = [
  "contactPhone",
  "contactWechat",
  "contactWechatQrCode",
  "contactEmail",
  "contactAddress",
  "businessHours",
] as const;

export type ContactFactKey = (typeof CONTACT_FACT_KEYS)[number];

export type ContactFacts = Record<ContactFactKey, string>;

export type SignedContactFacts = {
  phone: string;
  email: string;
  address: string;
  hours: string;
};

export function emptyContactFacts(): ContactFacts {
  return {
    contactPhone: "",
    contactWechat: "",
    contactWechatQrCode: "",
    contactEmail: "",
    contactAddress: "",
    businessHours: "",
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

/** 只接受字符串。空字段保持空白，避免把缺失值误写成别的内容。 */
export function readContactFacts(value: unknown): ContactFacts {
  const facts = emptyContactFacts();
  const record = asRecord(value);
  if (!record) return facts;
  for (const key of CONTACT_FACT_KEYS) {
    const field = record[key];
    if (field === undefined || field === null) continue;
    if (typeof field !== "string") {
      throw new Error("店铺资料响应无效");
    }
    facts[key] = field;
  }
  return facts;
}

/** 与服务端联系二维码约束一致：只接受本站受控图片。 */
export function isContactQrCodeReference(value: string): boolean {
  return value === ""
    || /^\/uploads\/page-assets\/[A-Za-z0-9_-]+\.(?:png|jpe?g|webp|gif)$/i.test(value)
    || /^\/api\/upload\/public-media\/[1-9]\d*$/.test(value);
}

/**
 * 联系电话里保存的不可拨打内容，就是联系页正在显示的微信号。
 * 公司微信号已有内容时，不再从电话字段借用。
 */
export function misplacedWechatId(stored: ContactFacts): string {
  const phone = stored.contactPhone.trim();
  if (stored.contactWechat.trim() || !phone || isDialablePhone(phone)) return "";
  return phone;
}

/**
 * 输入框展示联系页实际会看到的值。
 * 不可拨打的联系电话改在公司微信号里编辑；电话框显示可拨打号码或签认电话。
 * 邮箱、地址、营业时间在店铺资料为空时使用签认值。微信号和二维码没有签认图文。
 */
export function effectiveContactFacts(
  stored: ContactFacts,
  signed: SignedContactFacts,
): ContactFacts {
  const storedPhone = stored.contactPhone.trim();
  return {
    contactPhone: isDialablePhone(storedPhone) ? storedPhone : signed.phone,
    contactWechat: stored.contactWechat.trim() || misplacedWechatId(stored),
    contactWechatQrCode: stored.contactWechatQrCode.trim(),
    contactEmail: stored.contactEmail.trim() || signed.email,
    contactAddress: stored.contactAddress.trim() || signed.address,
    businessHours: stored.businessHours.trim() || signed.hours,
  };
}

/**
 * 只提交真正改过的字段。
 * 与当前展示值相同，或与已保存值相同，都不写入，避免把签认兜底冻结进店铺资料。
 */
export function contactFactSavePatch(
  stored: ContactFacts,
  baseline: ContactFacts,
  draft: ContactFacts,
): Partial<ContactFacts> {
  const patch: Partial<ContactFacts> = {};
  for (const key of CONTACT_FACT_KEYS) {
    const next = draft[key].trim();
    if (next === baseline[key].trim()) continue;
    if (next === stored[key].trim()) continue;
    patch[key] = next;
  }
  const misplaced = misplacedWechatId(stored);
  if (misplaced) {
    const draftWechat = draft.contactWechat.trim();
    const draftPhone = draft.contactPhone.trim();
    if (patch.contactWechat === undefined && draftWechat !== stored.contactWechat.trim()) {
      patch.contactWechat = draftWechat;
    }
    if (patch.contactPhone === undefined && draftPhone !== stored.contactPhone.trim()) {
      patch.contactPhone = draftPhone === baseline.contactPhone.trim() ? "" : draftPhone;
    }
  }
  return patch;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 只校验即将提交的字段，长度与服务端 DTO 对齐。 */
export function contactFactError(patch: Partial<ContactFacts>): string | null {
  if (patch.contactPhone !== undefined && patch.contactPhone.length > 30) {
    return "联系电话不能超过 30 个字符";
  }
  if (patch.contactWechat !== undefined && patch.contactWechat.length > 100) {
    return "公司微信号不能超过 100 个字符";
  }
  if (patch.contactEmail !== undefined) {
    if (patch.contactEmail.length > 100) return "联系邮箱不能超过 100 个字符";
    if (patch.contactEmail && !EMAIL_PATTERN.test(patch.contactEmail)) {
      return "请输入有效的联系邮箱";
    }
  }
  if (patch.contactAddress !== undefined && patch.contactAddress.length > 300) {
    return "公司地址不能超过 300 个字符";
  }
  if (patch.businessHours !== undefined && patch.businessHours.length > 100) {
    return "营业时间不能超过 100 个字符";
  }
  if (
    patch.contactWechatQrCode !== undefined
    && patch.contactWechatQrCode
    && !isContactQrCodeReference(patch.contactWechatQrCode)
  ) {
    return "请上传本站受控的二维码图片";
  }
  return null;
}
