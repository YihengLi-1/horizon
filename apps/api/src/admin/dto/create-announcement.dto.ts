import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAnnouncementDto {
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MinLength(1)
  title!: string;

  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  body!: string;

  @Transform(({ value }) => String(value ?? 'ALL').trim().toUpperCase())
  @IsIn(['ALL', 'STUDENT', 'ADMIN'])
  audience: 'ALL' | 'STUDENT' | 'ADMIN' = 'ALL';

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
