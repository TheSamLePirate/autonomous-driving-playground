import * as THREE from "three";
import { CSG } from "three-csg-ts";

const material = new THREE.MeshStandardMaterial({
  color: 0x6e6e6e, // medium gray for track
  roughness: 0.95,
  metalness: 0.0
});

export const ROAD_BLOCK_SIZE = 10;
const BOUNDARY_WIDTH = ROAD_BLOCK_SIZE / 8;
const BLOCK_HEIGHT = 0.1;

export function createBlock() {
  const planeGeometry = new THREE.BoxGeometry(
    ROAD_BLOCK_SIZE,
    BLOCK_HEIGHT,
    ROAD_BLOCK_SIZE
  );
  return new THREE.Mesh(planeGeometry, material);
}

export function createStraightRoad() {
  const planeGeometry = new THREE.BoxGeometry(
    ROAD_BLOCK_SIZE,
    BLOCK_HEIGHT,
    ROAD_BLOCK_SIZE
  );
  const plane = new THREE.Mesh(planeGeometry, material);
  const ROAD_WIDTH = ROAD_BLOCK_SIZE - BOUNDARY_WIDTH * 2;
  const roadGeometry = new THREE.BoxGeometry(
    ROAD_BLOCK_SIZE,
    BLOCK_HEIGHT,
    ROAD_WIDTH
  );
  const road = new THREE.Mesh(roadGeometry, material);
  return CSG.subtract(plane, road);
}



export function createCurveRoad() {
  const planeGeometry = new THREE.BoxGeometry(
    ROAD_BLOCK_SIZE,
    BLOCK_HEIGHT,
    ROAD_BLOCK_SIZE
  );
  const plane = new THREE.Mesh(planeGeometry, material);
  const largeRadius = ROAD_BLOCK_SIZE - BOUNDARY_WIDTH;
  const largeCylinderGeometry = new THREE.CylinderGeometry(
    largeRadius,
    largeRadius,
    BLOCK_HEIGHT,
    64
  );
  const largeCylinder = new THREE.Mesh(largeCylinderGeometry, material);
  largeCylinder.position.set(-ROAD_BLOCK_SIZE / 2, 0, ROAD_BLOCK_SIZE / 2);
  const smallRadius = BOUNDARY_WIDTH;
  const smallCylinderGeometry = new THREE.CylinderGeometry(
    smallRadius,
    smallRadius,
    BLOCK_HEIGHT,
    32
  );
  const smallCylinder = new THREE.Mesh(smallCylinderGeometry, material);
  smallCylinder.position.set(-ROAD_BLOCK_SIZE / 2, 0, ROAD_BLOCK_SIZE / 2);
  plane.updateMatrix();
  largeCylinder.updateMatrix();
  smallCylinder.updateMatrix();
  const curveMesh = CSG.subtract(largeCylinder, smallCylinder);
  const mesh = CSG.subtract(plane, curveMesh);
  return mesh;
}

export function createCrossRoad() {
  const planeGeometry = new THREE.BoxGeometry(
    ROAD_BLOCK_SIZE,
    BLOCK_HEIGHT,
    ROAD_BLOCK_SIZE
  );
  const plane = new THREE.Mesh(planeGeometry, material);
  
  const ROAD_WIDTH = ROAD_BLOCK_SIZE - BOUNDARY_WIDTH * 2;
  
  // Create horizontal road cutout
  const horizontalRoadGeometry = new THREE.BoxGeometry(
    ROAD_BLOCK_SIZE,
    BLOCK_HEIGHT,
    ROAD_WIDTH
  );
  const horizontalRoad = new THREE.Mesh(horizontalRoadGeometry, material);
  
  // Create vertical road cutout
  const verticalRoadGeometry = new THREE.BoxGeometry(
    ROAD_WIDTH,
    BLOCK_HEIGHT,
    ROAD_BLOCK_SIZE
  );
  const verticalRoad = new THREE.Mesh(verticalRoadGeometry, material);
  
  // Update matrices for CSG operations
  plane.updateMatrix();
  horizontalRoad.updateMatrix();
  verticalRoad.updateMatrix();
  
  // Subtract horizontal road from plane
  let mesh = CSG.subtract(plane, horizontalRoad);
  
  // Subtract vertical road from result to create the X crossroad
  mesh = CSG.subtract(mesh, verticalRoad);
  
  return mesh;
}

export function createTCrossRoad() {
  const planeGeometry = new THREE.BoxGeometry(
    ROAD_BLOCK_SIZE,
    BLOCK_HEIGHT,
    ROAD_BLOCK_SIZE
  );
  const plane = new THREE.Mesh(planeGeometry, material);
  
  const ROAD_WIDTH = ROAD_BLOCK_SIZE - BOUNDARY_WIDTH * 2;
  
  // Create horizontal road cutout (full width)
  const horizontalRoadGeometry = new THREE.BoxGeometry(
    ROAD_BLOCK_SIZE,
    BLOCK_HEIGHT,
    ROAD_WIDTH
  );
  const horizontalRoad = new THREE.Mesh(horizontalRoadGeometry, material);
  
  // Create vertical road cutout (half height, positioned at bottom)
  const verticalRoadGeometry = new THREE.BoxGeometry(
    ROAD_WIDTH,
    BLOCK_HEIGHT,
    ROAD_BLOCK_SIZE / 2
  );
  const verticalRoad = new THREE.Mesh(verticalRoadGeometry, material);
  verticalRoad.position.set(0, 0, ROAD_BLOCK_SIZE / 4);
  
  // Update matrices for CSG operations
  plane.updateMatrix();
  horizontalRoad.updateMatrix();
  verticalRoad.updateMatrix();
  
  // Subtract horizontal road from plane
  let mesh = CSG.subtract(plane, horizontalRoad);
  
  // Subtract vertical road from result to create the T crossroad
  mesh = CSG.subtract(mesh, verticalRoad);
  
  return mesh;
}
