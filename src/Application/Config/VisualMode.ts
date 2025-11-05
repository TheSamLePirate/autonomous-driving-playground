import { ENABLE_OBJECT_DETECTION } from "./FeatureFlag";
export enum CameraMode {
  NONE,
  FOLLOW,
  FOLLOW_BEHIND,
  COCKPIT
}

export const VisualMode = {
  showModel: true,
  showBody: false,
  showGroundGrid: true,
  showSensing: true,
  cameraMode: CameraMode.FOLLOW,
  // runtime toggle for object detection overlay
  showObjectDetection: ENABLE_OBJECT_DETECTION
};
