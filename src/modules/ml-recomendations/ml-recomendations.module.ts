import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import {
  Instance,
  InstanceSchema,
} from '../instances/schemas/instance.schema';
import { MLRecommendationsService } from './ml-recomendations.service';
import { MLRecommendationsController } from './ml-recomendations.controller';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Instance.name, schema: InstanceSchema },
    ]),
  ],
  controllers: [MLRecommendationsController],
  providers: [MLRecommendationsService],
  exports: [MLRecommendationsService],
})
export class MLRecommendationsModule {}