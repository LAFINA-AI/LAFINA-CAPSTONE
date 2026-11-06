/**
 * Machine Learning Component Type Definitions
 * Derived from Capstone Section 2.4.8:
 * - Exponentially Weighted Moving Average (EWMA)
 * - K-Nearest Neighbors (KNN)
 * - Random Forest (Ensemble Learning)
 */

// ==========================================
// 1. EWMA Types
// ==========================================

export interface EwmaConfig {
  /** Constant smoothing factor between 0 and 1 (alpha) */
  alpha: number;
  /** Initial baseline value */
  initialValue: number;
}

export interface EwmaState {
  value: number;
  sampleCount: number;
  lastUpdatedAt: string;
}

// ==========================================
// 2. KNN Types
// ==========================================

export interface KnnPoint {
  id?: string;
  /** Normalized continuous/discrete feature vector */
  features: number[];
  /** Target classification label / category */
  label: string;
  /** Optional metadata / context payload */
  metadata?: Record<string, unknown>;
}

export interface KnnNeighbor {
  point: KnnPoint;
  distance: number;
}

export interface KnnClassificationResult {
  /** Predicted category label via argmax majority vote */
  predictedLabel: string;
  /** Vote tally distribution across classes */
  votes: Record<string, number>;
  /** Total count of voting neighbors (k) */
  k: number;
  /** The k closest neighbor points with scalar distances */
  neighbors: KnnNeighbor[];
  /** Confidence score between 0 and 1 */
  confidence: number;
}

// ==========================================
// 3. Random Forest Types
// ==========================================

export interface DecisionTreeNode {
  /** Feature index to evaluate in feature vector x */
  featureIndex?: number;
  /** Split threshold: if x[featureIndex] <= threshold -> left, else -> right */
  threshold?: number;
  /** Left child subtree */
  left?: DecisionTreeNode;
  /** Right child subtree */
  right?: DecisionTreeNode;
  /** Leaf prediction (categorical string or continuous number) */
  prediction?: string | number;
  /** Is this a terminal leaf node */
  isLeaf: boolean;
}

export interface DecisionTree {
  id: string;
  root: DecisionTreeNode;
}

export interface RandomForestModel {
  /** Total pool size of individual trees (B) */
  treePoolSize: number;
  /** Individual unpruned decision trees */
  trees: DecisionTree[];
  /** Feature dimension (n) */
  featureDimension: number;
}

export interface ForestClassificationResult {
  /** Derived category via argmax vote across all B trees */
  predictedClass: string;
  /** Class vote breakdown across trees */
  voteCounts: Record<string, number>;
  /** Total evaluated trees (B) */
  totalTrees: number;
  /** Agreement ratio / confidence (votes / B) */
  confidence: number;
}

export interface ForestRegressionResult {
  /** Unweighted average estimation: 1/B * sum(T_b(x)) */
  predictedValue: number;
  /** Individual tree predictions */
  treePredictions: number[];
  /** Standard deviation / variance of tree predictions (uncertainty) */
  uncertainty: number;
}

// ==========================================
// 4. Student Context & Adaptive Scheduling Types
// ==========================================

export interface StudentFeatures {
  hourOfDay: number; // 0..23
  dayOfWeek: number; // 0..6 (0 = Sunday)
  normalizedHour: number; // hour / 23
  normalizedDay: number; // day / 6
  academicLoad: number; // count of uncompleted tasks on date
  normalizedLoad: number; // min(academicLoad, 10) / 10
  isPeakStudyHour: number; // 1 if in user's study peak hours, 0 otherwise
  priorityScore: number; // Low = 0.33, Medium = 0.66, High = 1.0
  snoozeTendencyScore: number; // 0 (immediate) to 1.0 (ignore)
  ewmaLatencySeconds: number; // current smoothed response latency
}

export type ReminderOutcomeType =
  | 'acknowledged'
  | 'snoozed'
  | 'missed'
  | 'auto_snoozed';

export interface ReminderInteractionRecord {
  reminderId: string;
  outcome: ReminderOutcomeType;
  latencySeconds: number;
  snoozeMinutes?: number;
  channel?: 'call' | 'notification' | 'manual';
  features?: number[];
  timestamp: string;
}

export interface AdaptiveScheduleRecommendation {
  originalTriggerAt: string;
  recommendedTriggerAt: string;
  offsetMinutes: number; // clamped to [-30, +15]
  channelRecommendation: 'call' | 'notification';
  predictedAdherence: 'on_time' | 'likely_snooze' | 'risk_miss';
  confidence: number;
  source: 'ml_ensemble' | 'rule_fallback';
  reason: string;
}
