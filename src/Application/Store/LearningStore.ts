import { makeAutoObservable } from "mobx";
import * as tf from "@tensorflow/tfjs";
import { RingBufferDataset } from "../Learning/dataset";
import { Action, Observation, Sample } from "../Learning/types";
import { DriverModelBundle, loadModelIndexedDB, saveModelIndexedDB } from "../Learning/model";
import { TrainParams, TrainProgress, TrainResult, trainOnDataset } from "../Learning/trainer";

export type RecordingMode = "off" | "human" | "expert";
export type AutopilotSource = "code" | "model";

export class LearningStore {
  dataset = new RingBufferDataset(10000);
  recording: RecordingMode = "off";
  training: boolean = false;
  lastProgress: TrainProgress | null = null;
  lossHistory: TrainProgress[] = [];
  modelBundle: DriverModelBundle = { model: null, norm: null };
  autopilotSource: AutopilotSource = "code";
  activationsEnabled: boolean = false;
  showActivationOverlay: boolean = false;
  showActivationEdges: boolean = true;
  activationModel: tf.LayersModel | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  setRecording(mode: RecordingMode) {
    this.recording = mode;
  }

  setAutopilotSource(src: AutopilotSource) {
    this.autopilotSource = src;
  }

  setActivationsEnabled(enabled: boolean) {
    this.activationsEnabled = enabled;
  }

  setShowActivationOverlay(show: boolean) {
    this.showActivationOverlay = show;
  }

  setShowActivationEdges(show: boolean) {
    this.showActivationEdges = show;
  }

  addSample(sample: Sample) {
    this.dataset.add(sample);
  }

  clearDataset() {
    this.dataset.clear();
  }

  exportDataset(): string {
    return this.dataset.exportJSON();
  }

  importDataset(json: string) {
    this.dataset.importJSON(json);
  }

  async train(params: TrainParams, onProgress?: (p: TrainProgress) => void) {
    if (this.training) return;
    this.training = true;
    this.lastProgress = null;
    this.lossHistory = [];
    try {
      const result: TrainResult = await trainOnDataset(this.dataset, params, p => {
        this.lastProgress = p;
        if (p.phase === "epoch") {
          this.lossHistory.push(p);
        }
        onProgress?.(p);
      });
      this.modelBundle = { model: result.model, norm: result.norm };
      this.rebuildActivationModel();
    } finally {
      this.training = false;
    }
  }

  async saveModel(key?: string) {
    if (!this.modelBundle.model || !this.modelBundle.norm) return;
    await saveModelIndexedDB(this.modelBundle.model, this.modelBundle.norm, key);
  }

  async loadModel(key?: string) {
    this.modelBundle = await loadModelIndexedDB(key);
    this.rebuildActivationModel();
  }

  rebuildActivationModel() {
    if (!this.modelBundle.model) {
      this.activationModel = null;
      return;
    }
    const base = this.modelBundle.model;
    const outputs = base.layers.map(l => l.output) as unknown as tf.SymbolicTensor[];
    // Important: do NOT dispose this activationModel, as it shares weights with base model.
    this.activationModel = tf.model({
      inputs: base.inputs as tf.SymbolicTensor | tf.SymbolicTensor[],
      outputs
    });
  }
}
