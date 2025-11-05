import * as CANNON from "cannon-es";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader";
import { addVisual, pushVisual, registerFrameUpdate } from "../../Utils/Visual";
import { VisualMode } from "../../Config/VisualMode";
import { SENSIBLE_OBJECT_LAYER } from "../Vehicle/DistanceSensing";
import { DetectionObjectType } from "../Vehicle/DetectionObjectType";
import personGlbUrl from "./PersonFromMixamo.glb";

/**
 * Load and add a person model with a physics collider and raycast-detectable layers.
 * - Physics: static cylinder collider so the car collides with the person
 * - Detection: enable SENSIBLE_OBJECT_LAYER and set userData.type = PERSON
 */
export async function addPerson(
  world: CANNON.World,
  scene: THREE.Scene,
  options?: {
    position?: { x: number; z: number };
    height?: number; // target visual height in meters
    radius?: number; // collider radius
  }
) {
  const loader = new GLTFLoader();
  const {
    position = { x: 6, z: 2 },
    height = 1,
    radius = 0.28
  } = options || {};

  // Try to load GLB model; on failure, fall back to a placeholder capsule
  let modelRoot: THREE.Group | null = null;
  let animations: THREE.AnimationClip[] = [];
  try {
    const gltf = await new Promise<GLTF>((resolve, reject) => {
      loader.load(personGlbUrl, (g: GLTF) => resolve(g), undefined, err => reject(err));
    });
    modelRoot = gltf.scene || gltf.scenes?.[0] || new THREE.Group();
    animations = gltf.animations ?? [];
  } catch (e) {
    console.warn("GLB load failed, using placeholder person:", e);
    modelRoot = buildPlaceholderPerson(height);
  }

  // Wrap the model in a container so we can offset it relative to the physics body's center
  const container = new THREE.Group();
  const model = modelRoot;

  // Normalize scale to target height
  const bbox = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const currentHeight = size.y || 1;
  const scale = height / currentHeight;
  model.scale.setScalar(scale);

  // After scaling, recompute for accurate placement
  const scaledBox = new THREE.Box3().setFromObject(model);
  const scaledSize = new THREE.Vector3();
  const scaledCenter = new THREE.Vector3();
  scaledBox.getSize(scaledSize);
  scaledBox.getCenter(scaledCenter);

  // Offset the model so that when the container is at the physics body's center,
  // the model's feet are on the ground (world y=0).
  // Use the actual scaled height to perfectly match the visual to the collider.
  const visualHeight = scaledSize.y || height;
  const bottomY = 0.5;
  // First bring feet to local 0, then lower by half height so feet align with container's center at -h/2.
  // Apply a tiny epsilon to avoid any floating due to rounding.
  const EPS = 0.005;
  model.position.y += -bottomY - visualHeight / 2 - EPS;

  // Enable raycast detection on container and children; set detection type
  container.layers.enable(SENSIBLE_OBJECT_LAYER);
  (container as any).userData.type = DetectionObjectType.PERSON;
  model.traverse(child => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.layers.enable(SENSIBLE_OBJECT_LAYER);
      (mesh as any).userData.type = DetectionObjectType.PERSON;
    }
  });
  container.add(model);

  // If the GLB contains animations, play an Idle pose/loop if available
  if (animations.length > 0) {
    console.log("Person animations available:", animations.map(a => a.name));
    //idle is well present as animations[2]
    const mixer = new THREE.AnimationMixer(model);
    // Prefer a clip named like "Idle" (case-insensitive), else take the first
    const idleClip =
      animations.find(c => /(^|[^a-z])(walk)([^a-z]|$)/i.test(c.name)) || animations[2];
    const action = mixer.clipAction(idleClip);
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();

    // Update mixer each frame using Visual.updateVisual's internal clock
    registerFrameUpdate((dt: number) => mixer.update(dt));
    // Keep references for potential debugging/inspection
    (model as any).userData.mixer = mixer;
    (model as any).userData.idleAction = action;
  }

  // Physics: Capsule collider (cylinder + 2 spheres) aligned on Y for natural contact
  const heightApprox = 1.8;
  const radiusApprox = 0.5;
  const cylHeight = Math.max(0.1, heightApprox - 2 * radiusApprox);
  const cylShape = new CANNON.Cylinder(radiusApprox, radiusApprox, cylHeight, 12);
  const sphereTop = new CANNON.Sphere(radiusApprox);
  const sphereBottom = new CANNON.Sphere(radiusApprox);
  const body = new CANNON.Body({ mass: 70 }); // dynamic so it falls under gravity
  // center the collider vertically; cylinder centered, spheres offset to ends
  body.addShape(cylShape);
  body.addShape(sphereTop, new CANNON.Vec3(0, cylHeight / 2, 0));
  body.addShape(sphereBottom, new CANNON.Vec3(0, -cylHeight / 2, 0));
  // Keep the person upright: allow only yaw rotation
  body.angularFactor.set(0, 1, 0);
  body.linearDamping = 0.1;
  body.angularDamping = 0.6;
  // Spawn slightly above ground so it drops and settles
  const dropOffset = 1.0;
  body.position.set(position.x, heightApprox / 2 + dropOffset, position.z);

  world.addBody(body);

  // Bind visual to physics body so it collides and is animated by the physics step
  pushVisual(body, container, scene);
  // Optional: draw the physics collider in wireframe for debug
  if (VisualMode.showBody) {
    addVisual(body, scene);
  }
}

function buildPlaceholderPerson(height: number): THREE.Group {
  const group = new THREE.Group();
  // Capsule if available, else cylinder + sphere head
  let bodyMesh: THREE.Mesh;
  const material = new THREE.MeshStandardMaterial({ color: 0x7a7cff });
  const capHeight = height * 0.9;
  const capRadius = Math.max(0.16, height / 8);
  const anyThree: any = THREE as any;
  if (anyThree.CapsuleGeometry) {
    const geo = new anyThree.CapsuleGeometry(capRadius, Math.max(0.1, capHeight - 2 * capRadius), 8, 16);
    bodyMesh = new THREE.Mesh(geo, material);
  } else {
    const cyl = new THREE.CylinderGeometry(capRadius, capRadius, capHeight * 0.8, 12);
    bodyMesh = new THREE.Mesh(cyl, material);
    const head = new THREE.Mesh(new THREE.SphereGeometry(capRadius * 0.8, 12, 12), material);
    head.position.y = capHeight * 0.5 + capRadius * 0.8;
    group.add(head);
  }
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);
  return group;
}
