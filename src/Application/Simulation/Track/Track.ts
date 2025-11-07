import * as THREE from "three";
import * as CANNON from "cannon-es";
import { DetectionObjectType } from "../Vehicle/DetectionObjectType";
import { SENSIBLE_OBJECT_LAYER } from "../Vehicle/DistanceSensing";
import {
  ROAD_BLOCK_SIZE,
  createBlock,
  createCurveRoad,
  createStraightRoad,
  createCrossRoad,
  createTCrossRoad
} from "./Road";
import { TrackId } from "../../Config/TrackConfig";

type Tile = "B" | "H" | "V" | "C1" | "C2" | "C3" | "C4" | " " | "+" | "T1" | "T2" | "T3" | "T4";
type TrackGrid = Tile[][];

const SIMPLE_TRACK: TrackGrid = [
  ["C4", "H", "T1", "H", "H", "C1"],
  ["C3", "H", "+", "H", "H", "T2"],
  [" ", "B", "C3", "H", "H", "C2"],
  ["C3", " ", " ", " ", " ", " "]
];

// A more complex loop with multiple turns and straights. Space means empty.
const COMPLEX_TRACK: TrackGrid = [
  [" ", " ", "C4", "H", "H", "H", "H", "C1", " ", " "],
  [" ", " ", "V", " ", " ", " ", " ", "V", " ", " "],
  ["C4", "H", "C3", "H", "H", "C1", " ", "V", " ", " "],
  ["V", " ", " ", " ", " ", "V", " ", "V", " ", " "],
  ["V", " ", "C4", "H", "H", "C3", "H", "C2", " ", " "],
  ["V", " ", "V", " ", " ", " ", " ", " ", " ", " "],
  ["C3", "H", "C2", " ", "C4", "H", "H", "H", "H", "C1"],
  [" ", " ", " ", " ", "V", " ", " ", " ", " ", "V"],
  [" ", " ", " ", " ", "C3", "H", "H", "H", "H", "C2"],
];

