import { IsString, MinLength } from 'class-validator';

export class UpdateGradeDto {
  @IsString()
  @MinLength(1)
  enrollmentId!: string;

  @IsString()
  @MinLength(1)
  finalGrade!: string;
}
