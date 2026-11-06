/**
 * Random Forest Ensemble Module
 * Section 2.4.8:
 * Categorical: \hat{Y} = argmax_c sum_{b=1}^B I(T_b(x) = c)
 * Continuous:  \hat{Y} = 1/B sum_{b=1}^B T_b(x)
 *
 * Provides robust ensemble predictions for behavioral adherence classification
 * (e.g. probability of ignoring an incoming voice prompt) and regression
 * (e.g. optimal rescheduling buffer latency).
 */

import type {
  DecisionTreeNode,
  DecisionTree,
  RandomForestModel,
  ForestClassificationResult,
  ForestRegressionResult,
} from './types';

/**
 * Evaluates a single decision tree T_b(x) against an incoming feature vector x.
 */
export function evaluateTree(
  node: DecisionTreeNode,
  features: number[],
): string | number {
  if (node.isLeaf || node.prediction !== undefined) {
    return node.prediction ?? 0;
  }

  const featureIdx = node.featureIndex ?? 0;
  const threshold = node.threshold ?? 0;
  const value = features[featureIdx] ?? 0;

  if (value <= threshold) {
    return node.left ? evaluateTree(node.left, features) : node.prediction ?? 0;
  } else {
    return node.right
      ? evaluateTree(node.right, features)
      : node.prediction ?? 0;
  }
}

export class RandomForestEnsemble {
  private model: RandomForestModel;

  constructor(model?: Partial<RandomForestModel>) {
    this.model = {
      treePoolSize: model?.treePoolSize ?? model?.trees?.length ?? 0,
      trees: model?.trees ?? [],
      featureDimension: model?.featureDimension ?? 0,
    };
  }

  /** Total pool size of trees in ensemble (B) */
  get treeCount(): number {
    return this.model.trees.length;
  }

  /**
   * Adds an individual decision tree T_b into the localized ensemble framework.
   */
  addTree(tree: DecisionTree): void {
    this.model.trees.push(tree);
    this.model.treePoolSize = this.model.trees.length;
  }

  /**
   * Sets or replaces the tree ensemble.
   */
  setTrees(trees: DecisionTree[]): void {
    this.model.trees = [...trees];
    this.model.treePoolSize = trees.length;
  }

  /**
   * Categorical Classification Mode:
   * \hat{Y} = argmax_c sum_{b=1}^B I(T_b(x) = c)
   *
   * Aggregates B independent trees via majority vote function.
   * Example: evaluating probability of a user ignoring an incoming call.
   */
  classify(
    features: number[],
    fallbackClass = 'unknown',
  ): ForestClassificationResult {
    const B = this.model.trees.length;
    if (B === 0) {
      return {
        predictedClass: fallbackClass,
        voteCounts: {},
        totalTrees: 0,
        confidence: 0,
      };
    }

    const voteCounts: Record<string, number> = {};
    for (const tree of this.model.trees) {
      const prediction = String(evaluateTree(tree.root, features));
      voteCounts[prediction] = (voteCounts[prediction] ?? 0) + 1;
    }

    let topClass = fallbackClass;
    let maxVotes = -1;

    for (const [cls, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count;
        topClass = cls;
      }
    }

    return {
      predictedClass: topClass,
      voteCounts,
      totalTrees: B,
      confidence: maxVotes / B,
    };
  }

  /**
   * Continuous Regression Mode:
   * \hat{Y} = 1/B sum_{b=1}^B T_b(x)
   *
   * Unweighted average of individual tree outputs.
   * Example: optimal buffer durations or response latencies.
   */
  regress(features: number[], fallbackValue = 0): ForestRegressionResult {
    const B = this.model.trees.length;
    if (B === 0) {
      return {
        predictedValue: fallbackValue,
        treePredictions: [],
        uncertainty: 0,
      };
    }

    const predictions: number[] = [];
    let sum = 0;

    for (const tree of this.model.trees) {
      const pred = Number(evaluateTree(tree.root, features));
      const validPred = isNaN(pred) ? fallbackValue : pred;
      predictions.push(validPred);
      sum += validPred;
    }

    const mean = sum / B;

    // Calculate variance / standard deviation as measure of uncertainty
    let varianceSum = 0;
    for (const pred of predictions) {
      varianceSum += (pred - mean) * (pred - mean);
    }
    const uncertainty = Math.sqrt(varianceSum / B);

    return {
      predictedValue: mean,
      treePredictions: predictions,
      uncertainty,
    };
  }

  /**
   * Exports full model serialization for local SQLite / snapshot storage.
   */
  toJSON(): RandomForestModel {
    return {
      treePoolSize: this.model.trees.length,
      trees: this.model.trees,
      featureDimension: this.model.featureDimension,
    };
  }
}

/**
 * Functional wrapper to classify features using a RandomForestModel.
 */
export function evaluateForestClassification(
  model: RandomForestModel,
  features: number[],
  fallbackClass = 'unknown',
): ForestClassificationResult {
  const ensemble = new RandomForestEnsemble(model);
  return ensemble.classify(features, fallbackClass);
}

/**
 * Functional wrapper to regress features using a RandomForestModel.
 */
export function evaluateForestRegression(
  model: RandomForestModel,
  features: number[],
  fallbackValue = 0,
): ForestRegressionResult {
  const ensemble = new RandomForestEnsemble(model);
  return ensemble.regress(features, fallbackValue);
}
