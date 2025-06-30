import { PartialType } from '@nestjs/mapped-types';
import { CreateQrGeneratorDto } from './create-qr-generator.dto';

export class UpdateQrGeneratorDto extends PartialType(CreateQrGeneratorDto) {}
