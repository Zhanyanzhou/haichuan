import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsBoolean,
  IsInt,
} from 'class-validator';

export class SaveSlotDto {
  @IsString() @IsNotEmpty() @MaxLength(100) slotKey!: string;
  @IsString() @IsNotEmpty() @MaxLength(50) pageKey!: string;
  @IsString() @IsNotEmpty() @MaxLength(50) sectionKey!: string;
  @IsString() @IsNotEmpty() @MaxLength(20) contentType!: string;
  @IsOptional() @IsString() @MaxLength(500) desktopAsset?: string;
  @IsOptional() @IsString() @MaxLength(500) mobileAsset?: string;
  @IsOptional() @IsString() @MaxLength(300) title?: string;
  @IsOptional() @IsString() @MaxLength(500) subtitle?: string;
  @IsOptional() @IsString() @MaxLength(500) linkUrl?: string;
  @IsOptional() @IsString() @MaxLength(200) altText?: string;
  @IsOptional() @IsBoolean() isVisible?: boolean;
  @IsOptional() @IsInt() updatedBy?: number;
}
