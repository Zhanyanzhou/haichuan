import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  Matches,
  MaxLength,
  ValidateIf,
} from "class-validator";
import { PartialType } from "@nestjs/swagger";
import { CertType } from "@prisma/client";
import { Transform } from "class-transformer";

const CERTIFICATE_NUMBER_CONTENT = /[\p{L}\p{N}]/u;

export function isPublishableCertificateNumber(value: unknown): boolean {
  return typeof value === "string" && CERTIFICATE_NUMBER_CONTENT.test(value);
}

export class CreateCertificateDto {
  @IsEnum(CertType, { message: "证书类型不正确" })
  certType!: CertType;

  // 允许先建空记录再编辑，与编辑器「添加证书 → 内联填写」流程匹配
  @IsOptional()
  @Transform(({ obj }) => typeof obj.certNumber === "string" ? obj.certNumber.trim() : obj.certNumber)
  @ValidateIf((_object, value) => value !== "")
  @IsString({ message: "证书编号必须是字符串" })
  @Matches(CERTIFICATE_NUMBER_CONTENT, { message: "证书编号须包含数字或文字" })
  @MaxLength(100, { message: "证书编号不能超过100个字符" })
  certNumber?: string;

  @IsOptional()
  @IsString({ message: "证书图片URL必须是字符串" })
  certImage?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== "")
  @IsDateString({ strict: true }, { message: "有效期须使用有效日期" })
  expireDate?: string;
}

export class UpdateCertificateDto extends PartialType(CreateCertificateDto) {}
