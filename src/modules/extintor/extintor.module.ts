import { Module } from '@nestjs/common';
import { ExtintorService } from './extintor.service';
import { ExtintorController } from './extintor.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Extintor, ExtintorSchema } from './schemas/extintor.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Extintor.name, schema: ExtintorSchema },
    ]),
  ],
  controllers: [ExtintorController],
  providers: [ExtintorService],
  exports: [ExtintorService],
})
export class ExtintorModule {}
