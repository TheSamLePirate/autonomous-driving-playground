import * as THREE from "three";

// Observation: 8 distances normalized [0,1], speed normalized to 0..50 km/h -> [0,1], brake [0,1], and raw speedometer (km/h)
export interface Observation {
  distances: number[]; // length 8
  speed: number; // 0..1 (normalized from m/s)
  speedKph: number; // speedometer reading in km/h (raw; normalized downstream)
}

// Action continuous controls
export interface Action {
  // engine force fraction -1..1
  force: number;
  // steering normalized -1..1 (we'll map to radians with MAX_STEER elsewhere)
  steering: number;
}

export interface Sample {
  obs: Observation;
  act: Action;
  // optional metadata
  t?: number; // timestamp
  mode?: "human" | "expert";
}

export interface NormalizationStats {
  // For simple min-max normalization we keep mins and maxs
  obsMin: number[]; // length = inputDim
  obsMax: number[]; // length = inputDim
}

// Base dimensionality for a single observation
export const INPUT_BASE_DIM = 10; // 8 distances + 1 speed + 1 speedometer (km/h) — brake removed
// Sequence length for temporal context (used in training and inference)
export const SEQ_LEN = 1;
// Effective input size with temporal stacking
export const INPUT_DIM = INPUT_BASE_DIM * SEQ_LEN;
export const OUTPUT_DIM = 2; // steering, force (brake removed from model outputs)

export function makeInputVector(obs: Observation): number[] {
  const distances = (obs.distances || []).slice(0, 8);
  while (distances.length < 8) distances.push(1);
  const speed = typeof obs.speed === "number" ? obs.speed : 0;
  const speedKph = typeof (obs as any).speedKph === "number" ? (obs as any).speedKph : 0;
  return [...distances, speed, speedKph];
}

// Build a flattened temporal input by stacking SEQ_LEN observations (left-padding
// with the earliest observation when the history is shorter than SEQ_LEN).
export function makeSequenceInputVector(history: Observation[], seqLen: number = SEQ_LEN): number[] {
  if (!history || history.length === 0) {
    // Fallback to zeros if no observation is available
    return new Array(INPUT_BASE_DIM * seqLen).fill(0);
  }
  const window: Observation[] = [];
  const lastIdx = history.length - 1;
  const start = Math.max(0, history.length - seqLen);
  const padCount = seqLen - (history.length - start);
  // Left-pad with the earliest available observation in the window
  const padObs = history[start] ?? history[0];
  for (let i = 0; i < padCount; i++) window.push(padObs);
  for (let i = start; i <= lastIdx; i++) window.push(history[i]);
  // Flatten
  const parts = window.map(o => makeInputVector(o));
  return parts.flat();
}

export function clip01(x: number) {
  return Math.max(0, Math.min(1, x));
}

export function clip11(x: number) {
  return Math.max(-1, Math.min(1, x));
}
