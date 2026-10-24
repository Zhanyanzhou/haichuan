import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class StorefrontTrafficDto {
  @IsString()
  @MaxLength(300)
  pagePath!: string;

  @IsOptional()
  @IsBoolean()
  visitor?: boolean;
}
