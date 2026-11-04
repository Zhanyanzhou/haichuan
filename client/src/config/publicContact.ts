import { LEGAL_ENTITY } from "./legalEntity";

/**
 * 2026-10-05 已签认、允许公开的联系事实。
 * 店铺资料里的非空字段优先；对应字段为空时，公开页使用这里的签认值。
 * 不在这里编造门店、电话、营业时间或服务承诺。
 */
export const SIGNED_PUBLIC_CONTACT = {
  phone: "15918549866",
  email: "1007339106@qq.com",
  address: LEGAL_ENTITY.registeredAddress,
  hours: "周一至周六 9:00–12:00、13:00–21:00（12:00–13:00 午休）；周日休息",
  holidayNotice: "法定节假日按国家安排休息。营业时间如有调整，会提前在本页说明。",
  serviceArea: "深圳门店到店接待；线上咨询不限地区",
} as const;

export function preferSiteSetting(value: unknown, signed: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : signed;
}

function storedText(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 只把可拨打的号码当成电话，避免微信号被显示成联系电话。 */
export function isDialablePhone(value: string): boolean {
  return /^\+?[\d\s()-]+$/.test(value) && /\d/.test(value);
}

export function resolvePublicPhone(stored: string | undefined): string {
  const value = storedText(stored);
  return isDialablePhone(value) ? value : SIGNED_PUBLIC_CONTACT.phone;
}

/**
 * 公司微信号优先。联系电话里若填的不是可拨打号码，且微信号为空，
 * 则把该值标成微信号，不再冒充电话。
 */
export function resolvePublicWechat(storedWechat: string | undefined, storedPhone: string | undefined): string {
  const wechat = storedText(storedWechat);
  if (wechat) return wechat;
  const phone = storedText(storedPhone);
  return phone && !isDialablePhone(phone) ? phone : "";
}
