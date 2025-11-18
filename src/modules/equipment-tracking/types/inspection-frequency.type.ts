
export type InspectionFrequencyType = 
  |  'frecuente'        // Inspección frecuente (sin contador)
  | 'pre-uso-contador'  // Tecles (6 usos → frecuente)
  | 'pre-uso'           // Pre-uso simple (sin contador)
  | 'diaria'
  | 'semanal' 
  | 'quincenal'
  | 'mensual'
  | 'anual'
  | 'periodica';        // Periódica genérica

export interface FrequencyConfig {
  type: InspectionFrequencyType;
  usageInterval?: number;    // Para pre-uso-contador (ej: 6)
  linkedFormCode?: string;   // Formulario linked (ej: frecuente)
  intervalDays?: number;     // Para periódicos (ej: 30, 7, 365)
  equipmentFieldName: string; // Campo del TAG en el form (ej: "TAG", "PLACA")
  requiresTagVerification?: boolean; // Si se debe verificar el TAG antes de abrir
  canOpenDirectly?: boolean; // Si se puede abrir el form directamente sin verificaciones
}

export interface RegisterInspectionParams {
  inspectionId: string;
  templateCode: string;
  verificationData: Record<string, any>;
  inspectorName?: string;
}

export interface RegisterInspectionResult {
  success: boolean;
  tracking: any;
  isNewEquipment: boolean;
  needsFrecuenteInspection: boolean;
  message: string;
}