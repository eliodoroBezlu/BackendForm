import { IsString, Length } from 'class-validator';

export class Setup2FADto {
  @IsString()
  @Length(6, 6)
  code: string;
}