import * as THREE from "three";

export type MountainsOptions = {
  segments?: number; // angular resolution
  // Base radii for the three ranges (foreground -> background)
  radii?: [number, number, number];
  // Base peak heights for the three ranges
  heights?: [number, number, number];
  // Colors for the three ranges (dark -> light)
  colors?: [number, number, number];
  // Global vertical offset
  yOffset?: number;
  // Arc coverage in degrees (default 360 for full surround). Use 180-260 for horizon-like.
  arcDegrees?: number;
  // Rotation of the arc (degrees), 0 aligns arc center on +X axis.
  arcRotationDeg?: number;
};

/**
 * Creates layered mountain ridges as sloped strips from ground (y=0) up to a
 * noisy silhouette. Multiple layers with different radii/heights/colors avoid
 * the "ring" look and create depth. Cheap to render, no shadows.
 */
export function createMountains(
  scene: THREE.Scene,
  opts: MountainsOptions = {}
) {
  const {
    segments = 256,
    radii = [220, 320, 430],
    heights = [22, 35, 50],
    colors = [0x32404a, 0x586c7c, 0x8aa0b3],
    yOffset = 0,
    arcDegrees = 260, // not full circle to avoid obvious donut
    arcRotationDeg = 180, // center on -X by default (behind common camera setups)
  } = opts;

  const group = new THREE.Group();
  group.name = "MountainsGroup";

  // Procedural ridge noise
  const ridge = (t: number, octaveShift = 0) => {
    const w = Math.PI * 2;
    const p1 = Math.sin((t * w) * (1.0 + octaveShift * 0.1) + 0.3) * 0.6;
    const p2 = Math.sin((t * w) * (2.1 + octaveShift * 0.13) + 1.7) * 0.25;
    const p3 = Math.sin((t * w) * (4.3 + octaveShift * 0.21) + 3.1) * 0.13;
    const raw = (p1 + p2 + p3) * 0.5 + 0.5; // 0..1
    return Math.pow(THREE.MathUtils.clamp(raw, 0, 1), 1.25);
  };

  const buildRange = (
    radius: number,
    peak: number,
    color: number,
    layerIndex: number
  ) => {
    const positions: number[] = [];
    const colorsArr: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const col = new THREE.Color(color);
    const arcRad = THREE.MathUtils.degToRad(arcDegrees);
    const arcStart = THREE.MathUtils.degToRad(arcRotationDeg - arcDegrees / 2);

    for (let i = 0; i <= segments; i++) {
      const t = i / segments; // 0..1 across arc
      const ang = arcStart + t * arcRad;
      const n = ridge(t, layerIndex);
      // Gentle radius wobble
      const rJitter = 1.0 + (Math.sin(ang * 3.0 + 0.8) * 0.6 + Math.sin(ang * 5.1)) * 0.015;
      const rInner = radius * 0.85 * rJitter;
      const rOuter = radius * 1.0 * rJitter;

      const x1 = Math.cos(ang) * rInner;
      const z1 = Math.sin(ang) * rInner;
      const x2 = Math.cos(ang) * rOuter;
      const z2 = Math.sin(ang) * rOuter;

      const y1 = 0 + yOffset - 0.05; // slightly below ground to avoid z-fighting
      const y2 = yOffset + peak * (0.65 + n * 0.8);

      // Bottom vertex (ground)
      positions.push(x1, y1, z1);
      uvs.push(t, 0);
      colorsArr.push(col.r, col.g, col.b);
      // Top ridge vertex
      positions.push(x2, y2, z2);
      uvs.push(t, 1);
      colorsArr.push(col.r, col.g, col.b);
    }

    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, d);
      indices.push(a, d, c);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geom.setAttribute("color", new THREE.Float32BufferAttribute(colorsArr, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      color: 0xffffff,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.04,
      dithering: true,
      side: THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = `MountainsRange_${layerIndex}`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    // Draw farther ranges first
    mesh.renderOrder = -2 + layerIndex;

    return mesh;
  };

  // Back (light, high, far), Mid, Front (dark, low, closer)
  const back = buildRange(radii[2], heights[2], colors[2], 2);
  const mid = buildRange(radii[1], heights[1], colors[1], 1);
  const front = buildRange(radii[0], heights[0], colors[0], 0);

  group.add(back, mid, front);

  // Keep visible even if mostly outside frustum
  group.traverse(obj => (obj.frustumCulled = false));
  scene.add(group);
  return group;
}
