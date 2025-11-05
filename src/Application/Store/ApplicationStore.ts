import { makeAutoObservable } from "mobx";
import { Tab } from "../Tab";
import { TrackId } from "../Config/TrackConfig";

export class ApplicationStore {
  private defaultLogic = `// You can access the current speed as the 2nd/3rd params (m/s, km/h)
// This default policy keeps speed around a target, slows down near obstacles,
// and steers toward the more open side. Tune the constants to your taste.
this.drive = (detectionResult, speedMS, speedKph) => {
  // Safe accessors with fallbacks
  const d = i => (detectionResult[i] ? detectionResult[i].distance : 5);
  const distanceFront = d(0);       // forward (up to ~40 m)
  const distanceFrontRight = d(1);  // front-right
  const distanceFrontLeft = d(7);   // front-left
  // Note: side corridor centering disabled on request

  // 1) Steering: keep it simple — just use front-right vs front-left difference
  const MAX_STEER = 0.7; // matches sim
  const diff = (distanceFrontRight - distanceFrontLeft);
  const steering = Math.max(-MAX_STEER, Math.min(MAX_STEER, diff));

  // 2) Desired speed with obstacle-aware modulation (in km/h)
  const BASE_KPH = 30; // cruise target
  const MIN_OBS_KPH = 15; // slower target when obstacle in mid-range
  let desiredKph = BASE_KPH;
  if (distanceFront <= 5) {
    desiredKph = 0; // very close => stop
  } else if (distanceFront < 30) {
    // Smoothly interpolate between MIN_OBS_KPH (near) and BASE_KPH (far)
    const t = (distanceFront - 5) / 25; // 0 at 5m, 1 at 30m
    const tClamped = Math.max(0, Math.min(1, t));
    desiredKph = MIN_OBS_KPH + (BASE_KPH - MIN_OBS_KPH) * tClamped;
  }

  // 3) Speed control -> engine force (-1..1)
  const desiredMS = desiredKph / 3.6;
  const v = typeof speedMS === 'number' ? speedMS : 0; // fallback if not provided
  const kP = 0.5; // proportional gain for smooth response
  let force = kP * (desiredMS - v);
  // Reduce throttle when turning to increase stability
  const turnDampen = 1 - 0.7 * Math.min(1, Math.abs(steering) / MAX_STEER);
  force *= Math.max(0.3, turnDampen);
  // Clamp engine force
  force = Math.max(-1, Math.min(1, force));

  // 4) Safety braking: when very close, apply brake instead of strong reverse
  let brake = 0;
  if (distanceFront < 4) {
    // ramp 0..1 as 4m..0m
    brake = Math.max(0, Math.min(1, (4 - distanceFront) / 4));
    force = Math.min(force, 0); // don't accelerate forward while braking
  }

  return { force, brake, steering };
};
`;

  initState: InitState = InitState.MODEL_SELECTION;
  modelQuality: ModelQuality | undefined = undefined;
  trackId: TrackId = TrackId.SIMPLE;
  editorCode: string = this.defaultLogic;
  wasmModule: any = null;
  log: string = "";
  isShowingCodePane: boolean = false;
  isShowingManualInstruction: boolean = false;
  codeTab: Tab = Tab.JS;

  constructor() {
    makeAutoObservable(this);
  }

  setInitState(state: InitState) {
    this.initState = state;
  }

  setModelQuality(quality: ModelQuality) {
    this.modelQuality = quality;
  }

  setTrackId(id: TrackId) {
    this.trackId = id;
  }

  setEditorCode(code: string) {
    this.editorCode = code;
  }

  setWasmModule(wasmModule: any) {
    this.wasmModule = wasmModule;
  }

  setLog(log: string) {
    this.log = log;
  }

  appendLog(log: string) {
    this.log += "\n" + log;
  }

  setIsShowingCodePane(value: boolean) {
    this.isShowingCodePane = value;
  }

  setIsShowingManualInstruction(value: boolean) {
    this.isShowingManualInstruction = value;
  }

  setTab(tab: Tab) {
    this.codeTab = tab;
  }
}

export enum ModelQuality {
  LOW,
  HIGH
}

export enum InitState {
  MODEL_SELECTION,
  LOADING,
  READY
}
