import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { InspeccionesEmergenciaExcelService } from "./inspecciones-emergencia-excel.service"

@Module({
    imports: [ConfigModule], // Asegura que ConfigModule está disponible
    providers: [InspeccionesEmergenciaExcelService],
    exports: [InspeccionesEmergenciaExcelService],
})
export class InspeccionesEmergenciaExcelModule {}