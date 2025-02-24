import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { ExcelService } from "./excel.service"

@Module({
    imports: [ConfigModule], // Asegura que ConfigModule está disponible
    providers: [ExcelService],
    exports: [ExcelService],
})
export class ExcelModule {}