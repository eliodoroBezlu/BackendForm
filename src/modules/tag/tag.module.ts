import { Module } from '@nestjs/common';
import { TagService } from './tag.service';
import { TagController } from './tag.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdenTrabajo, OrdenTrabajoSchema } from './schema/tag.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrdenTrabajo.name, schema: OrdenTrabajoSchema }
    ]),
  ],
  controllers: [TagController],
  providers: [TagService],
})
export class TagModule {}
