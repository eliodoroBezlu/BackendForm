import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigFormularioService } from './config-formulario.service';
import { ConfigFormularioController } from './config-formulario.controller';
import { ConfigFormulario, ConfigFormularioSchema } from './schemas/config-formulario.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ConfigFormulario.name, schema: ConfigFormularioSchema }]),
  ],
  controllers: [ConfigFormularioController],
  providers: [ConfigFormularioService],
  exports: [ConfigFormularioService],
})
export class ConfigFormularioModule {}
