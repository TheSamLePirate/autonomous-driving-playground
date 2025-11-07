import * as tf from "@tensorflow/tfjs";
import { INPUT_BASE_DIM, SEQ_LEN, OUTPUT_DIM, NormalizationStats } from "./types";

export interface DriverModelBundle {
  model: tf.LayersModel | null;
  norm: NormalizationStats | null;
}

export function createDriverModel(): tf.LayersModel {
  // Recurrent model over a short temporal window
  const model = tf.sequential();
  model.add(tf.layers.gru({ inputShape: [SEQ_LEN, INPUT_BASE_DIM], units: 32, returnSequences: false }));
  model.add(tf.layers.dense({ units: 16, activation: "relu" }));
  // outputs: [steering(-1..1), force(-1..1), brake(-1..1) -> mapped to [0,1] downstream]
  model.add(tf.layers.dense({ units: OUTPUT_DIM, activation: "tanh" }));
  model.compile({ optimizer: tf.train.adam(1e-3), loss: "meanSquaredError" });
  return model;
}

export async function saveModelIndexedDB(model: tf.LayersModel, norm: NormalizationStats, key = "car-driver") {
  await model.save(`indexeddb://${key}`);
  localStorage.setItem(`${key}:norm`, JSON.stringify(norm));
}

export async function loadModelIndexedDB(key = "car-driver"): Promise<DriverModelBundle> {
  try {
    const model = await tf.loadLayersModel(`indexeddb://${key}`);
    const normStr = localStorage.getItem(`${key}:norm`);
    const norm = normStr ? (JSON.parse(normStr) as NormalizationStats) : null;
    return { model, norm };
  } catch {
    return { model: null, norm: null };
  }
}

export function applyInputNormalization<T extends tf.Tensor>(x: T, norm: NormalizationStats | null): T {
  if (!norm) return x;
  return tf.tidy(() => {
    const eps = 1e-6;
    const f = norm.obsMin.length; // feature dimension
    if (x.rank === 3) {
      // x shape: [batch, time, features]
      const min = tf.tensor1d(norm.obsMin).reshape([1, 1, f]);
      const max = tf.tensor1d(norm.obsMax).reshape([1, 1, f]);
      return x.sub(min).div(max.sub(min).add(eps)) as T;
    } else if (x.rank === 2) {
      // x shape: [batch, features]
      const min = tf.tensor2d([norm.obsMin]);
      const max = tf.tensor2d([norm.obsMax]);
      return x.sub(min).div(max.sub(min).add(eps)) as T;
    } else {
      // Fallback: attempt broadcasting with last dimension
      const min = tf.tensor1d(norm.obsMin);
      const max = tf.tensor1d(norm.obsMax);
      return x.sub(min as any).div((max as any).sub(min as any).add(eps)) as T;
    }
  });
}

export function denormOutputs(y: tf.Tensor2D): tf.Tensor2D {
  // steering, force in tanh [-1,1], brake also tanh -> map brake to [0,1]
  // We'll map brake from [-1,1] to [0,1]
  return tf.tidy(() => {
    const [steer, force, brake] = tf.split(y, 3, 1);
    const brake01 = brake.add(1).div(2);
    return tf.concat([steer, force, brake01], 1) as tf.Tensor2D;
  });
}
