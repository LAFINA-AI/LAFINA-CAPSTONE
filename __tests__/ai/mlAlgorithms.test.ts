import {
  clampAlpha,
  stepEwma,
  EwmaTracker,
  DEFAULT_EWMA_ALPHA,
} from '../../src/ai/ml/ewma';
import {euclideanDistance, KnnClassifier} from '../../src/ai/ml/knn';
import {evaluateTree, RandomForestEnsemble} from '../../src/ai/ml/randomForest';
import type {DecisionTree, KnnPoint} from '../../src/ai/ml/types';

describe('Phase ML-1: Section 2.4.8 Machine Learning Algorithms', () => {
  describe('1. Exponentially Weighted Moving Average (EWMA)', () => {
    test('clampAlpha confines alpha to (0, 1]', () => {
      expect(clampAlpha(0.25)).toBe(0.25);
      expect(clampAlpha(-0.5)).toBe(0.01);
      expect(clampAlpha(0)).toBe(0.01);
      expect(clampAlpha(1.5)).toBe(1.0);
      expect(clampAlpha(NaN)).toBe(0.01);
    });

    test('stepEwma correctly computes S_t = alpha * Y_t + (1 - alpha) * S_{t-1}', () => {
      const alpha = 0.2;
      const prevSmoothed = 10.0;
      const observation = 20.0;
      // S_t = 0.2 * 20 + 0.8 * 10 = 4.0 + 8.0 = 12.0
      const next = stepEwma(prevSmoothed, observation, alpha);
      expect(next).toBeCloseTo(12.0, 5);
    });

    test('EwmaTracker initializes and tracks evolving behavioral sequence', () => {
      const tracker = new EwmaTracker({alpha: 0.5, initialValue: 0});
      expect(tracker.getValue()).toBe(0);
      expect(tracker.getSampleCount()).toBe(0);

      // First observation initializes baseline value if sampleCount was 0
      tracker.observe(10);
      expect(tracker.getValue()).toBe(10);
      expect(tracker.getSampleCount()).toBe(1);

      // Second observation: 0.5 * 20 + 0.5 * 10 = 15
      tracker.observe(20);
      expect(tracker.getValue()).toBe(15);

      // Third observation: 0.5 * 30 + 0.5 * 15 = 22.5
      tracker.observe(30);
      expect(tracker.getValue()).toBe(22.5);
      expect(tracker.getSampleCount()).toBe(3);
    });

    test('EwmaTracker converges to steady state under repeated observations', () => {
      const tracker = new EwmaTracker({
        alpha: DEFAULT_EWMA_ALPHA,
        initialValue: 10,
      });
      // Ingest constant value 50 for 25 steps
      for (let i = 0; i < 25; i++) {
        tracker.observe(50);
      }
      expect(tracker.getValue()).toBeCloseTo(50, 1);
    });

    test('EwmaTracker exports and restores state seamlessly', () => {
      const original = new EwmaTracker({alpha: 0.3, initialValue: 5});
      original.observe(15);
      original.observe(25);

      const state = original.getState();
      const restored = EwmaTracker.fromState(
        {alpha: 0.3, initialValue: 5},
        state,
      );

      expect(restored.getValue()).toBe(original.getValue());
      expect(restored.getSampleCount()).toBe(original.getSampleCount());
    });
  });

  describe('2. K-Nearest Neighbors (KNN)', () => {
    test('euclideanDistance calculates scalar distance d(x, y) = sqrt(sum (x_i - y_i)^2)', () => {
      const x = [0, 0, 0];
      const y = [3, 4, 0];
      // sqrt(3^2 + 4^2 + 0^2) = sqrt(9 + 16) = 5
      expect(euclideanDistance(x, y)).toBe(5);
    });

    test('euclideanDistance respects feature weighting when provided', () => {
      const x = [1, 2];
      const y = [4, 6];
      // unweighted: sqrt((3)^2 + (4)^2) = 5
      // weights: [1, 0] -> sqrt(1 * 9 + 0 * 16) = 3
      expect(euclideanDistance(x, y, [1, 0])).toBe(3);
    });

    test('euclideanDistance throws on vector dimension mismatch', () => {
      expect(() => euclideanDistance([1, 2], [1, 2, 3])).toThrow(
        'Dimension mismatch',
      );
    });

    test('KnnClassifier classifies query using argmax majority vote across k closest neighbors', () => {
      const trainingData: KnnPoint[] = [
        {features: [0.1, 0.1], label: 'voice_call'},
        {features: [0.15, 0.2], label: 'voice_call'},
        {features: [0.2, 0.1], label: 'voice_call'},
        {features: [0.8, 0.9], label: 'silent_push'},
        {features: [0.85, 0.85], label: 'silent_push'},
      ];

      const classifier = new KnnClassifier(trainingData);
      expect(classifier.size).toBe(5);

      // Query near the voice_call cluster
      const resultCall = classifier.classify([0.12, 0.14], 3);
      expect(resultCall.predictedLabel).toBe('voice_call');
      expect(resultCall.k).toBe(3);
      expect(resultCall.confidence).toBe(1.0); // 3 of 3 votes

      // Query near the silent_push cluster
      const resultSilent = classifier.classify([0.82, 0.88], 3);
      expect(resultSilent.predictedLabel).toBe('silent_push');
      expect(resultSilent.confidence).toBeGreaterThanOrEqual(2 / 3);
    });

    test('KnnClassifier gracefully handles empty training set with fallback label', () => {
      const classifier = new KnnClassifier([]);
      const result = classifier.classify([0.5, 0.5], 3, 'fallback_mode');
      expect(result.predictedLabel).toBe('fallback_mode');
      expect(result.confidence).toBe(0);
      expect(result.k).toBe(0);
    });

    test('KnnClassifier tie-breaking resolves in favor of closest neighbor distance', () => {
      const trainingData: KnnPoint[] = [
        {features: [1.0], label: 'class_a'}, // dist: |1.2 - 1.0| = 0.2 (closer)
        {features: [1.5], label: 'class_b'}, // dist: |1.2 - 1.5| = 0.3 (further)
      ];
      const classifier = new KnnClassifier(trainingData);
      const result = classifier.classify([1.2], 2);
      // Votes are 1 each, class_a is closer
      expect(result.predictedLabel).toBe('class_a');
    });
  });

  describe('3. Random Forest (Ensemble Learning)', () => {
    // Construct test trees:
    // Tree 1: if feature[0] <= 5 -> class 'dismiss', else -> class 'attend'
    const tree1: DecisionTree = {
      id: 'tree-1',
      root: {
        featureIndex: 0,
        threshold: 5,
        isLeaf: false,
        left: {isLeaf: true, prediction: 'dismiss'},
        right: {isLeaf: true, prediction: 'attend'},
      },
    };

    // Tree 2: if feature[1] <= 2 -> class 'dismiss', else -> class 'attend'
    const tree2: DecisionTree = {
      id: 'tree-2',
      root: {
        featureIndex: 1,
        threshold: 2,
        isLeaf: false,
        left: {isLeaf: true, prediction: 'dismiss'},
        right: {isLeaf: true, prediction: 'attend'},
      },
    };

    // Tree 3: unconditional leaf predicting 'attend'
    const tree3: DecisionTree = {
      id: 'tree-3',
      root: {
        isLeaf: true,
        prediction: 'attend',
      },
    };

    test('evaluateTree navigates decision nodes to target leaf prediction', () => {
      expect(evaluateTree(tree1.root, [3, 0])).toBe('dismiss');
      expect(evaluateTree(tree1.root, [7, 0])).toBe('attend');
    });

    test('Categorical Mode: aggregates B trees via majority vote function', () => {
      const forest = new RandomForestEnsemble({
        trees: [tree1, tree2, tree3],
      });
      expect(forest.treeCount).toBe(3);

      // Features: [8, 5] -> tree1: 'attend', tree2: 'attend', tree3: 'attend' -> 3 attend
      const result1 = forest.classify([8, 5]);
      expect(result1.predictedClass).toBe('attend');
      expect(result1.confidence).toBe(1.0);
      expect(result1.voteCounts.attend).toBe(3);

      // Features: [2, 1] -> tree1: 'dismiss', tree2: 'dismiss', tree3: 'attend' -> 2 dismiss
      const result2 = forest.classify([2, 1]);
      expect(result2.predictedClass).toBe('dismiss');
      expect(result2.confidence).toBeCloseTo(2 / 3, 2);
      expect(result2.voteCounts.dismiss).toBe(2);
    });

    test('Continuous Mode: computes unweighted average of individual tree outputs: 1/B * sum(T_b(x))', () => {
      // Regressor trees predicting optimal snooze buffer in minutes
      const regTree1: DecisionTree = {
        id: 'reg-1',
        root: {
          featureIndex: 0,
          threshold: 10,
          isLeaf: false,
          left: {isLeaf: true, prediction: 10},
          right: {isLeaf: true, prediction: 20},
        },
      };

      const regTree2: DecisionTree = {
        id: 'reg-2',
        root: {
          isLeaf: true,
          prediction: 15,
        },
      };

      const regTree3: DecisionTree = {
        id: 'reg-3',
        root: {
          featureIndex: 0,
          threshold: 5,
          isLeaf: false,
          left: {isLeaf: true, prediction: 5},
          right: {isLeaf: true, prediction: 25},
        },
      };

      const regForest = new RandomForestEnsemble({
        trees: [regTree1, regTree2, regTree3],
      });

      // Feature [12]:
      // regTree1: 20 (12 > 10)
      // regTree2: 15
      // regTree3: 25 (12 > 5)
      // Mean = (20 + 15 + 25) / 3 = 60 / 3 = 20
      const regResult = regForest.regress([12]);
      expect(regResult.predictedValue).toBe(20);
      expect(regResult.treePredictions).toEqual([20, 15, 25]);
      expect(regResult.uncertainty).toBeGreaterThan(0);
    });

    test('RandomForestEnsemble handles empty forest safely with fallbacks', () => {
      const emptyForest = new RandomForestEnsemble();
      expect(emptyForest.treeCount).toBe(0);

      const classResult = emptyForest.classify([1, 2, 3], 'safe_fallback');
      expect(classResult.predictedClass).toBe('safe_fallback');
      expect(classResult.totalTrees).toBe(0);

      const regResult = emptyForest.regress([1, 2, 3], 15.0);
      expect(regResult.predictedValue).toBe(15.0);
    });

    test('RandomForestEnsemble serializes to JSON structure', () => {
      const forest = new RandomForestEnsemble({
        trees: [tree1, tree2],
        featureDimension: 2,
      });

      const json = forest.toJSON();
      expect(json.treePoolSize).toBe(2);
      expect(json.trees.length).toBe(2);
      expect(json.featureDimension).toBe(2);
    });
  });
});