// EXTREME track redesigned as a single continuous loop with a balanced mix of left/right turns (chicane on the top straight).
// Grid size: width=18, height=12 (y increasing downward, x increasing to the right)
// Legend: H = horizontal, V = vertical, C1..C4 = 90° corners (see switch below for orientations)
const EXTREME_TRACK: TrackGrid = [
  // y=0 top border with chicane entry/exit
  ["C4","H","H","H","H","H","H","C1"," "," "," ","C4","H","H","H","H","H","C1"],
  // y=1 side walls + chicane verticals
  ["V"," "," "," "," "," "," ","V"," "," "," ","V"," "," "," "," "," ","V"],
  // y=2 side walls + chicane verticals
  ["V"," "," "," "," "," "," ","V"," "," "," ","V"," "," "," "," "," ","V"],
  // y=3 side walls + chicane verticals
  ["V"," "," "," "," "," "," ","V"," "," "," ","V"," "," "," "," "," ","V"],
  // y=4 chicane mid-line
  ["V"," "," "," "," "," "," ","C3","H","H","H","C2"," "," "," "," "," ","V"],
  // y=5 lower half borders only
  ["V"," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," ","V"],
  // y=6 lower half borders only
  ["V"," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," ","V"],
  // y=7 lower half borders only
  ["V"," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," ","V"],
  // y=8 lower half borders only
  ["V"," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," ","V"],
  // y=9 lower half borders only
  ["V"," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," ","V"],
  // y=10 lower half borders only
  ["V"," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," ","V"],
  // y=11 bottom border
  ["C3","H","H","H","H","H","H","H","H","H","H","H","H","H","H","H","H","C2"],
];

// Keep a reference to physics bodies attached to a given THREE.Group so we can cleanly remove them when regenerating the track
function getOrInitPhysicsList(group: THREE.Group): CANNON.Body[] {
  if (!group.userData.__physicsBodies) {
    group.userData.__physicsBodies = [] as CANNON.Body[];
  }
  return group.userData.__physicsBodies as CANNON.Body[];
}

function disposePhysicsForGroup(group: THREE.Group, world: CANNON.World) {
  const bodies = getOrInitPhysicsList(group);
  for (const b of bodies) {
    try {
      world.removeBody(b);
    } catch {}
  }
  bodies.length = 0;
}

function geometryToTrimesh(geom: THREE.BufferGeometry): CANNON.Trimesh | null {
  const posAttr = geom.attributes.position as THREE.BufferAttribute | undefined;
  if (!posAttr) return null;
  // Ensure up-to-date geometry
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  const vertices = Array.from(posAttr.array as Iterable<number>);
  let indices: number[];
  if (geom.index) {
    indices = Array.from(geom.index.array as Iterable<number>);
  } else {
    // Build non-indexed triangle list indices
    indices = [];
    for (let i = 0; i < posAttr.count; i++) indices.push(i);
  }
  return new CANNON.Trimesh(vertices, indices);
}

function buildStaticBodyFromMesh(mesh: THREE.Mesh, worldPos: THREE.Vector3, worldQuat: THREE.Quaternion): CANNON.Body | null {
  const geom = mesh.geometry as THREE.BufferGeometry | undefined;
  if (!geom) return null;
  const shape = geometryToTrimesh(geom);
  if (!shape) return null;
  const body = new CANNON.Body({ mass: 0 });
  body.addShape(shape);
  body.position.set(worldPos.x, worldPos.y, worldPos.z);
  body.quaternion.set(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w);
  return body;
}

// --- Buildings generation in empty spaces -------------------------------------------------------

// Simple deterministic RNG based on cell coordinates to keep scene stable between runs
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cellRng(x: number, y: number) {
  // Large distinct primes for hashing coords
  const seed = (x * 73856093) ^ (y * 19349663) ^ 0x9e3779b9;
  return mulberry32(seed >>> 0);
}

const BUILDING_COLORS = [
  0x9ea7ad, // light concrete gray
  0x6c7a89, // slate
  0x8d99ae, // blue-gray
  0xb0b7bf, // pale gray
  0x7f8c8d // concrete
];

type BuildingSpec = {
  w: number;
  d: number;
  h: number;
  x: number;
  z: number;
  color: number;
};

function randomInRange(rng: () => number, min: number, max: number) {
  return min + rng() * (max - min);
}

function generateBuildingsForCell(x: number, y: number): { group: THREE.Group; specs: BuildingSpec[] } | null {
  const rng = cellRng(x, y);
  // Only place buildings in ~45% of empty cells to avoid overcrowding
  if (rng() > 0.45) return null;

  const group = new THREE.Group();
  // Slight inner margin to keep clear from neighbouring road blocks visually
  const margin = ROAD_BLOCK_SIZE * 0.1;
  const half = ROAD_BLOCK_SIZE / 2;
  const minSize = ROAD_BLOCK_SIZE * 0.15; // building base footprint min
  const maxSize = ROAD_BLOCK_SIZE * 0.35; // building base footprint max
  const minHeight = ROAD_BLOCK_SIZE * 0.8;
  const maxHeight = ROAD_BLOCK_SIZE * 2.8;

  const buildingCount = 1 + Math.floor(rng() * 3); // 1..3 buildings per selected cell
  const specs: BuildingSpec[] = [];

  for (let i = 0; i < buildingCount; i++) {
    const w = randomInRange(rng, minSize, maxSize);
    const d = randomInRange(rng, minSize, maxSize);
    const h = randomInRange(rng, minHeight, maxHeight);
    const color = BUILDING_COLORS[Math.floor(rng() * BUILDING_COLORS.length)];

    // Random position within the cell with margin
    const xLocal = randomInRange(rng, -half + margin + w / 2, half - margin - w / 2);
    const zLocal = randomInRange(rng, -half + margin + d / 2, half - margin - d / 2);

    specs.push({ w, d, h, x: xLocal, z: zLocal, color });
  }

  // Build meshes
  for (const b of specs) {
    const geom = new THREE.BoxGeometry(b.w, b.h, b.d);
    const mat = new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.9, metalness: 0.0 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    // store dims for optional physics
    (mesh as any).userData.__dims = { w: b.w, h: b.h, d: b.d };
    group.add(mesh);
  }

  // Position the group at the world cell center
  group.position.set(ROAD_BLOCK_SIZE * x, 0, ROAD_BLOCK_SIZE * y);
  return { group, specs };
}

export function createTrack(group: THREE.Group, which: TrackId, world?: CANNON.World) {
  const grid = which === TrackId.EXTREME
    ? EXTREME_TRACK
    : which === TrackId.COMPLEX
    ? COMPLEX_TRACK
    : SIMPLE_TRACK;
  // Clear existing
  for (let i = group.children.length - 1; i >= 0; i--) {
    const child = group.children[i];
    group.remove(child);
  }
  // Also clear physics bodies if a world is supplied
  if (world) disposePhysicsForGroup(group, world);

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const cell = grid[y][x];
      if (cell === " ") {
        // Add buildings in large empty spaces to bring life to the environment
        const res = generateBuildingsForCell(x, y);
        if (res) {
          const buildingsGroup = res.group;
          buildingsGroup.traverse(obj => {
            const mesh = obj as THREE.Mesh;
            if ((mesh as any).isMesh) {
              mesh.castShadow = true;
              mesh.receiveShadow = false;
              // Ensure buildings are sensed as BUILDING by the distance sensors
              (mesh as any).userData.type = DetectionObjectType.BUILDING;
              mesh.layers.enable(SENSIBLE_OBJECT_LAYER);
            }
          });
          // Also set type/layer on the container for consistency
          (buildingsGroup as any).userData.type = DetectionObjectType.BUILDING;
          buildingsGroup.layers.enable(SENSIBLE_OBJECT_LAYER);
          group.add(buildingsGroup);

          if (world) {
            const physicsList = getOrInitPhysicsList(group);
            const worldPos = new THREE.Vector3();
            const worldQuat = new THREE.Quaternion();
            buildingsGroup.updateWorldMatrix(true, true);
            buildingsGroup.traverse(obj => {
              const m = obj as THREE.Mesh;
              if (!(m as any).isMesh) return;
              const dims = (m as any).userData?.__dims as { w: number; h: number; d: number } | undefined;
              if (!dims) return;
              m.getWorldPosition(worldPos);
              m.getWorldQuaternion(worldQuat);
              const shape = new CANNON.Box(new CANNON.Vec3(dims.w / 2, dims.h / 2, dims.d / 2));
              const body = new CANNON.Body({ mass: 0 });
              body.addShape(shape);
              body.position.set(worldPos.x, worldPos.y, worldPos.z);
              body.quaternion.set(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w);
              world.addBody(body);
              physicsList.push(body);
            });
          }
        }
        continue;
      }
      let road: THREE.Mesh | THREE.Object3D | undefined;
      switch (cell) {
        case "B":
          road = createBlock();
          break;
        case "H":
          road = createStraightRoad();
          break;
        case "V":
          road = createStraightRoad();
          road.rotateY(Math.PI / 2);
          break;
        case "C1":
          road = createCurveRoad();
          break;
        case "C2":
          road = createCurveRoad();
          road.rotateY(-Math.PI / 2);
          break;
        case "C3":
          road = createCurveRoad();
          road.rotateY(Math.PI);
          break;
        case "C4":
          road = createCurveRoad();
          road.rotateY(Math.PI / 2);
          break;
        case "+":
          road = createCrossRoad();
          break;
        case "T1":
          road = createTCrossRoad();
          break;
        case "T2":
          road = createTCrossRoad();
          road.rotateY(-Math.PI / 2);
          break;
        case "T3":
          road = createTCrossRoad();
          road.rotateY(Math.PI);
          break;
        case "T4":
          road = createTCrossRoad();
          road.rotateY(Math.PI / 2);
          break;
      }
      if (road) {
        (road as any).userData.type = DetectionObjectType.TRACK;
        road.position.set(ROAD_BLOCK_SIZE * x, 0, ROAD_BLOCK_SIZE * y);
        road.layers.enable(SENSIBLE_OBJECT_LAYER);
        // Track pieces should receive shadows (from car/trees), but not cast
        // to keep lighting clean and avoid double-darkening on the shadow plane.
        road.traverse(obj => {
          const mesh = obj as THREE.Mesh;
          if ((mesh as any).isMesh) {
            mesh.castShadow = false;
            mesh.receiveShadow = true;
          }
        });
        group.add(road);

        // Create matching static physics bodies for collision if a world is provided
        if (world) {
          const physicsList = getOrInitPhysicsList(group);
          // We need world-space transform for each Mesh
          const worldPos = new THREE.Vector3();
          const worldQuat = new THREE.Quaternion();
          // Ensure matrices are current
          road.updateWorldMatrix(true, true);
          road.traverse(obj => {
            const m = obj as THREE.Mesh;
            if (!(m as any).isMesh || !m.geometry) return;
            m.getWorldPosition(worldPos);
            m.getWorldQuaternion(worldQuat);
            const body = buildStaticBodyFromMesh(m, worldPos, worldQuat);
            if (body) {
              world.addBody(body);
              physicsList.push(body);
            }
          });
        }
      }
    }
  }
}
