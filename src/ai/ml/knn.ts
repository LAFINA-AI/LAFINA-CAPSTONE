/**
 * K-Nearest Neighbors (KNN) Classifier
 * Section 2.4.8:
 * Proximity: d(x, y) = sqrt(sum_{i=1}^n (x_i - y_i)^2)
 * Voting:    \hat{y} = argmax_c sum_{i \in N_k(x)} I(y_i = c)
 *
 * Provides non-parametric behavioral clustering and context routing
 * to identify time-of-day contexts that are behaviorally similar.
 */

import type {KnnPoint, KnnNeighbor, KnnClassificationResult} from './types';

/**
 * Computes standard Euclidean distance between two n-dimensional feature vectors.
 * d(x, y) = sqrt(sum_{i=1}^n (x_i - y_i)^2)
 */
export function euclideanDistance(
  x: number[],
  y: number[],
  weights?: number[],
): number {
  if (x.length !== y.length) {
    throw new Error(
      `Dimension mismatch: vector x (${x.length}) != vector y (${y.length})`,
    );
  }
  let sumSq = 0;
  for (let i = 0; i < x.length; i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    const weight = weights && weights[i] !== undefined ? weights[i] : 1.0;
    sumSq += weight * diff * diff;
  }
  return Math.sqrt(sumSq);
}

export class KnnClassifier {
  private trainingSet: KnnPoint[] = [];
  private weights?: number[];

  constructor(points: KnnPoint[] = [], weights?: number[]) {
    this.trainingSet = [...points];
    this.weights = weights;
  }

  /** Total training samples currently indexed */
  get size(): number {
    return this.trainingSet.length;
  }

  /**
   * Adds a single historical behavioral observation into the training dataset.
   */
  addPoint(point: KnnPoint): void {
    this.trainingSet.push(point);
  }

  /**
   * Replaces or initializes the entire training dataset.
   */
  setPoints(points: KnnPoint[]): void {
    this.trainingSet = [...points];
  }

  /**
   * Finds the k-nearest neighbors to incoming query context vector x.
   *
   * @param queryFeatures Target context query vector x
   * @param k Number of neighbors to consider (default: 3)
   */
  findNearestNeighbors(queryFeatures: number[], k = 3): KnnNeighbor[] {
    if (this.trainingSet.length === 0) return [];

    const effectiveK = Math.min(Math.max(1, k), this.trainingSet.length);

    const neighborsWithDist: KnnNeighbor[] = this.trainingSet.map(point => ({
      point,
      distance: euclideanDistance(queryFeatures, point.features, this.weights),
    }));

    // Sort ascending by Euclidean distance
    neighborsWithDist.sort((a, b) => a.distance - b.distance);

    return neighborsWithDist.slice(0, effectiveK);
  }

  /**
   * Classifies incoming target context query x using majority intent voting:
   * \hat{y} = argmax_c sum_{i \in N_k(x)} I(y_i = c)
   *
   * @param queryFeatures Target context query vector x
   * @param k Number of closest neighbors N_k(x) to evaluate
   * @param fallbackLabel Default label when training data is empty
   */
  classify(
    queryFeatures: number[],
    k = 3,
    fallbackLabel = 'default',
  ): KnnClassificationResult {
    const neighbors = this.findNearestNeighbors(queryFeatures, k);

    if (neighbors.length === 0) {
      return {
        predictedLabel: fallbackLabel,
        votes: {},
        k: 0,
        neighbors: [],
        confidence: 0,
      };
    }

    // Indicator-supported argmax vote across selected closest neighbors
    const votes: Record<string, number> = {};
    for (const neighbor of neighbors) {
      const label = neighbor.point.label;
      votes[label] = (votes[label] ?? 0) + 1;
    }

    let topLabel = fallbackLabel;
    let maxVotes = -1;

    for (const [label, count] of Object.entries(votes)) {
      if (count > maxVotes) {
        maxVotes = count;
        topLabel = label;
      } else if (count === maxVotes) {
        // Tie-breaker: choose label of the closer neighbor
        const topNeighborDist =
          neighbors.find(n => n.point.label === topLabel)?.distance ?? Infinity;
        const candidateDist =
          neighbors.find(n => n.point.label === label)?.distance ?? Infinity;
        if (candidateDist < topNeighborDist) {
          topLabel = label;
        }
      }
    }

    const confidence = maxVotes / neighbors.length;

    return {
      predictedLabel: topLabel,
      votes,
      k: neighbors.length,
      neighbors,
      confidence,
    };
  }
}

/**
 * Functional wrapper to classify features using KNN dataset.
 */
export function classifyKnn(
  queryFeatures: number[],
  points: KnnPoint[],
  k = 3,
  fallbackLabel = 'default',
  weights?: number[],
): KnnClassificationResult {
  const classifier = new KnnClassifier(points, weights);
  return classifier.classify(queryFeatures, k, fallbackLabel);
}
