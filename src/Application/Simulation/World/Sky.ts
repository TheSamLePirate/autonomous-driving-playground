import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";

// Reusable sky configuration for a realistic mid-day blue sky
const skyConfig = {
  turbidity: 2.0,
  rayleigh: 2.5,
  mieCoefficient: 0.003,
  mieDirectionalG: 0.8,
  elevation: 45, // sun height (degrees)
  azimuth: 180 // sun azimuth (degrees)
};

export function createSky(scene: THREE.Scene) {
  const sky = new Sky();
  // Keep the sky-dome within the camera far plane (far = 1000)
  sky.scale.setScalar(900);

  const uniforms = sky.material.uniforms;
  uniforms["turbidity"].value = skyConfig.turbidity;
  uniforms["rayleigh"].value = skyConfig.rayleigh;
  uniforms["mieCoefficient"].value = skyConfig.mieCoefficient;
  uniforms["mieDirectionalG"].value = skyConfig.mieDirectionalG;

  const phi = THREE.MathUtils.degToRad(90 - skyConfig.elevation);
  const theta = THREE.MathUtils.degToRad(skyConfig.azimuth);
  const sun = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
  uniforms["sunPosition"].value.copy(sun);

  // Force sky-dome to render correctly as background
  (sky.material as THREE.ShaderMaterial).side = THREE.BackSide;
  sky.frustumCulled = false;
  // draw as regular background dome; no need to override depth/renderOrder

  scene.add(sky);
}

// Create a directional light representing the sun, configured to cast soft shadows.
export function createSun(scene: THREE.Scene) {
  const phi = THREE.MathUtils.degToRad(90 - skyConfig.elevation);
  const theta = THREE.MathUtils.degToRad(skyConfig.azimuth);
  const dir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);

  const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
  sunLight.position.copy(dir.clone().multiplyScalar(200)); // place far in the sky
  sunLight.target.position.set(0, 0, 0);
  sunLight.castShadow = true;

  // Higher quality, soft shadows for outdoor scene
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.radius = 2;
  // Reduce self-shadowing acne on detailed models
  sunLight.shadow.bias = -0.0005;

  // Orthographic shadow camera that covers the track area
  const cam = sunLight.shadow.camera as THREE.OrthographicCamera;
  const range = 200; // half-extent
  cam.left = -range;
  cam.right = range;
  cam.top = range;
  cam.bottom = -range;
  cam.near = 1;
  cam.far = 600;
  cam.updateProjectionMatrix();

  scene.add(sunLight);
  scene.add(sunLight.target);

  // Optional: add a visual "sun disc" so users can see the sun position
  const disc = new THREE.Mesh(
    new THREE.SphereGeometry(8, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff2c1 })
  );
  disc.position.copy(sunLight.position);
  disc.renderOrder = 999;
  disc.layers.enableAll?.();
  // Draw on top from far distance, shouldn't be occluded in the sky
  (disc.material as THREE.Material).depthTest = false as any;
  scene.add(disc);

  return sunLight;
}
