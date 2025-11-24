export interface MLRecommendation {
  current_score: number;
  predicted_optimal_score: number;
  current_level: string;
  target_level: string;
  confidence: number;
  improvement_gap: number;
  priority: 'Alta' | 'Media' | 'Baja';
  recommended_actions: string[];
  analysis: string;
}

export interface MLTrainingMetrics {
  accuracy: number;
  training_samples: number;
  features: number;
  timestamp: string;
}

export interface MLHealthStatus {
  status: string;
  trained: boolean;
  timestamp: string;
}

export interface InstanceRecommendations {
  instanceId: string;
  overallCompliance: number;
  recommendations: Array<{
    sectionId: string;
    sectionTitle: string;
    questionText: string;
    currentScore: number;
    recommendation: MLRecommendation;
  }>;
  summary: {
    totalQuestions: number;
    highPriority: number;
    mediumPriority: number;
    lowPriority: number;
    averageImprovementGap: number;
  };
}