/**
 * Machine Learning Adaptive Timing Advisor
 * Derived from Capstone Section 2.4.8 (Personalized Reminder Timing)
 *
 * Integrates:
 * 1. EWMA: Dynamic user latency & preparation drift
 * 2. KNN: Channel modality selection (voice call vs notification)
 * 3. Random Forest: Multi-tree ensemble for adherence classification & optimal offset regression
 *
 * Guaranteed fail-safe: All predictions are clamped to [-30, +15] minutes
 * and fallback gracefully to deterministic scheduling on cold-start or error.
 */

import {localSettingsStore} from '../../storage/localSettingsStore';
import {
  extractStudentFeatures,
  featuresToVector,
  getEwmaLatency,
  getInteractionHistory,
} from './featureExtractor';
import {classifyKnn} from './knn';
import {
  evaluateForestClassification,
  evaluateForestRegression,
} from './randomForest';
import type {
  AdaptiveScheduleRecommendation,
  KnnPoint,
  RandomForestModel,
} from './types';

export const MIN_HISTORY_SAMPLES_FOR_ML = 5;
export const MIN_LEAD_OFFSET_MINUTES = -30;
export const MAX_LEAD_OFFSET_MINUTES = 15;
export const SETTING_KEY_ADAPTIVE_TIMING = 'adaptive_timing_enabled';

// ========================================================
// Calibrated Random Forest Models for Student Reminder Timing
// Feature indices:
// 0: normalizedHour (0..1)
// 1: normalizedDay (0..1)
// 2: normalizedLoad (0..1)
// 3: isPeakStudyHour (0 or 1)
// 4: priorityScore (0.33, 0.66, 1.0)
// 5: snoozeTendencyScore (0.0..1.0)
// ========================================================

/**
 * 5-tree regression forest estimating adaptive timing offset in minutes.
 */
export const ADAPTIVE_OFFSET_REGRESSION_FOREST: RandomForestModel = {
  treePoolSize: 5,
  featureDimension: 6,
  trees: [
    // Tree 1: Load & Priority Focus
    {
      id: 'reg-tree-1',
      root: {
        isLeaf: false,
        featureIndex: 2, // normalizedLoad
        threshold: 0.3,
        left: {
          isLeaf: false,
          featureIndex: 4, // priority
          threshold: 0.5,
          left: {isLeaf: true, prediction: 0},
          right: {isLeaf: true, prediction: -5},
        },
        right: {
          isLeaf: false,
          featureIndex: 4, // priority
          threshold: 0.8,
          left: {isLeaf: true, prediction: -10},
          right: {isLeaf: true, prediction: -15},
        },
      },
    },
    // Tree 2: Peak Study Hour & Snooze Tendency Focus
    {
      id: 'reg-tree-2',
      root: {
        isLeaf: false,
        featureIndex: 3, // isPeakStudyHour
        threshold: 0.5,
        left: {
          isLeaf: false,
          featureIndex: 5, // snoozeTendency
          threshold: 0.6,
          left: {isLeaf: true, prediction: -10},
          right: {isLeaf: true, prediction: -20},
        },
        right: {
          isLeaf: false,
          featureIndex: 5, // snoozeTendency
          threshold: 0.3,
          left: {isLeaf: true, prediction: 0},
          right: {isLeaf: true, prediction: -5},
        },
      },
    },
    // Tree 3: Time of Day & Morning Grogginess Focus
    {
      id: 'reg-tree-3',
      root: {
        isLeaf: false,
        featureIndex: 0, // normalizedHour
        threshold: 0.4, // morning < ~9:30 AM
        left: {
          isLeaf: false,
          featureIndex: 5, // snoozeTendency
          threshold: 0.5,
          left: {isLeaf: true, prediction: -5},
          right: {isLeaf: true, prediction: -15},
        },
        right: {
          isLeaf: false,
          featureIndex: 2, // normalizedLoad
          threshold: 0.5,
          left: {isLeaf: true, prediction: 0},
          right: {isLeaf: true, prediction: -10},
        },
      },
    },
    // Tree 4: High Priority Risk Mitigation
    {
      id: 'reg-tree-4',
      root: {
        isLeaf: false,
        featureIndex: 4, // priorityScore
        threshold: 0.8, // High priority
        left: {
          isLeaf: false,
          featureIndex: 5,
          threshold: 0.2,
          left: {isLeaf: true, prediction: 0},
          right: {isLeaf: true, prediction: -5},
        },
        right: {
          isLeaf: false,
          featureIndex: 5,
          threshold: 0.5,
          left: {isLeaf: true, prediction: -10},
          right: {isLeaf: true, prediction: -20},
        },
      },
    },
    // Tree 5: Cumulative Workload & Alertness Balance
    {
      id: 'reg-tree-5',
      root: {
        isLeaf: false,
        featureIndex: 2, // normalizedLoad
        threshold: 0.6,
        left: {
          isLeaf: false,
          featureIndex: 3, // isPeakStudyHour
          threshold: 0.5,
          left: {isLeaf: true, prediction: -5},
          right: {isLeaf: true, prediction: 0},
        },
        right: {isLeaf: true, prediction: -15},
      },
    },
  ],
};

