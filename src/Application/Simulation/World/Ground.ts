import * as CANNON from "cannon-es";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader";
import { VisualMode } from "../../Config/VisualMode";
import InfiniteGridHelper from "../../Utils/InfiniteGridHelper";
import { addVisual, pushVisual } from "../../Utils/Visual";
import { SENSIBLE_OBJECT_LAYER } from "../Vehicle/DistanceSensing";
import { DetectionObjectType } from "../Vehicle/DetectionObjectType";
import { addPerson } from "./Person";
import flowerGlbUrl from "./flower.glb";
import treeGlbUrl from "./Tree.glb";

export const groundMaterial = new CANNON.Material("ground");

export function createGround(world: CANNON.World, scene: THREE.Scene) {
  const groundShape = new CANNON.Plane();
  const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial });
  groundBody.addShape(groundShape);
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // make it face up

  world.addBody(groundBody);
  if (VisualMode.showGroundGrid) {
    const grid = new InfiniteGridHelper(1, 10);
    scene.add(grid);
  } else {
    addVisual(groundBody, scene);
  }

  // Add a large invisible shadow-catching plane so sunlight shadows become visible
  // even when the ground is a wireframe/grid.
  const shadowMat = new THREE.ShadowMaterial({ opacity: 0.35 });
  shadowMat.depthWrite = false;
  shadowMat.polygonOffset = true;
  shadowMat.polygonOffsetFactor = 1;
  shadowMat.polygonOffsetUnits = 1;
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(2000, 2000),
    shadowMat
  );
  shadowPlane.receiveShadow = true;
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.001; // slight offset to avoid z-fighting
  shadowPlane.renderOrder = -1; // render early so other objects draw over it
  scene.add(shadowPlane);

  // Ajoute des arbres depuis Tree.glb (au lieu de cônes), avec corps physiques
  //addTrees(world, scene, 60);

  // Add a person model with physics and detection
  // Placed near origin but off the center so sensors and the car can interact
  //addPerson(world, scene, { position: { x: 6, z: 2 } });

  // Scatter multiple flowers (GLB) on the ground for decoration
  // Fire-and-forget async; visuals will appear when loaded
  //addFlowers(scene, 40);
}

/**
 * Creates and scatters simple green cone "trees" on the ground plane.
 * Trees are placed in a ring away from the origin to avoid the track center area.
 */
async function addTrees(
  world: CANNON.World,
  scene: THREE.Scene,
  count: number = 20
) {
  // Charger Tree.glb une seule fois
  const loader = new GLTFLoader();
  let gltf: GLTF;
  try {
    gltf = await new Promise<GLTF>((resolve, reject) =>
      loader.load(treeGlbUrl, resolve, undefined, reject)
    );
  } catch (e) {
    console.warn("Tree GLB load failed:", e);
    return;
  }

  const base = (gltf.scene || gltf.scenes?.[0])?.clone(true) || new THREE.Group();
  // Préparer le modèle de base (ombres, etc.)
  base.traverse(obj => {
    const mesh = obj as THREE.Mesh;
    if ((mesh as any).isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  // Taille d'origine du modèle (hauteur pour normaliser l'échelle ensuite)
  const bbox0 = new THREE.Box3().setFromObject(base);
  const size0 = new THREE.Vector3();
  bbox0.getSize(size0);
  const originalHeight = size0.y || 1;

  // Anneau de dispersion sur le plan XZ
  const minR = 12;
  const maxR = 200;

  for (let i = 0; i < count; i++) {
    // Hauteur cible similaire aux anciens cônes
    const targetHeight = THREE.MathUtils.randFloat(2.0, 4.5);
    const scale = targetHeight / originalHeight;

    // Instance visuelle
    const instance = base.clone(true);
    instance.scale.setScalar(scale);

    // Mettre le pied de l'arbre au niveau du sol (y = 0)
    const bbox = new THREE.Box3().setFromObject(instance);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const yMin = bbox.min.y;
    instance.position.y =0; // décale pour que le bas touche le sol

    // Légère rotation aléatoire pour varier l'apparence
    instance.rotation.y = THREE.MathUtils.randFloat(0, Math.PI * 2);

    // Marquage pour les capteurs
    instance.traverse(obj => {
      (obj as any).layers?.enable?.(SENSIBLE_OBJECT_LAYER);
      (obj as any).userData = {
        ...(obj as any).userData,
        type: DetectionObjectType.TREE,
      };
    });

    // Position dans l'anneau
    const r = THREE.MathUtils.randFloat(minR, maxR);
    const theta = THREE.MathUtils.randFloat(0, Math.PI * 2);
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;

    // Physique: cylindre simplifié (tronc) aligné Y
    const canopyRadius = Math.max(size.x, size.z) * 0.5;
    const trunkRadius = THREE.MathUtils.clamp(canopyRadius * 0.22, 0.08, 0.6);
    const cylShape = new CANNON.Cylinder(trunkRadius, trunkRadius, size.y, 10);
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(cylShape);
    body.position.set(x, size.y / 2, z);
    world.addBody(body);

    // Grouper l'instance pour la lier au corps physique
    const treeGroup = new THREE.Group();
    treeGroup.add(instance);
    treeGroup.layers.enable(SENSIBLE_OBJECT_LAYER);
    (treeGroup as any).userData.type = DetectionObjectType.TREE;

    // Lier visuel <-> physique
    pushVisual(body, treeGroup, scene);
  }
}

/**
 * Load a single flower GLB and scatter many cloned instances on the ground.
 * Visual-only (no physics). Kept lightweight by reusing geometries/materials.
 */
async function addFlowers(
  scene: THREE.Scene,
  count: number = 30
) {
  const loader = new GLTFLoader();
  let gltf: GLTF | null = null;
  try {
    gltf = await new Promise<GLTF>((resolve, reject) => {
      loader.load(flowerGlbUrl, (g: GLTF) => resolve(g), undefined, err => reject(err));
    });
  } catch (e) {
    console.warn("Flower GLB load failed:", e);
    return;
  }

  const base = (gltf.scene || gltf.scenes?.[0])?.clone(true) || new THREE.Group();
  // Normalize to a pleasant flower height
  const targetHeight = 0.3; // meters
  const bbox = new THREE.Box3().setFromObject(base);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const currentH = size.y || 1;
  const scale = targetHeight / currentH;
  base.scale.setScalar(scale);

  // Ensure all meshes cast/receive shadows and look nice
  base.traverse(obj => {
    const mesh = obj as THREE.Mesh;
    if ((mesh as any).isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  // Placement ring close to the origin so they are visible near the track
  const minR = 3;
  const maxR = 20;
  for (let i = 0; i < count; i++) {
    const instance = base.clone(true);
    const r = THREE.MathUtils.randFloat(minR, maxR);
    const theta = THREE.MathUtils.randFloat(0, Math.PI * 2);
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    instance.position.set(x, 0, z);
    instance.rotation.y = THREE.MathUtils.randFloat(0, Math.PI * 2);
    const sJitter = THREE.MathUtils.randFloat(0.85, 1.15);
    instance.scale.multiplyScalar(sJitter);

    // Make flower visible to sensors if desired (purely visual otherwise)
    // Comment out if you want flowers to be ignored by raycasts
    // instance.layers.enable(SENSIBLE_OBJECT_LAYER);

    scene.add(instance);
  }
}
