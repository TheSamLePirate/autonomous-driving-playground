import * as CANNON from "cannon-es";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { toThreeQuaternion, toThreeVector3 } from "../Utils/Conversion";

export function setupCamera(container: HTMLElement) {
  const width = container.clientWidth;
  const height = container.clientHeight;
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
  camera.position.set(-5, 1, 0);
  camera.lookAt(new THREE.Vector3(0, 0, 0));
  return camera;
}

export function setupOrbitControls(
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer
) {
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  controls.rotateSpeed = 0.25;
  controls.zoomSpeed = 0.5;
  controls.panSpeed = 0.5;
  return controls;
}

export function updateCameraFollow(
  camera: THREE.Camera,
  controls: OrbitControls,
  vehicle: CANNON.RaycastVehicle,
  offsetDistance: number = 10
): void {
  const azimuthalAngle = controls.getAzimuthalAngle();
  const polarAngle = controls.getPolarAngle();

  const offsetDir = new THREE.Vector3(
    Math.sin(azimuthalAngle) * Math.sin(polarAngle) * offsetDistance,
    Math.cos(polarAngle) * offsetDistance,
    Math.cos(azimuthalAngle) * Math.sin(polarAngle) * offsetDistance
  );

  const carPos = vehicle.chassisBody.position;
  const desiredPosition = new THREE.Vector3().addVectors(
    toThreeVector3(carPos),
    offsetDir
  );

  camera.position.lerp(desiredPosition, 1);
  controls.target.lerp(new THREE.Vector3(carPos.x, carPos.y, carPos.z), 1);
  controls.update();
}

export function updateCameraFollowBehind(
  camera: THREE.Camera,
  controls: OrbitControls,
  vehicle: CANNON.RaycastVehicle,
  offsetDistance: number = 12,
  offsetHeight: number = 3
): void {
  const vehicleQuaternion = toThreeQuaternion(vehicle.chassisBody.quaternion);

  const forwardDir = new THREE.Vector3(-1, 0, 0);
  forwardDir.applyQuaternion(vehicleQuaternion);
  const backwardDir = forwardDir.negate();

  const offsetDir = backwardDir.multiplyScalar(offsetDistance);
  offsetDir.y += offsetHeight;

  const carPos = vehicle.chassisBody.position;
  const desiredPosition = new THREE.Vector3().addVectors(
    toThreeVector3(carPos),
    offsetDir
  );

  camera.position.lerp(desiredPosition, 0.05);
  controls.target.set(carPos.x, carPos.y, carPos.z);
  controls.update();
}

export function updateCameraCockpit(
  camera: THREE.Camera,
  controls: OrbitControls,
  vehicle: CANNON.RaycastVehicle
): void {
  // Determine vehicle orientation
  const vehicleQuat = toThreeQuaternion(vehicle.chassisBody.quaternion);

  // Define local offsets for cockpit position relative to chassis center
  // Forward in local space appears to be -X from follow logic
  const forward = new THREE.Vector3(-1, 0, 0).applyQuaternion(vehicleQuat);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(vehicleQuat);
  const right = new THREE.Vector3(0, 0, 1).applyQuaternion(vehicleQuat); // Z as local right in their convention

  // Tunable cockpit offsets (meters)
  const forwardOffset = 0.5; // a bit towards the front
  const heightOffset = 1.1; // eye height above chassis center
  const lateralOffset = 0.0; // centered to avoid sidedness

  const carPos = toThreeVector3(vehicle.chassisBody.position);
  const cockpitPos = new THREE.Vector3()
    .copy(carPos)
    .add(forward.clone().multiplyScalar(forwardOffset))
    .add(up.clone().multiplyScalar(heightOffset))
    .add(right.clone().multiplyScalar(lateralOffset));

  // Set camera position directly (snappy for first-person)
  camera.position.copy(cockpitPos);

  // Look ahead along forward direction
  const lookAtPoint = new THREE.Vector3().copy(cockpitPos).add(forward.clone().multiplyScalar(10));
  (camera as THREE.PerspectiveCamera).lookAt(lookAtPoint);

  // In cockpit we don't want orbit interaction, but keep target synced just in case
  controls.target.set(lookAtPoint.x, lookAtPoint.y, lookAtPoint.z);
}
