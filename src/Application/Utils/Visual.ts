import * as CANNON from "cannon-es";
import * as THREE from "three";
import { VisualMode } from "../Config/VisualMode";
import { setPosition, setQuaternion } from "./Conversion";

// Simple per-frame update registry (e.g., for AnimationMixers)
const frameUpdaters: Array<(dt: number) => void> = [];
const frameClock = new THREE.Clock();

const visuals: THREE.Group[] = [];
const bodies: CANNON.Body[] = [];

export function pushVisual(
  body: CANNON.Body,
  visual: THREE.Group,
  scene: THREE.Scene
) {
  // Ensure all meshes in the provided visual can cast and receive shadows
  // (useful for GLTF models like the car chassis and wheels)
  visual.traverse(obj => {
    const mesh = obj as THREE.Mesh;
    if ((mesh as any).isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  scene.add(visual);
  bodies.push(body);
  visuals.push(visual);
}

export function updateVisual() {
  const dt = frameClock.getDelta();
  // Tick registered updaters first (animations, etc.)
  for (let i = 0; i < frameUpdaters.length; i++) {
    try {
      frameUpdaters[i](dt);
    } catch (e) {
      // Swallow to avoid breaking render loop; could add debug log if needed
    }
  }
  visuals.forEach((visual, i) => {
    setPosition(visual, bodies[i].position);
    setQuaternion(visual, bodies[i].quaternion);
  });
}

export function registerFrameUpdate(updater: (dt: number) => void) {
  frameUpdaters.push(updater);
}

export function addVisual(body: CANNON.Body, scene: THREE.Scene) {
  if (!VisualMode.showBody) {
    return;
  }
  if (!(body instanceof CANNON.Body)) {
    throw new Error("The argument passed to addVisual() is not a body");
  }

  const material = new THREE.MeshNormalMaterial();
  material.wireframe = true;

  // get the correspondent three.js mesh
  const mesh = bodyToMesh(body, material);

  // enable shadows on every object
  mesh.traverse(child => {
    child.castShadow = true;
    child.receiveShadow = true;
  });

  bodies.push(body);
  visuals.push(mesh);

  scene.add(mesh);
}

/**
 * Converts a cannon.js body to a three.js mesh group
 * @param {Body} body The cannon.js body
 * @param {Material} material The material the mesh will have
 * @return {Group} The three.js mesh group
 */
function bodyToMesh(body: CANNON.Body, material: THREE.Material) {
  const group = new THREE.Group();

  setPosition(group, body.position);
  setQuaternion(group, body.quaternion);

  const meshes = body.shapes.map(shape => {
    const geometry = shapeToGeometry(shape);

    return new THREE.Mesh(geometry, material);
  });

  meshes.forEach((mesh, i) => {
    const offset = body.shapeOffsets[i];
    const orientation = body.shapeOrientations[i];
    setPosition(mesh, offset);
    setQuaternion(mesh, orientation);
    group.add(mesh);
  });

  return group;
}

/**
 * Converts a cannon.js shape to a three.js geometry
 * ⚠️ Warning: it will not work if the shape has been rotated
 * or scaled beforehand, for example with ConvexPolyhedron.transformAllPoints().
 * @param {Shape} shape The cannon.js shape
 * @param {Object} options The options of the conversion
 * @return {Geometry} The three.js geometry
 */
export function shapeToGeometry(shape: any, { flatShading = true } = {}) {
  switch (shape.type) {
    case CANNON.Shape.types.SPHERE: {
      return new THREE.SphereGeometry(shape.radius, 8, 8);
    }

    case CANNON.Shape.types.PARTICLE: {
      return new THREE.SphereGeometry(0.1, 8, 8);
    }

    case CANNON.Shape.types.PLANE: {
      return new THREE.PlaneGeometry(500, 500, 4, 4);
    }

    case CANNON.Shape.types.BOX: {
      return new THREE.BoxGeometry(
        shape.halfExtents.x * 2,
        shape.halfExtents.y * 2,
        shape.halfExtents.z * 2
      );
    }

    case CANNON.Shape.types.CYLINDER: {
      return new THREE.CylinderGeometry(
        shape.radiusTop,
        shape.radiusBottom,
        shape.height,
        shape.numSegments
      );
    }

    default: {
      throw new Error(`Shape not recognized: "${shape.type}"`);
    }
  }
}
