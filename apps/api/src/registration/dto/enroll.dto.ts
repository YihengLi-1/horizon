import { IsString, MinLength } from 'class-validator';

export class EnrollDto {
  @IsString()
  @MinLength(1)
  termId!: string;

  @IsString()
  @MinLength(1)
  sectionId!: string;
}
