import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { starVertexShader, starFragmentShader } from './shaders.js';
import { temperatureToRGB } from '../physics/blackbody.js';

// Full-screen color tint shader for sunglasses effect
const TintShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTintColor: { value: new THREE.Vector3(1, 1, 1) },
    uTintStrength: { value: 0.0 },
    uDarken: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec3 uTintColor;
    uniform float uTintStrength;
    uniform float uDarken;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      // Darken
      color.rgb *= uDarken;
      // Warm tint: blend toward tint color
      color.rgb = mix(color.rgb, color.rgb * uTintColor, uTintStrength);
      gl_FragColor = color;
    }
  `,
};

let scene, camera, renderer, composer, bloomPass, tintPass, controls;
let starMesh, starMaterial;
let baseBloom = 0.8; // target bloom before distance adjustment
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

// --- Photon flux system ---
const MAX_PHOTONS = 2000;
let photonMesh;
let photons = [];
let photonEmissionRate = 200;
let photonAccum = 0;
let photonSpeed = 0.2; // base speed, scales with luminosity

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

  tintPass = new ShaderPass(TintShader);
  composer.addPass(tintPass);

  composer.addPass(new OutputPass());

  // Star sphere — single mesh, no glow shell
  const geometry = new THREE.SphereGeometry(1, 128, 128);

  starMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(1, 0.85, 0.6) },
      uLimbDarkeningCoeff: { value: 0.6 },
      uSpotsVisible: { value: 1.0 },
      uBrightness: { value: 1.0 },
      uTint: { value: new THREE.Vector3(1, 1, 1) },
      uTime: { value: 0.0 },
    },
    vertexShader: starVertexShader,
    fragmentShader: starFragmentShader,
  });

  starMesh = new THREE.Mesh(geometry, starMaterial);
  scene.add(starMesh);

  // Orbit controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.5;
  controls.maxDistance = 20;
  controls.enablePan = false; // keep star centered
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.8;

  // Photon flux particles
  initPhotonSystem();

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

function initPhotonSystem() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(MAX_PHOTONS * 3);
  const opacities = new Float32Array(MAX_PHOTONS);

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));

  const material = new THREE.PointsMaterial({
    size: 0.008,
    sizeAttenuation: true,
    color: 0xffffff,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  photonMesh = new THREE.Points(geometry, material);
  scene.add(photonMesh);

  // Pre-fill arrays
  for (let i = 0; i < MAX_PHOTONS; i++) {
    photons.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0, active: false });
  }
}

function spawnPhoton() {
  // Find an inactive photon slot
  const p = photons.find(p => !p.active);
  if (!p) return;

  // Spawn at star surface — random point on current-scale sphere
  const scale = current.scale;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const surfaceR = scale * 1.02; // just outside the surface

  const nx = Math.sin(phi) * Math.cos(theta);
  const ny = Math.sin(phi) * Math.sin(theta);
  const nz = Math.cos(phi);

  p.x = nx * surfaceR;
  p.y = ny * surfaceR;
  p.z = nz * surfaceR;

  // Radial velocity outward — speed encodes luminosity
  const speed = photonSpeed * (0.8 + Math.random() * 0.4);
  p.vx = nx * speed + (Math.random() - 0.5) * speed * 0.1;
  p.vy = ny * speed + (Math.random() - 0.5) * speed * 0.1;
  p.vz = nz * speed + (Math.random() - 0.5) * speed * 0.1;

  p.maxLife = 2.5 + Math.random() * 2.0;
  p.life = p.maxLife;
  p.active = true;
}

function updatePhotons(dt) {
  const positions = photonMesh.geometry.attributes.position.array;

  // Spawn new photons based on emission rate
  photonAccum += photonEmissionRate * dt;
  while (photonAccum >= 1) {
    spawnPhoton();
    photonAccum -= 1;
  }

  // Update existing photons
  for (let i = 0; i < MAX_PHOTONS; i++) {
    const p = photons[i];
    if (!p.active) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 1000; // move offscreen
      continue;
    }

    p.life -= dt;
    if (p.life <= 0) {
      p.active = false;
      positions[i * 3 + 2] = 1000;
      continue;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;

    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
  }

  photonMesh.geometry.attributes.position.needsUpdate = true;

  // Update photon color to match star
  photonMesh.material.color.setRGB(current.r, current.g, current.b);

  // Fade based on average life fraction
  photonMesh.material.opacity = 0.6;
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

  // Apply color and time
  starMaterial.uniforms.uColor.value.setRGB(current.r, current.g, current.b);
  starMaterial.uniforms.uTime.value = now / 1000.0;

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

  // Bloom strength — reduce when zoomed in so surface detail is visible
  const dist = camera.position.length();
  const distFactor = Math.max(0.2, Math.min(1.0, (dist - 2) / 4));
  bloomPass.strength = current.bloom * distFactor;

  // Orbit controls
  controls.update();

  // Photon flux
  updatePhotons(dt);

  // Rotation
  starMesh.rotation.y += rotationSpeed;

  composer.render();
}

/**
 * Update the star's visual appearance (sets targets, not instant).
 */
export function updateStarAppearance(temperature, radius, luminosity) {
  const rgb = temperatureToRGB(temperature);
  const newScale = 0.5 * Math.pow(Math.max(radius, 0.05), 0.4);

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
  baseBloom = Math.max(0.4, Math.min(1.2, 0.6 + logL * 0.15));
  target.bloom = baseBloom;

  // Photon emission rate scales with luminosity
  photonEmissionRate = Math.max(30, Math.min(1800, 200 + logL * 300));

  // Photon speed encodes luminosity: gentle at 1 L☉, faster at high L
  // logL=0 → 0.15, logL=4 → 0.6
  photonSpeed = Math.max(0.08, Math.min(0.8, 0.15 + logL * 0.1));
}

export function setSunglasses(on) {
  if (tintPass) {
    tintPass.uniforms.uDarken.value = on ? 0.3 : 1.0;
    tintPass.uniforms.uTintStrength.value = on ? 0.8 : 0.0;
    // Warm amber: boost red/green, reduce blue
    tintPass.uniforms.uTintColor.value.set(1.2, 0.9, 0.4);
  }
}

export function setSpotsVisible(visible) {
  spotsVisible = visible;
  if (starMaterial) {
    starMaterial.uniforms.uSpotsVisible.value = visible ? 1.0 : 0.0;
  }
}

export function stopPhotons() {
  photonEmissionRate = 0;
  // Kill all active photons
  for (const p of photons) p.active = false;
}

export function getRendererElement() {
  return renderer?.domElement;
}
