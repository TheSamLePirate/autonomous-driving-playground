import * as THREE from "three";
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

export function createTrack(group: THREE.Group, which: TrackId) {
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
      }
    }
  }
}
