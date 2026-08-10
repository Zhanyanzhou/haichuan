import {
  IsString,
  IsOptional,
  IsEnum,
  MaxLength,
} from "class-validator";
import { PartialType } from "@nestjs/swagger";
import { CertType } from "@prisma/client";

export class CreateCertificateDto {
  @IsEnum(CertType, { message: "证书类型不正确" })
  certType!: CertType;

  // 允许先建空记录再编辑，与编辑器「添加证书 → 内联填写」流程匹配
  @IsOptional()
  @IsString({ message: "证书编号必须是字符串" })
  @MaxLength(100, { message: "证书编号不能超过100个字符" })
  certNumber?: string;

  @IsOptional()
  @IsString({ message: "证书图片URL必须是字符串" })
  certImage?: string;

  @IsOptional()
  @IsString({ message: "有效期格式不正确" })
  expireDate?: string;
}

export class UpdateCertificateDto extends PartialType(CreateCertificateDto) {}
