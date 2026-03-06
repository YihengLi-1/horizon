import { IsArray, IsInt, IsOptional, IsString, Min } from "class-validator";

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  credits?: number;

  @IsOptional()
  @IsString()
  dept?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  prerequisiteCourseIds?: string[];
}
