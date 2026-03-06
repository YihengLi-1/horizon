import { IsString, MinLength } from 'class-validator';

export class BulkNotifyDto {
  @IsString()
  @MinLength(1)
  subject!: string;

  @IsString()
  @MinLength(1)
  message!: string;
}
