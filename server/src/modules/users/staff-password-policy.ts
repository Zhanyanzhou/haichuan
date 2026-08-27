import { BadRequestException } from "@nestjs/common";

export const STAFF_PASSWORD_MESSAGE =
  "密码至少 12 位，并包含大小写字母、数字和符号";
export const STAFF_PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,128}$/;

export function assertStaffPassword(password: string): void {
  if (!STAFF_PASSWORD_PATTERN.test(password)) {
    throw new BadRequestException(STAFF_PASSWORD_MESSAGE);
  }
}
