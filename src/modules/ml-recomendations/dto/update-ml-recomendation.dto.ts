import { PartialType } from '@nestjs/swagger';
import { CreateMlRecomendationDto } from './create-ml-recomendation.dto';

export class UpdateMlRecomendationDto extends PartialType(CreateMlRecomendationDto) {}
