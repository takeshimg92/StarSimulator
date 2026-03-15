import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { starVertexShader, starFragmentShader } from './shaders.js';
import { temperatureToRGB } from '../physics/blackbody.js';

let scene, camera, renderer, composer, bloomPass;
let starMesh, starMaterial;
let rotationSpeed = 0.002;

// --- Smooth transition state ---
// Current (displayed) values lerp toward target values each frame
const current = { scale: 1.0, r: 1, g: 0.85, b: 0.6, bloom: 1.5 };
const target = { scale: 1.0, r: 1, g: 0.85, b: 0.6, bloom: 1.5 };
const velocity = { scale: 0, r: 0, g: 0, b: 0, bloom: 0 };

// Spring parameters: stiffness and damping for a critically-damped feel
const SPRING_K = 12;   // stiffness
const SPRING_D = 7;    // damping

// Wobble state — triggered on parameter change
let wobbleAmount = 0;
let wobbleDecay = 0;
let wobblePhase = 0;

// Spots visibility (toggled from UI)
let spotsVisible = true;

export function initRenderer(container) {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  camera.position.z = 5;

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.LinearToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  // Post-processing: render → bloom → output
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    0.8,   // strength — subtle glow
    0.15,  // radius — tight halo
    0.3    // threshold
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  // Star sphere — single mesh, no glow shell
  const geometry = new THREE.SphereGeometry(1, 64, 64);

  starMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(1, 0.85, 0.6) },
      uLimbDarkeningCoeff: { value: 0.6 },
      uSpotsVisible: { value: 1.0 },
      uBrightness: { value: 1.0 },
    },
    vertexShader: starVertexShader,
    fragmentShader: starFragmentShader,
  });

  starMesh = new THREE.Mesh(geometry, starMaterial);
  scene.add(starMesh);

  addStarfield();

  const onResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloomPass.resolution.set(w, h);
  };
  window.addEventListener('resize', onResize);

  animate();
}

function addStarfield() {
  const starCount = 4000;
  const positions = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  const colors = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 40 + Math.random() * 60;
    const i3 = i * 3;
    positions[i3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = r * Math.cos(phi);

    // Varied sizes: mostly tiny, a few brighter
    const rand = Math.random();
    sizes[i] = rand < 0.9 ? 0.05 + Math.random() * 0.1 : 0.15 + Math.random() * 0.2;

    // Slight color variation: warm white to cool blue-white
    const warmth = 0.7 + Math.random() * 0.3;
    colors[i3] = warmth;
    colors[i3 + 1] = warmth;
    colors[i3 + 2] = 0.8 + Math.random() * 0.2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.12,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
  });
  scene.add(new THREE.Points(geometry, material));
}

let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05); // cap at 50ms
  lastTime = now;

  // Spring-based interpolation for each property
  for (const key of Object.keys(current)) {
    const displacement = target[key] - current[key];
    const springForce = SPRING_K * displacement;
    const dampingForce = SPRING_D * velocity[key];
    const acceleration = springForce - dampingForce;
    velocity[key] += acceleration * dt;
    current[key] += velocity[key] * dt;
  }

  // Apply color
  starMaterial.uniforms.uColor.value.setRGB(current.r, current.g, current.b);

  // Apply scale with wobble
  let scale = current.scale;
  if (wobbleAmount > 0.001) {
    wobblePhase += dt * 12; // wobble frequency
    wobbleDecay *= Math.pow(0.15, dt); // exponential decay
    const wobble = wobbleAmount * wobbleDecay * Math.sin(wobblePhase);
    // Wobble deforms slightly along different axes
    starMesh.scale.set(
      scale * (1 + wobble * 0.8),
      scale * (1 - wobble * 0.5),
      scale * (1 + wobble * 0.3)
    );
  } else {
    starMesh.scale.setScalar(scale);
    wobbleAmount = 0;
  }

  // Bloom strength
  bloomPass.strength = current.bloom;

  // Rotation
  starMesh.rotation.y += rotationSpeed;

  composer.render();
}

/**
 * Update the star's visual appearance (sets targets, not instant).
 */
export function updateStarAppearance(temperature, radius, luminosity) {
  const rgb = temperatureToRGB(temperature);
  const newScale = Math.pow(Math.max(radius, 0.05), 0.4);

  // Detect if there's a meaningful change → trigger wobble
  const scaleDelta = Math.abs(newScale - target.scale);
  const colorDelta = Math.abs(rgb.r - target.r) + Math.abs(rgb.g - target.g) + Math.abs(rgb.b - target.b);
  if (scaleDelta > 0.02 || colorDelta > 0.05) {
    wobbleAmount = Math.min(scaleDelta * 0.5 + colorDelta * 0.1, 0.15);
    wobbleDecay = 1.0;
    wobblePhase = 0;
  }

  // Set targets — the animation loop will smoothly approach these
  target.r = rgb.r;
  target.g = rgb.g;
  target.b = rgb.b;
  target.scale = newScale;

  // Bloom scales mildly with luminosity
  const L_sun = 3.828e26;
  const logL = Math.log10(Math.max(luminosity, 1e20) / L_sun);
  target.bloom = Math.max(0.4, Math.min(1.2, 0.6 + logL * 0.15));
}

export function setSunglasses(on) {
  if (starMaterial) {
    starMaterial.uniforms.uBrightness.value = on ? 0.25 : 1.0;
  }
}

export function setSpotsVisible(visible) {
  spotsVisible = visible;
  if (starMaterial) {
    starMaterial.uniforms.uSpotsVisible.value = visible ? 1.0 : 0.0;
  }
}

export function getRendererElement() {
  return renderer?.domElement;
}
