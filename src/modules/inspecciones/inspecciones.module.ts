import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { InspeccionesService } from "./inspecciones.service"
import { InspeccionesController } from "./inspecciones.controller"
import { Inspeccion, InspeccionSchema } from "./schemas/inspeccion.schema"
import { ExcelModule } from "../excel/excel.module"

@Module({
  imports: [MongooseModule.forFeature([{ name: Inspeccion.name, schema: InspeccionSchema }]), ExcelModule],
  controllers: [InspeccionesController],
  providers: [InspeccionesService],
  exports: [InspeccionesService],
})
export class InspeccionesModule {}
