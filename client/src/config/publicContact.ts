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
