import * as tf from "@tensorflow/tfjs";
import { NormalizationStats, makeInputVector, Observation, makeSequenceInputVector, SEQ_LEN } from "./types";
import { applyInputNormalization } from "./model";

export interface LayerActivation {
  name: string;
  values: number[]; // activation for batch=1 flattened
}

export function makeInput(obs: Observation, norm: NormalizationStats | null): tf.Tensor2D {
  const x = tf.tensor2d([makeInputVector(obs)]);
  return norm ? applyInputNormalization(x, norm) : x;
}

// Build an input tensor from a short history of observations (temporal stacking)
export function makeSequenceInput(history: Observation[], norm: NormalizationStats | null, seqLen: number = SEQ_LEN): tf.Tensor2D {
  const vec = makeSequenceInputVector(history, seqLen);
  const x = tf.tensor2d([vec]);
  return norm ? applyInputNormalization(x, norm) : x;
}

export function computeActivations(actModel: tf.LayersModel, x: tf.Tensor): LayerActivation[] {
  const layers = actModel.layers;
  const preds = actModel.predict(x) as tf.Tensor | tf.Tensor[];
  const tensors = Array.isArray(preds) ? preds : [preds];
  const result: LayerActivation[] = [];
  for (let i = 0; i < tensors.length; i++) {
    const t = tensors[i] as tf.Tensor;
    const data = t.dataSync();
    result.push({ name: layers[i].name, values: Array.from(data) });
    t.dispose();
  }
  return result;
}
