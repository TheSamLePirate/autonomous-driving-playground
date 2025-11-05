import * as CANNON from "cannon-es";
import * as THREE from "three";
import { CameraMode, VisualMode } from "../Config/VisualMode";
import {
  setupCamera,
  setupOrbitControls,
  updateCameraFollow,
  updateCameraFollowBehind,
  updateCameraCockpit
} from "./Camera";
import {
  Car,
  CarConfig,
  createVehicle,
  model3HighRes,
  model3LowRes
} from "./Vehicle/Car";
import { DEFAULT_KEYS_1 } from "./Vehicle/CarControlKeys";
 

import { observe } from "mobx";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { pollGamepads } from "../InputControl/Gamepad";
import { setupGamepad } from "../InputControl/GamepadActionMapping";
import { InitState, ModelQuality } from "../Store/ApplicationStore";
import { rootStore } from "../Store/RootStore";
import { updateVisual } from "../Utils/Visual";
import { createTrack } from "./Track/Track";
import { createRayLines } from "./Vehicle/DistanceSensing";
import { createEnvironment } from "./World/Environment";
import { createGround } from "./World/Ground";
import { createSky, createSun } from "./World/Sky";
import { TrackId } from "../Config/TrackConfig";

const appStore = rootStore.applicationStore;

const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, -9.82, 0)
});
let car: Car;
const initCarPosition = new CANNON.Vec3(0, 2, 0);
let trackGroup: THREE.Group;

export async function start(container: HTMLElement) {
  const scene = new THREE.Scene();
  const camera = setupCamera(container);
  const renderer = setupRenderer(container);
  // Expose renderer canvas for overlays (e.g., object detection)
  rendererCanvas = renderer.domElement;
  const controls = setupOrbitControls(camera, renderer);
  setupOnResize(container, renderer, camera);
  setupGamepad(rootStore.carStore);
  setupCameraToggleKey(controls);

  createEnvironment(scene, renderer);
  createSky(scene);
  createSun(scene);
  // Utilise uniquement le ciel procédural + soleil
  createGround(world, scene);
  trackGroup = new THREE.Group();
  scene.add(trackGroup);
  createTrack(trackGroup, appStore.trackId ?? TrackId.SIMPLE, world);
  observe(appStore, "trackId", change => {
    createTrack(trackGroup, change.newValue, world);
  });
  if (VisualMode.showSensing) {
    createRayLines(scene);
  }
  animate(renderer, scene, camera, controls);

  waitForModelSelection(scene);
}

export function reset() {
  car?.reset();
}

export function applyDriveCode(code: string) {
  const appStore = rootStore.applicationStore;
  try {
    car?.applyDriveCode(code);
    appStore.setLog("Drive code deployed!");
    appStore.appendLog("Enable Autopilot to test the logic");
  } catch (error) {
    if (error instanceof SyntaxError) {
      appStore.setLog(error.message);
    } else {
      appStore.setLog("Error, please check the code");
      throw error;
    }
  }
}

function waitForModelSelection(scene: THREE.Scene) {
  observe(appStore, "modelQuality", change => {
    let config = model3LowRes;
    switch (change.newValue) {
      case ModelQuality.LOW:
        config = model3LowRes;
        break;
      case ModelQuality.HIGH:
        config = model3HighRes;
        break;
    }
    createCar(config, scene);
  });
}

async function createCar(config: CarConfig, scene: THREE.Scene) {
  appStore.setInitState(InitState.LOADING);
  car = await createVehicle(
    initCarPosition,
    DEFAULT_KEYS_1,
    world,
    scene,
    rootStore.carStore,
    rootStore.learningStore,
    config
  );
  applyDriveCode(appStore.editorCode);
  appStore.setInitState(InitState.READY);
}

function animate(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  controls: OrbitControls
) {
  requestAnimationFrame(() => {
    animate(renderer, scene, camera, controls);
  });
  updatePhysics(scene);
  updateVehicle();
  updateVisual();
  updateCamera(camera, controls);
  pollGamepads();
  renderer.render(scene, camera);
}

function updateVehicle() {
  car?.mayApplySelfDrive();
}

function updatePhysics(scene: THREE.Scene) {
  world.fixedStep();
  car?.updateCarStateAfterPhysicsStep(scene);
}

function updateCamera(camera: THREE.Camera, controls: OrbitControls) {
  if (!car) {
    return;
  }
  switch (VisualMode.cameraMode) {
    case CameraMode.FOLLOW:
      updateCameraFollow(camera, controls, car.vehicle);
      break;
    case CameraMode.FOLLOW_BEHIND:
      updateCameraFollowBehind(camera, controls, car.vehicle);
      break;
    case CameraMode.COCKPIT:
      // Disable orbit interactions in cockpit
      controls.enabled = false;
      // Lazy import to avoid circulars already imported at top
      // update is available from Camera.ts
      // @ts-ignore - function imported at top
      updateCameraCockpit(camera, controls, car.vehicle);
      break;
    default:
    // No action
  }
  if (VisualMode.cameraMode !== CameraMode.COCKPIT) {
    controls.enabled = true;
  }
}
function setupRenderer(container: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  // Color management and tonemapping tuned for clear sky
  // Using Reinhard here to avoid white clipping of the procedural Sky
  // and to keep colors punchy without blowing out highlights.
  // If you prefer ACES, we can switch back and adjust exposure.
  renderer.outputColorSpace = THREE.SRGBColorSpace as any;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  renderer.setClearColor(0x87ceeb, 1); // fallback sky blue background
  // Enable soft shadows for the sun
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  return renderer;
}

export let onCanvasResize: () => void | undefined;

function setupOnResize(
  container: HTMLElement,
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera
) {
  onCanvasResize = () => {
    onWindowResize(container, renderer, camera);
  };
  window.addEventListener("resize", onCanvasResize, false);
}

// Public reference to the WebGL canvas used by the renderer, for consumers like UI overlays
export let rendererCanvas: HTMLCanvasElement | null = null;
export function getRendererCanvas(): HTMLCanvasElement | null {
  return rendererCanvas;
}

// Track the previously active non-cockpit camera mode to allow toggling back
let previousCameraMode: CameraMode = VisualMode.cameraMode;

function setupCameraToggleKey(controls: OrbitControls) {
  const onKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (key === "c") {
      if (VisualMode.cameraMode === CameraMode.COCKPIT) {
        VisualMode.cameraMode = previousCameraMode;
        controls.enabled = true;
      } else {
        previousCameraMode = VisualMode.cameraMode;
        VisualMode.cameraMode = CameraMode.COCKPIT;
        controls.enabled = false;
      }
    }
  };
  window.addEventListener("keydown", onKeyDown);
}

function onWindowResize(
  container: HTMLElement,
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera
) {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();

  // Keep renderer pixel ratio in sync (important when moving between displays with different DPR)
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
}
