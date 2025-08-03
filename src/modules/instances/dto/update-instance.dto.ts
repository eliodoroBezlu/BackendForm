import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateInstanceDto } from './create-instance.dto';
import { IsOptional, IsString } from 'class-validator';

export class UpdateInstanceDto extends PartialType(CreateInstanceDto) {
    @ApiProperty({ description: "Usuario que actualiza la instancia", required: false })
    @IsOptional()
    @IsString()
    updatedBy?: string

    @ApiProperty({ description: "Usuario que revisa la instancia", required: false })
    @IsOptional()
    @IsString()
    reviewedBy?: string

    @ApiProperty({ description: "Usuario que aprueba la instancia", required: false })
    @IsOptional()
    @IsString()
    approvedBy?: string
}