/**
 * 5-tree classification forest predicting adherence category:
 * 'on_time' | 'likely_snooze' | 'risk_miss'
 */
export const ADHERENCE_CLASSIFICATION_FOREST: RandomForestModel = {
  treePoolSize: 5,
  featureDimension: 6,
  trees: [
    // Tree 1: Snooze Tendency Partition
    {
      id: 'clf-tree-1',
      root: {
        isLeaf: false,
        featureIndex: 5, // snoozeTendency
        threshold: 0.4,
        left: {isLeaf: true, prediction: 'on_time'},
        right: {
          isLeaf: false,
          featureIndex: 5,
          threshold: 0.8,
          left: {isLeaf: true, prediction: 'likely_snooze'},
          right: {isLeaf: true, prediction: 'risk_miss'},
        },
      },
    },
    // Tree 2: Load vs Peak Hour
    {
      id: 'clf-tree-2',
      root: {
        isLeaf: false,
        featureIndex: 3, // isPeakStudyHour
        threshold: 0.5,
        left: {
          isLeaf: false,
          featureIndex: 2, // load
          threshold: 0.5,
          left: {isLeaf: true, prediction: 'likely_snooze'},
          right: {isLeaf: true, prediction: 'risk_miss'},
        },
        right: {
          isLeaf: false,
          featureIndex: 2, // load
          threshold: 0.7,
          left: {isLeaf: true, prediction: 'on_time'},
          right: {isLeaf: true, prediction: 'likely_snooze'},
        },
      },
    },
    // Tree 3: Priority & Load Interaction
    {
      id: 'clf-tree-3',
      root: {
        isLeaf: false,
        featureIndex: 4, // priority
        threshold: 0.7,
        left: {
          isLeaf: false,
          featureIndex: 5,
          threshold: 0.6,
          left: {isLeaf: true, prediction: 'likely_snooze'},
          right: {isLeaf: true, prediction: 'risk_miss'},
        },
        right: {isLeaf: true, prediction: 'on_time'},
      },
    },
    // Tree 4: Morning vs Evening Adherence
    {
      id: 'clf-tree-4',
      root: {
        isLeaf: false,
        featureIndex: 0, // hour
        threshold: 0.35, // early morning
        left: {
          isLeaf: false,
          featureIndex: 5,
          threshold: 0.4,
          left: {isLeaf: true, prediction: 'on_time'},
          right: {isLeaf: true, prediction: 'likely_snooze'},
        },
        right: {isLeaf: true, prediction: 'on_time'},
      },
    },
    // Tree 5: Workload Saturation Check
    {
      id: 'clf-tree-5',
      root: {
        isLeaf: false,
        featureIndex: 2, // load
        threshold: 0.8,
        left: {isLeaf: true, prediction: 'on_time'},
        right: {isLeaf: true, prediction: 'risk_miss'},
      },
    },
  ],
};

/**
 * Returns whether adaptive ML timing is active for the user.
 */
export const isAdaptiveTimingEnabled = (userId: string): boolean => {
  const setting = localSettingsStore.get(
    userId,
    SETTING_KEY_ADAPTIVE_TIMING,
    'true',
  );
  return setting !== 'false';
};

/**
 * Converts user history into KNN reference points for channel selection.
 */
const buildKnnDatasetFromHistory = (
  history: ReturnType<typeof getInteractionHistory>,
): KnnPoint[] => {
  const points: KnnPoint[] = [];

  for (const item of history) {
    if (!item.features || item.features.length !== 6) continue;

    // High salience required if student snoozed, missed, or had high latency
    let label = 'notification';
    if (
      item.outcome === 'missed' ||
      item.outcome === 'auto_snoozed' ||
      item.outcome === 'snoozed' ||
      item.latencySeconds > 90
    ) {
      label = 'call';
    }

    points.push({
      features: item.features,
      label,
    });
  }

  return points;
};

/**
 * Computes an adaptive scheduling recommendation for a student reminder.
 */
