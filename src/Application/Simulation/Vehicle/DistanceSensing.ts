import { RaycastVehicle } from "cannon-es";
import * as THREE from "three";
import { VisualMode } from "../../Config/VisualMode";
import { toThreeQuaternion } from "../../Utils/Conversion";
import { CarConfig } from "./Car";
import { DetectionResult } from "./DetectionResult";

export const MAX_SENSING_DISTANCE = 5;
// Make the front sensor (index 0) see farther ahead by quadrupling its max range.
const FRONT_SENSOR_INDEX = 0;
const FRONT_SENSOR_MULTIPLIER = 8;
export const SENSIBLE_OBJECT_LAYER = 1;

const raycaster = new THREE.Raycaster();
raycaster.layers.set(SENSIBLE_OBJECT_LAYER);

const rayLines: THREE.Line[] = [];

export function detectNearestObjects(
  scene: THREE.Scene,
  vehicle: RaycastVehicle,
  carConfig: CarConfig
): Array<DetectionResult> {
  // Raise the ray a tiny bit above ground to avoid coplanar misses
  const SENSOR_Y = 0.02; // must be < track half-height (0.05)
  const position = new THREE.Vector3(
    vehicle.chassisBody.position.x,
    SENSOR_Y,
    vehicle.chassisBody.position.z
  );
  const vehicleDirection = getHorizontalRotationAngle(
    toThreeQuaternion(vehicle.chassisBody.quaternion)
  );

  // Define 8 directions: 7 in front (multiples of PI/8 around forward) and 1 directly backward.
  // Keep index 0 as straight ahead.
  const directions: THREE.Vector3[] = [];
  const step = Math.PI / 8; // 22.5°
  const frontOffsets = [0, -1, 1, -2, 2, -3, 3]; // 7 rays around forward
  for (let i = 0; i < frontOffsets.length; i++) {
    const a = vehicleDirection + frontOffsets[i] * step;
    directions.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).normalize());
  }
  // Last ray looks directly behind the car
  directions.push(
    new THREE.Vector3(
      Math.cos(vehicleDirection + Math.PI),
      0,
      Math.sin(vehicleDirection + Math.PI)
    ).normalize()
  );

  // All sensors originate from the front-center of the chassis, slightly above ground
  const positions: THREE.Vector3[] = [];
  const length = carConfig.length;
  const front = new THREE.Vector3(length / 2, 0, 0);
  const rear = new THREE.Vector3(-length / 2, 0, 0);

  // Rotate each vector by the provided angle
  const yAxis = new THREE.Vector3(0, -1, 0);
  front.applyAxisAngle(yAxis, vehicleDirection);
  rear.applyAxisAngle(yAxis, vehicleDirection);
  const frontWorld = front.add(position);
  const rearWorld = rear.add(position);
  // First 7 rays originate at front bumper center; last ray originates at rear center
  for (let i = 0; i < 7; i++) positions.push(frontWorld.clone());
  positions.push(rearWorld.clone());

  const result = [];
  // Raycast in each direction and store the intersections
  for (let i = 0; i < 8; i++) {
    const maxDistance =
      (i === FRONT_SENSOR_INDEX ? FRONT_SENSOR_MULTIPLIER : 8) *
      MAX_SENSING_DISTANCE;
    result.push(
      findNearestObject(
        scene,
        positions[i],
        directions[i],
        maxDistance
      )
    );
  }
  if (VisualMode.showSensing) {
    updateRayLines(result);
  }
  return result;
}

function findNearestObject(
  scene: THREE.Scene,
  position: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance: number
): DetectionResult {
  raycaster.set(position, direction.normalize());

  const intersects = raycaster.intersectObjects(scene.children, true);

  let nearestObject: THREE.Object3D | null = null;
  let nearestDistance = maxDistance;

  for (const intersection of intersects) {
    const object = intersection.object;
    const distance = intersection.distance;

    if (distance < nearestDistance && distance < maxDistance) {
      nearestObject = object;
      nearestDistance = distance;
    }
  }

  return {
    position,
    direction,
    object: nearestObject ? nearestObject.userData.type : null,
    distance: nearestDistance
  };
}

function getHorizontalRotationAngle(quaternion: THREE.Quaternion): number {
  // Create a vector pointing in the forward direction (positive x-axis)
  const forwardVector = new THREE.Vector3(1, 0, 0);

  // Apply the quaternion rotation to the forward vector
  forwardVector.applyQuaternion(quaternion);

  // Calculate the horizontal angle between the rotated vector and the positive x-axis
  let horizontalAngle = Math.atan2(forwardVector.z, forwardVector.x) + Math.PI;

  // Ensure the angle is within [0, 2π]
  horizontalAngle =
    horizontalAngle < 0 ? horizontalAngle + 2 * Math.PI : horizontalAngle;

  return horizontalAngle;
}

export function createRayLines(scene: THREE.Scene) {
  // Create and add 8 ray lines to the scene
  for (let i = 0; i < 8; i++) {
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0390fc });
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3()
    ]);
    const rayLine = new THREE.Line(lineGeometry, lineMaterial);
    // It is always within camera, disable cull is more efficient than calling
    // computeSphere every time, but should change implementation if not true.
    rayLine.frustumCulled = false;
    scene.add(rayLine);
    rayLines.push(rayLine);
  }
}

function updateRayLines(detectionResults: DetectionResult[]) {
  for (let i = 0; i < 8; i++) {
    const result = detectionResults[i];

    const startPoint = result.position.clone();
    const endPoint = result.position
      .clone()
      .add(result.direction.clone().multiplyScalar(result.distance));
    const lineGeometry = rayLines[i].geometry as THREE.BufferGeometry;
    const positions = lineGeometry.attributes.position.array as Float32Array;

    // Update line geometry
    positions[0] = startPoint.x;
    positions[1] = startPoint.y;
    positions[2] = startPoint.z;
    positions[3] = endPoint.x;
    positions[4] = endPoint.y;
    positions[5] = endPoint.z;

    lineGeometry.attributes.position.needsUpdate = true;
  }
}
