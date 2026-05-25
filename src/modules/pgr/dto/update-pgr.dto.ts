import { PartialType } from '@nestjs/mapped-types';
import { CreatePgrDto } from './create-pgr.dto';

export class UpdatePgrDto extends PartialType(CreatePgrDto) {}
