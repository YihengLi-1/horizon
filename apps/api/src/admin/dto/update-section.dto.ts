import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min, ValidateNested } from "class-validator";

class MeetingTimeDto {
  @IsInt()
  weekday!: number;

  @IsInt()
  @Min(0)
  startMinutes!: number;

  @IsInt()
  @Min(1)
  endMinutes!: number;
}

export class UpdateSectionDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  capacity?: number;

  @IsOptional()
  @IsString()
  instructorName?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsBoolean()
  requireApproval?: boolean;

  @IsOptional()
  @IsString()
  modality?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MeetingTimeDto)
  meetingTimes?: MeetingTimeDto[];
}
