// src/equipment-tracking/template-config.service.ts
import { Injectable } from '@nestjs/common';
import {
  FrequencyConfig,
  InspectionFrequencyType,
} from './types/inspection-frequency.type';

@Injectable()
export class TemplateConfigService {
  private readonly templateConfigs: Record<string, FrequencyConfig> = {
    // ========== TECLES ==========
    '3.04.P37.F24': {
      // Pre-uso tecles
      type: 'pre-uso-contador',
      usageInterval: 6,
      linkedFormCode: '3.04.P37.F25', // Inspección frecuente
      equipmentFieldName: 'TAG',
    },
    '3.04.P37.F25': {
      // Inspección frecuente tecles
      type: 'frecuente',
      equipmentFieldName: 'TAG',
      requiresTagVerification: true, // ✅ SÍ necesita verificación
      canOpenDirectly: true, // ✅ SÍ se puede abrir directamente
      linkedFormCode: '3.04.P37.F24', // ✅ Para redireccionar al pre-uso si es necesario
    },

    // ========== EQUIPOS PERIÓDICOS ==========
    '1.02.P06.F39': {
      // Amoladora
      type: 'mensual',
      intervalDays: 30,
      equipmentFieldName: 'IDENTIFICACIÓN INTERNA DEL EQUIPO',
    },
    '1.02.P06.F40': {
      // Esmeril
      type: 'mensual',
      intervalDays: 30,
      equipmentFieldName: 'IDENTIFICACIÓN INTERNA DEL EQUIPO',
    },
    '1.02.P06.F37': {
      // Man Lift
      type: 'pre-uso',
      equipmentFieldName: 'PLACA/N° INTERNO',
    },
    '1.02.P06.F33': {
      // Escaleras
      type: 'mensual',
      intervalDays: 30,
      equipmentFieldName: 'CÓDIGO DE LA ESCALERA',
    },

    '1.02.P06.F30': {
      // Andamios
      type: 'pre-uso',
      equipmentFieldName: 'PROYECTO/Nº DE ORDEN DE TRABAJO',
    },
    // ========== PRE-USO SIMPLES ==========
    '3.04.P04.F23': {
      // Puente grua cabina
      type: 'pre-uso',
      equipmentFieldName: 'TAG del Puente Grúa',
    },
    '3.04.P04.F35': {
      // Puente grua control remoto
      type: 'pre-uso',
      equipmentFieldName: 'Tag del puente grúa',
    },

    '3.04.P37.F30': {
      // Puente grua control remoto
      type: 'pre-uso',
      equipmentFieldName: 'PLACA',
    },

    // ========== OTROS ==========
    '1.02.P06.F20': {
      // Cilindros gases
      type: 'mensual',
      intervalDays: 30,
      equipmentFieldName: 'OT N°',
    },

    '1.02.P06.F19': {
      // arnes y conectores
      type: 'mensual',
      intervalDays: 30,
      equipmentFieldName: 'COD. ARNÉS',
    },
    '1.02.P06.F42': {
      // Soldadura
      type: 'mensual',
      intervalDays: 30,
      equipmentFieldName: 'IDENTIFICACIÓN INTERNA DEL EQUIPO',
    },
    '2.03.P10.F05': {
      // Taladro
      type: 'mensual',
      intervalDays: 30,
      equipmentFieldName: 'CÓDIGO TALADRO',
    },

    '3.04.P48.F03': {
      // Vehiculos
      type: 'semanal',
      intervalDays: 7,
      equipmentFieldName: 'PLACA',
    },

    '3.04.P.37.F19': {
      // preuso de elmentos de accesorio de izaje
      type: 'pre-uso',
      equipmentFieldName: 'PLACA',
    },
  };

  getConfig(templateCode: string): FrequencyConfig {
    const config = this.templateConfigs[templateCode];

    if (!config) {
      // Configuración por defecto para templates no mapeados
      return {
        type: 'pre-uso',
        equipmentFieldName: 'TAG',
      };
    }

    return config;
  }

  getAllConfigs(): Record<string, FrequencyConfig> {
    return this.templateConfigs;
  }

  isPreUsoContador(templateCode: string): boolean {
    const config = this.getConfig(templateCode);
    return config.type === 'pre-uso-contador';
  }

  requiresTracking(templateCode: string): boolean {
    const config = this.getConfig(templateCode);
    return config.type !== 'pre-uso'; // Todos excepto pre-uso simple
  }

  getEquipmentFieldName(templateCode: string): string {
    return this.getConfig(templateCode).equipmentFieldName;
  }

  canOpenDirectly(templateCode: string): boolean {
    const config = this.getConfig(templateCode);
    return config.canOpenDirectly !== false; // Por defecto true, excepto para frecuente
  }

  isFrecuenteForm(templateCode: string): boolean {
    const config = this.getConfig(templateCode);
    return config.type === 'frecuente';
  }

  getPreUsoFormCode(frecuenteFormCode: string): string | null {
    // Buscar qué pre-uso está linked a este frecuente
    for (const [code, config] of Object.entries(this.templateConfigs)) {
      if (config.linkedFormCode === frecuenteFormCode) {
        return code;
      }
    }
    return null;
  }
}
