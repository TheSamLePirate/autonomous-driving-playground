import { makeAutoObservable } from "mobx";
import { Tab } from "../Tab";
import { TrackId } from "../Config/TrackConfig";

export class ApplicationStore {
  private defaultLogic = `// Vous pouvez accéder à la vitesse actuelle via les 2e/3e paramètres (m/s, km/h)
// Cette stratégie par défaut maintient la vitesse proche d'une cible, ralentit près des obstacles,
// et oriente vers le côté le plus dégagé. Ajustez les constantes à votre goût.
this.drive = (detectionResult, speedMS, speedKph) => {
  // Accesseurs sûrs avec valeurs de repli
  const d = i => (detectionResult[i] ? detectionResult[i].distance : 5);
  const distanceFront = d(0);       // forward (up to ~40 m)
  const distanceFrontRight = d(6);  // front-right
  const distanceFrontLeft = d(5);   // front-left
  // Note: side corridor centering disabled on request

  // 1) Steering: keep it simple — just use front-right vs front-left difference
  const MAX_STEER = 0.7; // matches sim
  const diff = (distanceFrontRight - distanceFrontLeft);
  const steering = Math.max(-MAX_STEER, Math.min(MAX_STEER, diff));

  // 2) Desired speed with obstacle-aware modulation (in km/h)
  const BASE_KPH = 40; // cruise target
  const MIN_OBS_KPH = 15; // slower target when obstacle in mid-range
  let desiredKph = BASE_KPH;
  if (distanceFront <= 5) {
    desiredKph = 0; // très proche => arrêt
  } else if (distanceFront < 30) {
    // Interpolation douce entre MIN_OBS_KPH (proche) et BASE_KPH (loin)
    const t = (distanceFront - 5) / 25; // 0 à 5 m, 1 à 30 m
    const tClamped = Math.max(0, Math.min(1, t));
    desiredKph = MIN_OBS_KPH + (BASE_KPH - MIN_OBS_KPH) * tClamped;
  }

  // 3) Contrôle de la vitesse -> force moteur (-1..1)
  const desiredMS = desiredKph / 3.6;
  const v = typeof speedMS === 'number' ? speedMS : 0; // valeur de repli si non fourni
  const kP = 0.5; // gain proportionnel pour une réponse douce
  let force = kP * (desiredMS - v);
  // Réduire les gaz en virage pour augmenter la stabilité
  const turnDampen = 1 - 0.7 * Math.min(1, Math.abs(steering) / MAX_STEER);
  force *= Math.max(0.3, turnDampen);
  // Saturer la force moteur
  force = Math.max(-1, Math.min(1, force));

  // 4) Freinage de sécurité : très proche => appliquer le frein plutôt qu'une forte marche arrière
  let brake = 0;
  if (distanceFront < 4) {
    // rampe 0..1 de 4 m à 0 m
    brake = Math.max(0, Math.min(1, (4 - distanceFront) / 4));
    force = Math.min(force, 0); // ne pas accélérer vers l'avant pendant le freinage
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
