import { IsString, Length } from 'class-validator';

export class Verify2FADto {
  @IsString()
  @Length(6, 6)
  code: string;

  @IsString()
  tempToken: string;
}