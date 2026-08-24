import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigBienvenidaService } from './config-bienvenida.service';
import { ConfigBienvenidaController } from './config-bienvenida.controller';
import {
  ConfigBienvenida,
  ConfigBienvenidaSchema,
} from './schemas/config-bienvenida.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ConfigBienvenida.name, schema: ConfigBienvenidaSchema },
    ]),
  ],
  controllers: [ConfigBienvenidaController],
  providers: [ConfigBienvenidaService],
  exports: [ConfigBienvenidaService],
})
export class ConfigBienvenidaModule {}
