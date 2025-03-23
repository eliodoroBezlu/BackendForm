import { PartialType } from '@nestjs/mapped-types';
import { CreateExtintorDto } from './create-extintor.dto';

export class UpdateExtintorDto extends PartialType(CreateExtintorDto) {}
