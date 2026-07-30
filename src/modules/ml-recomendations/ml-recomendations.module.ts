import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InstancesModule } from '../instances/instances.module';
import { MLRecommendationsService } from './ml-recomendations.service';
import { MLRecommendationsController } from './ml-recomendations.controller';

@Module({
  imports: [ConfigModule, InstancesModule],
  controllers: [MLRecommendationsController],
  providers: [MLRecommendationsService],
  exports: [MLRecommendationsService],
})
export class MLRecommendationsModule {}
