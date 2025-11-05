import * as tf from "@tensorflow/tfjs";
import { RingBufferDataset } from "./dataset";
import { INPUT_BASE_DIM, OUTPUT_DIM, NormalizationStats, makeSequenceInputVector, SEQ_LEN, makeInputVector } from "./types";
import { createDriverModel, applyInputNormalization } from "./model";

export interface TrainParams {
  epochs: number;
  batchSize: number;
  learningRate?: number;
}

export interface TrainProgress {
  epoch: number;
  trainLoss: number;
  valLoss?: number;
  batch?: number;
  batchesPerEpoch?: number;
  epochs?: number;
  percent?: number; // 0..1 overall progress
  phase?: "batch" | "epoch";
}

export interface TrainResult {
  model: tf.LayersModel;
  norm: NormalizationStats;
  history: TrainProgress[];
}

function computeMinMax(baseVectors: number[][]): NormalizationStats {
  // Compute per-feature stats on single-step feature vectors (broadcasted across time)
  const mins = new Array(INPUT_BASE_DIM).fill(Number.POSITIVE_INFINITY);
  const maxs = new Array(INPUT_BASE_DIM).fill(Number.NEGATIVE_INFINITY);
  for (const row of baseVectors) {
    for (let i = 0; i < INPUT_BASE_DIM; i++) {
      mins[i] = Math.min(mins[i], row[i]);
      maxs[i] = Math.max(maxs[i], row[i]);
    }
  }
  for (let i = 0; i < INPUT_BASE_DIM; i++) {
    if (maxs[i] - mins[i] < 1e-6) {
      maxs[i] = mins[i] + 1e-6;
    }
  }
  return { obsMin: mins, obsMax: maxs };
}

export async function trainOnDataset(
  ds: RingBufferDataset,
  params: TrainParams,
  onProgress?: (p: TrainProgress) => void
): Promise<TrainResult> {
  const data = ds.toArray();
  if (data.length < params.batchSize) {
    throw new Error("Dataset too small to train");
  }

  // Build temporal input by stacking the last SEQ_LEN observations for each sample
  const observations = data.map(s => s.obs);
  // Build 3D sequence input: [N, SEQ_LEN, INPUT_BASE_DIM]
  const X3: number[][][] = observations.map((_obs, i) => {
    const start = Math.max(0, i - SEQ_LEN + 1);
    const hist = observations.slice(start, i + 1);
    // Left-pad
    const padCount = SEQ_LEN - hist.length;
    const padObs = hist[0] ?? observations[0];
    const window = Array(padCount).fill(padObs).concat(hist);
    return window.map(o => makeInputVector(o));
  });
  const Y: number[][] = data.map(s => [s.act.steering, s.act.force]);

  // Compute normalization from base feature vectors
  const baseVectors = observations.map(o => makeInputVector(o));
  const norm = computeMinMax(baseVectors);

  const xTensor = tf.tensor3d(X3, [X3.length, SEQ_LEN, INPUT_BASE_DIM]);
  const yTensor = tf.tensor2d(Y, [Y.length, OUTPUT_DIM]);
  const xNorm = applyInputNormalization(xTensor, norm) as tf.Tensor3D;

  const model = createDriverModel();
  if (params.learningRate) {
    model.compile({ optimizer: tf.train.adam(params.learningRate), loss: "meanSquaredError" });
  }

  // Train/val split
  const n = X3.length;
  const valSplit = Math.min(0.2, Math.max(0.1, 64 / n));
  const history: TrainProgress[] = [];

  await model.fit(xNorm, yTensor, {
    epochs: params.epochs,
    batchSize: params.batchSize,
    shuffle: true,
    validationSplit: valSplit,
    callbacks: {
      onBatchEnd: async (batch: number, logs?: tf.Logs) => {
        const nTrain = Math.floor(n * (1 - valSplit));
        const batchesPerEpoch = Math.max(1, Math.ceil(nTrain / params.batchSize));
        const currentEpoch = (model.history?.epoch?.length ?? 0) + 1; // best-effort
        const completed = Math.min(params.epochs * batchesPerEpoch, (currentEpoch - 1) * batchesPerEpoch + (batch + 1));
        const percent = completed / (params.epochs * batchesPerEpoch);
        onProgress?.({
          epoch: currentEpoch,
          trainLoss: (logs?.loss as number) ?? NaN,
          batch,
          batchesPerEpoch,
          epochs: params.epochs,
          percent,
          phase: "batch"
        });
        await tf.nextFrame();
      },
      onEpochEnd: async (epoch: number, logs?: tf.Logs) => {
        const nTrain = Math.floor(n * (1 - valSplit));
        const batchesPerEpoch = Math.max(1, Math.ceil(nTrain / params.batchSize));
        const percent = (epoch + 1) / params.epochs;
        const point = { epoch: epoch + 1, trainLoss: (logs?.loss as number) ?? NaN, valLoss: (logs?.val_loss as number), batchesPerEpoch, epochs: params.epochs, percent, phase: "epoch" as const };
        history.push(point);
        onProgress?.(point);
        await tf.nextFrame();
      }
    }
  });

  xTensor.dispose();
  yTensor.dispose();
  xNorm.dispose();

  return { model, norm, history };
}