export const getAdaptiveScheduleRecommendation = (
  userId: string,
  context: {
    scheduledAtIso: string;
    taskTitle?: string;
    priority?: 'High' | 'Medium' | 'Low';
    category?: string;
  },
): AdaptiveScheduleRecommendation => {
  const originalTriggerAt = context.scheduledAtIso;

  try {
    const scheduledDate = new Date(originalTriggerAt);
    if (isNaN(scheduledDate.getTime())) {
      return createRuleFallback(
        originalTriggerAt,
        0,
        'Invalid ISO timestamp provided; retaining scheduled time',
      );
    }

    // 1. Check if user enabled adaptive timing
    if (!isAdaptiveTimingEnabled(userId)) {
      return createRuleFallback(
        originalTriggerAt,
        0,
        'Adaptive timing disabled by user preference',
      );
    }

    // 2. Cold-start check: need at least 5 interaction samples for reliable ML adaptation
    const history = getInteractionHistory(userId);
    if (history.length < MIN_HISTORY_SAMPLES_FOR_ML) {
      return createRuleFallback(
        originalTriggerAt,
        0,
        `Cold start: collecting student interaction baseline (${history.length}/${MIN_HISTORY_SAMPLES_FOR_ML} samples)`,
      );
    }

    // 3. Extract student context feature vector
    const year = scheduledDate.getFullYear();
    const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
    const day = String(scheduledDate.getDate()).padStart(2, '0');
    const targetDate = `${year}-${month}-${day}`;
    const hours = String(scheduledDate.getHours()).padStart(2, '0');
    const mins = String(scheduledDate.getMinutes()).padStart(2, '0');
    const targetTime = `${hours}:${mins}`;

    const features = extractStudentFeatures(userId, {
      targetDate,
      targetTime,
      priority: context.priority,
    });
    const featureVector = featuresToVector(features);

    // 4. Random Forest: Predict adherence class & offset regression
    const classificationResult = evaluateForestClassification(
      ADHERENCE_CLASSIFICATION_FOREST,
      featureVector,
    );
    const predictedAdherence =
      classificationResult.predictedClass as AdaptiveScheduleRecommendation['predictedAdherence'];

    const regressionResult = evaluateForestRegression(
      ADAPTIVE_OFFSET_REGRESSION_FOREST,
      featureVector,
    );
    let baseOffsetMinutes = Math.round(regressionResult.predictedValue);

    // 5. EWMA Latency Drift Adjustment:
    // If student has high smoothed response latency (e.g. >90s), advance lead time by an extra buffer
    const ewmaLatency = getEwmaLatency(userId);
    let latencyBufferMinutes = 0;
    if (ewmaLatency > 90) {
      latencyBufferMinutes = Math.min(10, Math.floor((ewmaLatency - 60) / 30));
      baseOffsetMinutes -= latencyBufferMinutes;
    }

    // 6. Clamp total offset strictly between [-30, +15] minutes
    const clampedOffset = Math.max(
      MIN_LEAD_OFFSET_MINUTES,
      Math.min(MAX_LEAD_OFFSET_MINUTES, baseOffsetMinutes),
    );

    // 7. KNN: Classify channel modality based on k nearest historical situations
    const knnPoints = buildKnnDatasetFromHistory(history);
    let channelRecommendation: 'call' | 'notification' = 'call';
    if (knnPoints.length >= 3) {
      const k = Math.min(5, knnPoints.length);
      const knnResult = classifyKnn(featureVector, knnPoints, k);
      channelRecommendation =
        knnResult.predictedLabel === 'notification' ? 'notification' : 'call';
    }

    // 8. Compute adjusted trigger timestamp
    const originalMs = scheduledDate.getTime();
    const recommendedMs = originalMs + clampedOffset * 60 * 1000;
    // Safety: recommended trigger time must be at least 5s in the future
    const safeMs = Math.max(recommendedMs, Date.now() + 5000);
    const recommendedTriggerAt = new Date(safeMs).toISOString();

    const confidence = Number(
      (
        classificationResult.confidence * 0.5 +
        (1 - Math.min(1, regressionResult.uncertainty / 10)) * 0.5
      ).toFixed(2),
    );

    const reason = `ML adaptation: ${
      clampedOffset >= 0 ? '+' : ''
    }${clampedOffset}m shift (predicted: ${predictedAdherence}, EWMA latency: ${ewmaLatency.toFixed(
      0,
    )}s, channel: ${channelRecommendation})`;

    return {
      originalTriggerAt,
      recommendedTriggerAt,
      offsetMinutes: clampedOffset,
      channelRecommendation,
      predictedAdherence,
      confidence,
      source: 'ml_ensemble',
      reason,
    };
  } catch (error) {
    console.warn(
      '[TimingAdvisor] Error generating ML recommendation, falling back to original:',
      error,
    );
    return createRuleFallback(
      originalTriggerAt,
      0,
      'Internal fallback: baseline schedule preserved',
    );
  }
};

/**
 * Convenience helper returning the final adaptive trigger timestamp string.
 */
export const computeAdaptiveTriggerAt = (
  userId: string,
  scheduledAtIso: string,
  priority?: 'High' | 'Medium' | 'Low',
): string => {
  const rec = getAdaptiveScheduleRecommendation(userId, {
    scheduledAtIso,
    priority,
  });
  return rec.recommendedTriggerAt;
};

const createRuleFallback = (
  originalTriggerAt: string,
  offsetMinutes: number,
  reason: string,
): AdaptiveScheduleRecommendation => ({
  originalTriggerAt,
  recommendedTriggerAt: originalTriggerAt,
  offsetMinutes,
  channelRecommendation: 'call',
  predictedAdherence: 'on_time',
  confidence: 0.5,
  source: 'rule_fallback',
  reason,
});
