import * as THREE from "three";
import * as CANNON from "cannon-es";
import { DetectionObjectType } from "../Vehicle/DetectionObjectType";
import { SENSIBLE_OBJECT_LAYER } from "../Vehicle/DistanceSensing";
import {
  ROAD_BLOCK_SIZE,
  createBlock,
  createCurveRoad,
  createStraightRoad
} from "./Road";
import { TrackId } from "../../Config/TrackConfig";

type Tile = "B" | "H" | "V" | "C1" | "C2" | "C3" | "C4" | " ";
type TrackGrid = Tile[][];

const SIMPLE_TRACK: TrackGrid = [
  ["C4", "H", "H", "H", "H", "C1"],
  ["C3", "H", "H", "H", "C1", "V"],
  ["B", "B", "B", "B", "C3", "C2"]
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
      if (cell === " ") continue;
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
