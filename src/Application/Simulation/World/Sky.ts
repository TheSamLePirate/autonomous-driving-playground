import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";

// Paramètres alignés sur le sample three.js sky + sun shader
const skyConfig = {
  turbidity: 1,
  rayleigh: 3.0,
  mieCoefficient: 0.005,
  mieDirectionalG: 0.7,
  elevation: 10, // soleil plus haut dans le ciel
  azimuth: 80 // azimut du soleil (degrés)
};

export function createSky(scene: THREE.Scene) {
  const sky = new Sky();
  // Garder le dôme du ciel dans le plan de coupe far de la caméra (far ~ 1000)
  // Le sample utilise 450000 avec un far géant; ici on reste à 900 pour éviter le clipping.
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

  // Haute définition des ombres (attention à la VRAM)
  sunLight.shadow.mapSize.set(4096, 4096);
  // Légèrement plus doux sans trop baver
  sunLight.shadow.radius = 3;
  // Réduire l'acné et les jaggies avec normalBias + léger bias
  sunLight.shadow.bias = -0.0002;
  (sunLight.shadow as any).normalBias = 0.02;

  // Orthographic shadow camera that covers the track area
  const cam = sunLight.shadow.camera as THREE.OrthographicCamera;
  // Réduire le volume couvert pour augmenter la densité de texels
  const range = 140; // half-extent (au lieu de 200)
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
    new THREE.SphereGeometry(4, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff2c1 })
  );
  disc.position.copy(sunLight.position);
  disc.renderOrder = 999;
  disc.layers.enableAll?.();
  // Draw on top from far distance, shouldn't be occluded in the sky
  (disc.material as THREE.Material).depthTest = false as any;
  //scene.add(disc);

  return sunLight;
}
