import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { starVertexShader, starFragmentShader } from './shaders.js';
import { temperatureToRGB } from '../physics/blackbody.js';

// Gravitational lensing post-processing shader
const LensingShader = {
  uniforms: {
    tDiffuse: { value: null },
    uBHScreenPos: { value: new THREE.Vector2(0.5, 0.5) },
    uBHScreenRadius: { value: 0.0 },
    uStrength: { value: 0.0 },
    uAspect: { value: 1.0 },  // width/height for circular correction
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
    uniform vec2 uBHScreenPos;
    uniform float uBHScreenRadius;
    uniform float uStrength;
    uniform float uAspect;
    varying vec2 vUv;

    void main() {
      if (uStrength < 0.001) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }

      // Correct for aspect ratio so the BH shadow and ring are circular
      vec2 aspectCorrect = vec2(uAspect, 1.0);
      vec2 delta = (vUv - uBHScreenPos) * aspectCorrect;
      float dist = length(delta);
      float rEH = uBHScreenRadius * uAspect; // corrected for aspect
      float rPhoton = rEH * 1.5;
      float rLens = rEH * 5.0;

      vec2 uv = vUv;

      if (dist > rEH * 0.8 && dist < rLens) {
        // Gravitational lensing: to show objects displaced AROUND the BH,
        // we sample INWARD (toward the BH center). This makes the pixel
        // show light that was bent around from behind the BH.
        vec2 dir = normalize(delta);
        float deflection = uStrength * rEH * rEH / (dist * dist + rEH * 0.5);
        deflection *= smoothstep(rLens, rLens * 0.3, dist);
        // Sample inward (toward BH) — undo the aspect correction for UV offset
        uv = vUv - (dir / aspectCorrect) * deflection;
      }

      vec4 color = texture2D(tDiffuse, uv);

      // Pure black inside event horizon
      if (dist < rEH) {
        color.rgb = vec3(0.0);
      } else if (dist < rEH * 1.15) {
        color.rgb *= smoothstep(rEH, rEH * 1.15, dist);
      }

      // Thin photon ring at 1.5× rEH
      float ring = exp(-pow((dist - rPhoton) / (rEH * 0.03), 2.0));
      color.rgb += vec3(0.3, 0.4, 0.6) * ring * uStrength * 0.5;

      gl_FragColor = color;
    }
  `,
};

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

let scene, camera, renderer, composer, bloomPass, tintPass, lensingPass, controls;
let starMesh, starMaterial, starfieldMesh;
let baseBloom = 0.8;
let rotationSpeed = 0.002;
const STARFIELD_BASE_SPEED = 0.00015; // gentle ambient rotation
let starfieldRotationSpeed = 0; // additional speed from time evolution
let frozen = false; // true when star has died

// Slice view state
let sliceEnabled = false;
let crossSectionGroup = null;
let csCanvas = null, csCtx = null, csTexture = null;
const CS_SIZE = 512;
const CS_HALF = CS_SIZE / 2;
let csProfiles = null;
let csMass = 1.0;
let csEvolutionState = null;  // { heCoreM, phase, Xc, Yc } from MIST track

// --- Smooth transition state ---
const current = { scale: 1.0, r: 1, g: 0.85, b: 0.6, bloom: 1.5 };
const target = { scale: 1.0, r: 1, g: 0.85, b: 0.6, bloom: 1.5 };
const velocity = { scale: 0, r: 0, g: 0, b: 0, bloom: 0 };

const SPRING_K = 12;
const SPRING_D = 7;

// Auto-zoom: camera pulls back as the star grows
const DEFAULT_CAMERA_Z = 5;
let targetCameraZ = DEFAULT_CAMERA_Z;
let currentPhysicalRadius = 1.0; // R☉, for scale bar
let autoZoomEnabled = false; // only true during time evolution

// Star trail lines (long-exposure effect during auto-zoom)
let starTrailMesh = null;
let prevCameraPos = null;
let trailOpacity = 0; // fades in/out

// Black hole / remnant state
let blackHoleActive = false;
let remnantType = null; // null, 'blackhole', 'neutronstar', 'whitedwarf'
let photonSphereMesh = null;

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

  lensingPass = new ShaderPass(LensingShader);
  composer.addPass(lensingPass);

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
      uSliceEnabled: { value: 0.0 },
    },
    vertexShader: starVertexShader,
    fragmentShader: starFragmentShader,
  });

  starMesh = new THREE.Mesh(geometry, starMaterial);
  scene.add(starMesh);

  // Cross-section: single canvas-textured disc with radial gradient + convection
  crossSectionGroup = new THREE.Group();
  crossSectionGroup.visible = false;

  csCanvas = document.createElement('canvas');
  csCanvas.width = CS_SIZE;
  csCanvas.height = CS_SIZE;
  csCtx = csCanvas.getContext('2d');

  csTexture = new THREE.CanvasTexture(csCanvas);
  csTexture.minFilter = THREE.LinearFilter;

  const discGeo = new THREE.CircleGeometry(1.0, 128);
  const discMat = new THREE.MeshBasicMaterial({
    map: csTexture,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const disc = new THREE.Mesh(discGeo, discMat);
  crossSectionGroup.add(disc);

  scene.add(crossSectionGroup);

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
    const r = 150 + Math.random() * 200;
    const i3 = i * 3;
    positions[i3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = r * Math.cos(phi);

    // Varied sizes: mostly tiny, a few brighter
    const rand = Math.random();
    sizes[i] = rand < 0.9 ? 0.15 + Math.random() * 0.3 : 0.5 + Math.random() * 0.6;

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
    size: 0.4,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
  });
  starfieldMesh = new THREE.Points(geometry, material);
  scene.add(starfieldMesh);

  // Star trail lines: 2 vertices per star (current pos + offset pos)
  // During auto-zoom, each line stretches radially from screen center
  const trailPositions = new Float32Array(starCount * 6); // 2 * 3 per star
  const trailColors = new Float32Array(starCount * 6);
  for (let i = 0; i < starCount; i++) {
    const i6 = i * 6;
    const i3 = i * 3;
    // Both endpoints start at the star's position (zero-length line)
    trailPositions[i6] = positions[i3];
    trailPositions[i6 + 1] = positions[i3 + 1];
    trailPositions[i6 + 2] = positions[i3 + 2];
    trailPositions[i6 + 3] = positions[i3];
    trailPositions[i6 + 4] = positions[i3 + 1];
    trailPositions[i6 + 5] = positions[i3 + 2];
    // Same color as the star
    trailColors[i6] = colors[i3];
    trailColors[i6 + 1] = colors[i3 + 1];
    trailColors[i6 + 2] = colors[i3 + 2];
    trailColors[i6 + 3] = colors[i3];
    trailColors[i6 + 4] = colors[i3 + 1];
    trailColors[i6 + 5] = colors[i3 + 2];
  }
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
  const trailMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    linewidth: 1,
  });
  starTrailMesh = new THREE.LineSegments(trailGeo, trailMat);
  scene.add(starTrailMesh);
}

/**
 * Phase-aware zone structure from MIST evolution state.
 * Returns { coreR, convInner, convOuter, coreConvective, shells, coreColor }
 */
function getZoneStructure(mass, evoState) {
  // Fallback: mass-only (static mode, no MIST data)
  if (!evoState || evoState.phase === undefined) {
    if (mass >= 1.3) {
      const coreConvR = Math.min(0.5, 0.2 + 0.1 * (mass - 1.3));
      return { coreR: 0.25, convInner: 0, convOuter: coreConvR, coreConvective: true, shells: [], coreColor: { r: 1, g: 1, b: 0.94 } };
    }
    const envConvR = Math.max(0.4, 0.7 - 0.2 * (1.0 - mass));
    return { coreR: 0.25, convInner: envConvR, convOuter: 1.0, coreConvective: false, shells: [], coreColor: { r: 1, g: 1, b: 0.94 } };
  }

  const { heCoreM, phase, Xc, Yc } = evoState;

  // Core radius from He core mass fraction
  const coreMassFrac = mass > 0 ? (heCoreM || 0) / mass : 0;
  const coreR = coreMassFrac > 0.01
    ? Math.max(0.06, Math.min(0.45, 0.25 * Math.pow(coreMassFrac, 0.35)))
    : (mass >= 1.3 ? 0.15 : 0.08);

  // Core color from composition
  const hFrac = Math.min(1, (Xc || 0) / 0.72);
  const cFrac = Math.max(0, 1 - (Xc || 0) / 0.72 - (Yc || 0) / 0.98);
  const coreColor = {
    r: 1.0,
    g: 1.0 - 0.15 * cFrac,
    b: 1.0 - 0.2 * (1 - hFrac) - 0.3 * cFrac,
  };

  let convInner, convOuter, coreConvective;
  const shells = [];

  switch (phase) {
    case -1: // PMS: deep or full convection
      convInner = 0;
      convOuter = 1.0;
      coreConvective = true;
      break;

    case 0: // MS
      if (mass >= 1.3) {
        coreConvective = true;
        convInner = 0;
        convOuter = Math.min(0.5, 0.15 + 0.1 * (mass - 1.3));
      } else {
        coreConvective = false;
        convInner = Math.max(0.4, 0.7 - 0.2 * (1.0 - mass));
        convOuter = 1.0;
      }
      // Late MS: faint H-shell forming
      if (Xc < 0.2) {
        shells.push({ rFrac: coreR, width: 0.012, intensity: 0.3 * (1 - Xc / 0.2), color: 'H' });
      }
      break;

    case 2: // Subgiant / RGB: deep convective envelope, H-shell burning
      coreConvective = false;
      // Convection deepens as star ascends RGB
      convInner = Math.max(coreR + 0.04, 0.15 + 0.35 * Math.max(0, Xc));
      convOuter = 1.0;
      shells.push({ rFrac: coreR, width: 0.015, intensity: 0.8, color: 'H' });
      break;

    case 3: // Core He burning (HB)
      coreConvective = false;
      convInner = Math.max(coreR + 0.08, 0.25);
      convOuter = 1.0;
      shells.push({ rFrac: coreR + 0.03, width: 0.012, intensity: 0.5, color: 'H' });
      break;

    case 4: // Early AGB: deep envelope convection, H + He shells
      coreConvective = false;
      convInner = coreR + 0.04;
      convOuter = 1.0;
      shells.push({ rFrac: coreR + 0.03, width: 0.012, intensity: 0.6, color: 'H' });
      shells.push({ rFrac: coreR * 0.7, width: 0.008, intensity: 0.4, color: 'He' });
      break;

    case 5: // TP-AGB: similar to EAGB
    case 6: // Post-AGB
      coreConvective = false;
      convInner = coreR + 0.03;
      convOuter = 1.0;
      shells.push({ rFrac: coreR + 0.02, width: 0.01, intensity: 0.5, color: 'H' });
      shells.push({ rFrac: coreR * 0.6, width: 0.008, intensity: 0.3, color: 'He' });
      break;

    case 9: // Wolf-Rayet
      coreConvective = true;
      convInner = 0;
      convOuter = 0.5;
      break;

    default:
      coreConvective = false;
      convInner = 0.7;
      convOuter = 1.0;
  }

  return { coreR, convInner, convOuter, coreConvective, shells, coreColor };
}

/**
 * Simple 1D hash for deterministic pseudo-random per-cell values.
 */
function hashf(n) {
  return ((Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;
}

/**
 * Draw the cross-section canvas: radial temperature gradient, boundary rings,
 * and animated convection cells in the appropriate zone.
 */
function drawCrossSection(time) {
  if (!csCtx) return;

  const ctx = csCtx;
  const R = CS_HALF;
  ctx.clearRect(0, 0, CS_SIZE, CS_SIZE);

  // Remnant states: simple fills
  if (remnantType === 'blackhole') {
    // Fully transparent — nothing to draw
    return;
  }
  if (remnantType === 'neutronstar' || remnantType === 'whitedwarf') {
    // Pure white filled circle
    ctx.beginPath();
    ctx.arc(R, R, R * 0.95, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(220, 230, 255, 0.9)';
    ctx.fill();
    // Label
    ctx.font = '14px Inter, monospace';
    ctx.fillStyle = 'rgba(100, 120, 180, 0.6)';
    ctx.textAlign = 'center';
    ctx.fillText(remnantType === 'neutronstar' ? 'Neutron star' : 'White dwarf', R, R + 5);
    ctx.textAlign = 'start';
    csTexture.needsUpdate = true;
    return;
  }

  if (!csProfiles) return;

  const profiles = csProfiles;
  const numR = profiles.r.length;
  const zone = getZoneStructure(csMass, csEvolutionState);

  // --- Radial gradient background ---
  // Hot interior is pushed toward white; only the outer layers show color.
  const steps = 80;
  for (let i = steps - 1; i >= 0; i--) {
    const rFrac = (i + 0.5) / steps;
    const profIdx = Math.min(numR - 1, Math.round(rFrac * (numR - 1)));
    let T = profiles.T[profIdx];
    if (T < 3000) T = 3000;

    const rgb = temperatureToRGB(T);
    // Desaturate toward white for interior (hot plasma is nearly white)
    const whiteness = Math.max(0, 1 - rFrac * 1.5); // 1 at center, 0 at r/R=0.67+
    const cr = rgb.r + (1 - rgb.r) * whiteness * 0.7;
    const cg = rgb.g + (1 - rgb.g) * whiteness * 0.7;
    const cb = rgb.b + (1 - rgb.b) * whiteness * 0.7;
    const brightness = rFrac < 0.25 ? 0.95 : (0.85 - 0.3 * (rFrac - 0.25));

    ctx.beginPath();
    ctx.arc(R, R, rFrac * R + R / steps, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${Math.round(cr * brightness * 255)}, ${Math.round(cg * brightness * 255)}, ${Math.round(cb * brightness * 255)})`;
    ctx.fill();
  }

  // --- Radiative pulses: concentric rings expanding outward ---
  // In radiative zones, energy is carried by photon diffusion. We show this
  // as faint concentric rings that drift outward and fade.
  const NUM_PULSES = 6;
  const pulsePeriod = 4.0; // seconds for one pulse to cross the zone

  // Determine radiative zone extent(s)
  const radZones = [];
  if (zone.coreConvective) {
    // Massive star: radiative envelope from convOuter to 1.0
    if (zone.convOuter < 0.95) radZones.push({ r0: zone.convOuter, r1: 0.95 });
  } else {
    // Radiative zone from core boundary to convInner
    if (zone.convInner > zone.coreR + 0.05) radZones.push({ r0: zone.coreR, r1: zone.convInner });
  }

  for (const rz of radZones) {
    const rzThickness = rz.r1 - rz.r0;
    for (let pi = 0; pi < NUM_PULSES; pi++) {
      // Each pulse travels outward over pulsePeriod, staggered in phase
      const phase = (pi / NUM_PULSES);
      const t = ((time / pulsePeriod + phase) % 1.0); // 0→1 across zone
      const rFrac = rz.r0 + rzThickness * t;
      const rPx = rFrac * R;

      // Fade in at birth, fade out at death
      const fadeIn = Math.min(1, t * 5);        // quick fade in over first 20%
      const fadeOut = Math.min(1, (1 - t) * 4);  // fade out over last 25%
      const alpha = 0.12 * fadeIn * fadeOut;

      if (alpha < 0.005) continue;

      ctx.beginPath();
      ctx.arc(R, R, rPx, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 245, 220, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.0;
      ctx.stroke();
    }
  }

  // --- Convection flowlines ---
  const convR0 = zone.convInner;
  const convR1 = zone.convOuter;
  const convThickness = convR1 - convR0;

  if (convThickness > 0.05) {
    // Many convection cells with randomized sizes, depths, speeds, loop counts.
    // Each cell is a closed circulation loop drawn as animated dashed streamlines.
    const NUM_CELLS = Math.round(80 + 40 * convThickness);

    for (let ci = 0; ci < NUM_CELLS; ci++) {
      // --- Per-cell randomized properties ---
      const h0 = hashf(ci);
      const h1 = hashf(ci + 100);
      const h2 = hashf(ci + 200);
      const h3 = hashf(ci + 300);
      const h4 = hashf(ci + 400);
      const h5 = hashf(ci + 500);
      const h6 = hashf(ci + 600);

      // Angular position and width: variable-width cells
      const baseAngle = (ci / NUM_CELLS) * Math.PI * 2 + (h0 - 0.5) * 0.15;
      const cellSpan = (Math.PI * 2 / NUM_CELLS) * (0.6 + h1 * 0.8); // 60–140% of even spacing

      const cellStart = baseAngle - cellSpan / 2;
      const cellEnd = baseAngle + cellSpan / 2;

      // Radial extent: some cells are shallow, some deep
      const depthFrac = 0.4 + h2 * 0.55; // 40–95% of zone thickness
      const rInnerBase = convR0 + convThickness * (1 - depthFrac) * h3 * 0.5;
      const rOuterBase = convR1 - convThickness * (1 - depthFrac) * (1 - h3) * 0.3;

      // Number of nested loops: 1–4
      const numLoops = 1 + Math.floor(h4 * 3.5);

      // Flow speed and direction
      const cw = h5 > 0.5;
      const speed = 25 + h6 * 40; // 25–65 px/s

      // Dash pattern varies per cell
      const dashLen = 5 + h0 * 8;
      const gapLen = 8 + h1 * 10;

      for (let li = 0; li < numLoops; li++) {
        const loopFrac = (li + 1) / (numLoops + 1);
        const rInner = rInnerBase + (rOuterBase - rInnerBase) * loopFrac * 0.3;
        const rOuter = rOuterBase - (rOuterBase - rInnerBase) * loopFrac * 0.12;
        const aInset = cellSpan * loopFrac * 0.1;
        const a0 = cellStart + aInset;
        const a1 = cellEnd - aInset;
        const cellMid = (a0 + a1) / 2;

        const offset = time * speed * (cw ? 1 : -1) + li * 25 + ci * 13;
        const alpha = 0.18 + 0.15 * (1 - li / numLoops);
        const lineW = 0.8 + 0.6 * (1 - li / numLoops);

        ctx.lineWidth = lineW;
        ctx.setLineDash([dashLen, gapLen]);
        ctx.lineDashOffset = -offset;
        ctx.strokeStyle = `rgba(255, 225, 180, ${alpha.toFixed(2)})`;

        // Draw the entire loop as a smooth closed cardinal spline.
        // Sample points around an oval path in polar coords, then
        // connect with the midpoint-quadratic technique for a smooth curve.
        const iA1 = a1 - (a1 - cellMid) * 0.35;
        const iA0 = a0 + (cellMid - a0) * 0.35;
        const N = 24; // sample points around the loop
        const pts = [];

        // Angular noise amplitude — scales with cell span so it's proportional
        const noiseAmp = cellSpan * 0.25;

        for (let s = 0; s < N; s++) {
          const t = s / N; // 0..1 around the loop
          let r, a;
          if (t < 0.35) {
            const f = t / 0.35;
            r = rOuter;
            a = cw ? (a0 + (a1 - a0) * f) : (a1 + (a0 - a1) * f);
          } else if (t < 0.50) {
            const f = (t - 0.35) / 0.15;
            const sf = f * f * (3 - 2 * f);
            r = rOuter + (rInner - rOuter) * sf;
            const aFrom = cw ? a1 : a0;
            const aTo = cw ? iA1 : iA0;
            a = aFrom + (aTo - aFrom) * sf;
          } else if (t < 0.85) {
            const f = (t - 0.50) / 0.35;
            r = rInner;
            a = cw ? (iA1 + (iA0 - iA1) * f) : (iA0 + (iA1 - iA0) * f);
          } else {
            const f = (t - 0.85) / 0.15;
            const sf = f * f * (3 - 2 * f);
            r = rInner + (rOuter - rInner) * sf;
            const aFrom = cw ? iA0 : iA1;
            const aTo = cw ? a0 : a1;
            a = aFrom + (aTo - aFrom) * sf;
          }
          // Per-point angular noise — deterministic from cell + point index + slow time drift
          const noise = (hashf(ci * 100 + s) - 0.5) * 2; // -1..1
          const timeDrift = Math.sin(time * 0.4 + ci * 1.7 + s * 0.8) * 0.5;
          a += (noise + timeDrift) * noiseAmp;

          pts.push({ x: R + r * R * Math.cos(a), y: R + r * R * Math.sin(a) });
        }

        // Draw smooth closed curve through pts using midpoint quadratics
        ctx.beginPath();
        const p0 = pts[0], pN = pts[N - 1];
        ctx.moveTo((pN.x + p0.x) / 2, (pN.y + p0.y) / 2);
        for (let s = 0; s < N; s++) {
          const next = pts[(s + 1) % N];
          ctx.quadraticCurveTo(pts[s].x, pts[s].y, (pts[s].x + next.x) / 2, (pts[s].y + next.y) / 2);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }

  // --- Pulsating core glow (uses zone.coreR and zone.coreColor) ---
  const corePulse = 0.9 + 0.1 * Math.sin(time * 1.5);
  const cc = zone.coreColor || { r: 1, g: 1, b: 0.94 };
  const coreGlowR = zone.coreR * R * 1.3;
  const coreGrad = ctx.createRadialGradient(R, R, zone.coreR * R * 0.5, R, R, coreGlowR);
  coreGrad.addColorStop(0, `rgba(${Math.round(cc.r*255)}, ${Math.round(cc.g*255)}, ${Math.round(cc.b*255)}, ${(0.25 * corePulse).toFixed(3)})`);
  coreGrad.addColorStop(0.6, `rgba(${Math.round(cc.r*240)}, ${Math.round(cc.g*240)}, ${Math.round(cc.b*220)}, ${(0.1 * corePulse).toFixed(3)})`);
  coreGrad.addColorStop(1, 'rgba(255, 240, 200, 0)');
  ctx.beginPath();
  ctx.arc(R, R, coreGlowR, 0, Math.PI * 2);
  ctx.fillStyle = coreGrad;
  ctx.fill();

  // --- Core boundary glow ---
  const coreBndR = zone.coreR * R;
  const coreBndW = R * 0.03;
  const coreBndGrad = ctx.createRadialGradient(R, R, coreBndR - coreBndW, R, R, coreBndR + coreBndW);
  coreBndGrad.addColorStop(0, 'rgba(255, 255, 220, 0)');
  coreBndGrad.addColorStop(0.45, 'rgba(255, 255, 220, 0.2)');
  coreBndGrad.addColorStop(0.55, 'rgba(255, 255, 220, 0.2)');
  coreBndGrad.addColorStop(1, 'rgba(255, 255, 220, 0)');
  ctx.beginPath();
  ctx.arc(R, R, coreBndR + coreBndW, 0, Math.PI * 2);
  ctx.fillStyle = coreBndGrad;
  ctx.fill();

  // --- Shell burning rings ---
  for (const shell of zone.shells || []) {
    const shellR = shell.rFrac * R;
    const shellW = shell.width * R;
    const pulse = 0.85 + 0.15 * Math.sin(time * 2.5 + shell.rFrac * 10);
    const alpha = shell.intensity * pulse;
    const shellColor = shell.color === 'H'
      ? `rgba(255, 240, 200, ${alpha.toFixed(3)})`
      : `rgba(200, 220, 255, ${alpha.toFixed(3)})`;

    const shellGrad = ctx.createRadialGradient(R, R, Math.max(0, shellR - shellW), R, R, shellR + shellW);
    shellGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    shellGrad.addColorStop(0.35, shellColor);
    shellGrad.addColorStop(0.65, shellColor);
    shellGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.beginPath();
    ctx.arc(R, R, shellR + shellW, 0, Math.PI * 2);
    ctx.fillStyle = shellGrad;
    ctx.fill();
  }

  // --- Convection zone boundary glow ---
  const convBndR = (zone.coreConvective ? zone.convOuter : zone.convInner) * R;
  const convBndW = R * 0.025;
  const convBndGrad = ctx.createRadialGradient(R, R, convBndR - convBndW, R, R, convBndR + convBndW);
  convBndGrad.addColorStop(0, 'rgba(255, 200, 120, 0)');
  convBndGrad.addColorStop(0.4, 'rgba(255, 200, 120, 0.15)');
  convBndGrad.addColorStop(0.6, 'rgba(255, 200, 120, 0.15)');
  convBndGrad.addColorStop(1, 'rgba(255, 200, 120, 0)');
  ctx.beginPath();
  ctx.arc(R, R, convBndR + convBndW, 0, Math.PI * 2);
  ctx.fillStyle = convBndGrad;
  ctx.fill();

  csTexture.needsUpdate = true;
}

export { getZoneStructure };
export function getRemnantType() { return remnantType; }

export function setCrossSectionProfiles(profiles, mass, evolutionState) {
  csProfiles = profiles;
  if (mass !== undefined) csMass = mass;
  if (evolutionState) csEvolutionState = evolutionState;
}

let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05); // cap at 50ms
  lastTime = now;

  // Adaptive spring: stiffer when the target is changing fast (rapid evolution).
  // Measure how far the scale target is from current — large gap means we're
  // falling behind and need to catch up.
  const scaleGap = Math.abs(target.scale - current.scale);
  const urgency = Math.min(scaleGap / 0.1, 5); // 0 = gentle, 5 = snappy
  const adaptK = SPRING_K + urgency * 20;       // 12 → up to 112
  const adaptD = SPRING_D + urgency * 10;       // 7 → up to 57

  for (const key of Object.keys(current)) {
    const displacement = target[key] - current[key];
    const springForce = adaptK * displacement;
    const dampingForce = adaptD * velocity[key];
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

  // Sync cross-section with star scale and redraw canvas texture
  if (crossSectionGroup && sliceEnabled) {
    crossSectionGroup.scale.setScalar(scale);
    drawCrossSection(now / 1000);
  }

  // Auto-zoom: push out during evolution, pull in during collapse/supernova.
  const currentCamDist = camera.position.length();
  let newDist = currentCamDist;
  if (autoZoomEnabled) {
    const desiredDist = Math.max(controls.minDistance, targetCameraZ);
    const desiredDist2 = Math.max(desiredDist, currentCamDist); // never pull in
    const gap = desiredDist2 - currentCamDist;
    if (gap > 0.1) {
      const camDir = camera.position.clone().normalize();
      const rate = 0.3;
      newDist = currentCamDist + gap * rate;
      camera.position.copy(camDir.multiplyScalar(newDist));
    }
  }

  // Star trails: radial streaks during auto-zoom (long-exposure effect).
  if (starTrailMesh && starfieldMesh) {
    const cameraMoved = Math.abs(newDist - currentCamDist);
    const isZooming = autoZoomEnabled && cameraMoved > 0.05;

    // Snap opacity on/off for a sharp warp-speed effect
    const targetOpacity = isZooming ? 0.7 : 0;
    trailOpacity += (targetOpacity - trailOpacity) * Math.min(1, dt * 10);
    starTrailMesh.material.opacity = trailOpacity;
    starTrailMesh.visible = trailOpacity > 0.005;

    if (trailOpacity > 0.005) {
      // Streak as a percentage of star distance — big moves = long streaks
      const streakFraction = Math.min(0.3, cameraMoved * 0.8);
      const camPos = camera.position;

      const starPositions = starfieldMesh.geometry.attributes.position.array;
      const trailPositions = starTrailMesh.geometry.attributes.position.array;
      const count = starPositions.length / 3;

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const i6 = i * 6;
        const sx = starPositions[i3], sy = starPositions[i3 + 1], sz = starPositions[i3 + 2];

        trailPositions[i6] = sx;
        trailPositions[i6 + 1] = sy;
        trailPositions[i6 + 2] = sz;

        // Extend radially away from camera by a fraction of the star's distance
        const dx = sx - camPos.x, dy = sy - camPos.y, dz = sz - camPos.z;
        trailPositions[i6 + 3] = sx + dx * streakFraction;
        trailPositions[i6 + 4] = sy + dy * streakFraction;
        trailPositions[i6 + 5] = sz + dz * streakFraction;
      }
      starTrailMesh.geometry.attributes.position.needsUpdate = true;
    }
  }

  // Update orbit controls limits — always allow zooming well beyond the star
  controls.minDistance = Math.max(1.5, scale * 1.2);
  controls.maxDistance = 120; // stay inside the starfield sphere (r=150)

  // Bloom strength — reduce when zoomed in so surface detail is visible
  const dist = newDist;
  const distFactor = Math.max(0.2, Math.min(1.0, (dist - scale * 2) / (scale * 4)));
  bloomPass.strength = current.bloom * distFactor;

  // Orbit controls
  controls.update();

  // End-of-life animation (supernova/collapse)
  if (supernovaActive) {
    updateEndOfLife(dt);
    updatePhotons(dt);
  }

  if (!frozen && !supernovaActive) {
    // Photon flux
    updatePhotons(dt);

    // Rotation
    starMesh.rotation.y += rotationSpeed;

    // Starfield counter-rotation: ambient + time evolution boost
    if (starfieldMesh) {
      starfieldMesh.rotation.y -= (STARFIELD_BASE_SPEED + starfieldRotationSpeed * dt);
    }
  }

  // Black hole lensing + photon sphere
  if (lensingPass) {
    if (blackHoleActive) {
      // Project BH position (origin) to screen space
      const bhPos = new THREE.Vector3(0, 0, 0);
      bhPos.project(camera);
      const screenX = (bhPos.x + 1) / 2;
      const screenY = (bhPos.y + 1) / 2;
      lensingPass.uniforms.uBHScreenPos.value.set(screenX, screenY);

      // Event horizon screen radius: project the star's visual scale to screen
      const camDist = camera.position.length();
      const fovRad = camera.fov * Math.PI / 180;
      const screenH = 2 * camDist * Math.tan(fovRad / 2);
      const bhScreenR = scale / screenH; // fraction of screen height
      lensingPass.uniforms.uBHScreenRadius.value = bhScreenR;
      lensingPass.uniforms.uAspect.value = camera.aspect;

      // Fade lensing in smoothly
      const curStr = lensingPass.uniforms.uStrength.value;
      lensingPass.uniforms.uStrength.value = curStr + (1 - curStr) * Math.min(1, dt * 2);

    } else {
      // Fade lensing out
      const curStr = lensingPass.uniforms.uStrength.value;
      if (curStr > 0.001) {
        lensingPass.uniforms.uStrength.value = curStr * Math.pow(0.01, dt);
      } else {
        lensingPass.uniforms.uStrength.value = 0;
      }
    }
  }

  composer.render();

  // Per-frame callback (scale bar, etc.)
  if (onFrameCallback) onFrameCallback();
}

/**
 * Update the star's visual appearance (sets targets, not instant).
 */
export function updateStarAppearance(temperature, radius, luminosity) {
  const rgb = temperatureToRGB(temperature);
  currentPhysicalRadius = radius;

  // Visual scale: continuous power law.
  const r = Math.max(radius, 0.05);
  const newScale = 0.5 * Math.pow(r, 0.7);

  // Camera auto-zoom: let the star grow until it fills ~50% of the view,
  // then zoom out aggressively to give plenty of runway.
  const fillRatio = newScale / Math.max(camera.position.length(), 1);
  if (fillRatio > 0.5) {
    // Overshoot: zoom to where star fills only ~4% of the view.
    // Capped to stay inside the starfield.
    targetCameraZ = Math.min(100, Math.max(targetCameraZ, newScale / 0.04));
  }

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
  for (const p of photons) p.active = false;
}

export function freezeStar() {
  frozen = true;
  stopPhotons();
}

export function unfreezeStar() {
  frozen = false;
  supernovaActive = false;
  supernovaTime = 0;
  blackHoleActive = false;
  remnantType = null;
  // Restore brightness and targets that SN/WD collapse may have modified
  if (starMaterial) {
    starMaterial.uniforms.uBrightness.value = 1.0;
  }
  // Deactivate BH visuals
  if (lensingPass) {
    lensingPass.uniforms.uStrength.value = 0;
  }
  targetCameraZ = DEFAULT_CAMERA_Z;
}

// --- Supernova / collapse animation ---
let supernovaActive = false;
let supernovaTime = 0;
let supernovaDuration = 3.0;
let supernovaMass = 1.0;
let supernovaStartScale = 1.0; // scale when SN triggered

export function triggerEndOfLife(mass) {
  supernovaActive = true;
  supernovaTime = 0;
  supernovaMass = mass;
  supernovaDuration = mass >= 8 ? 6.0 : 5.0; // SN is longer and more dramatic
  supernovaStartScale = current.scale;
  // Don't zoom in — let the user manually zoom to see the remnant
}

function updateEndOfLife(dt) {
  if (!supernovaActive) return false;
  supernovaTime += dt;
  const t = Math.min(supernovaTime / supernovaDuration, 1.0);

  const BH_FINAL_SCALE = 0.15;  // small black sphere
  const NS_FINAL_SCALE = 0.03;
  const WD_FINAL_SCALE = 0.04;

  if (supernovaMass >= 8) {
    // Supernova: intense photon burst → collapse → lingering fade
    if (t < 0.25) {
      // Phase 1: BRIGHT flash — star flares white, massive photon shower
      const burstT = t / 0.25;
      photonEmissionRate = 500 + 1500 * Math.pow(burstT, 0.5); // ramps fast
      photonSpeed = 0.4 + 0.8 * burstT;
      starMaterial.uniforms.uBrightness.value = 1 + 5 * burstT; // very bright
      // Flash to white
      target.r = target.r * 0.9 + 1.0 * 0.1;
      target.g = target.g * 0.9 + 1.0 * 0.1;
      target.b = target.b * 0.9 + 1.0 * 0.1;
    } else if (t < 0.6) {
      // Phase 2: collapse — star shrinks, photons still blazing then fading
      const shrinkT = (t - 0.25) / 0.35;
      const finalScale = supernovaMass >= 25 ? BH_FINAL_SCALE : NS_FINAL_SCALE;
      target.scale = supernovaStartScale * Math.pow(1 - shrinkT, 3) + finalScale * (1 - Math.pow(1 - shrinkT, 3));
      starMaterial.uniforms.uBrightness.value = Math.max(0, (1 - shrinkT) * 4);
      photonEmissionRate = Math.max(0, 1800 * Math.pow(1 - shrinkT, 0.5));
      photonSpeed = 1.2 * (1 - shrinkT * 0.5);
      target.r *= 0.93;
      target.g *= 0.91;
      target.b *= 0.88;
    } else {
      const fadeT = (t - 0.7) / 0.3;
      const finalScale = supernovaMass >= 25 ? BH_FINAL_SCALE : NS_FINAL_SCALE;
      target.scale = finalScale;
      starMaterial.uniforms.uBrightness.value = 0;
      photonEmissionRate = Math.max(0, 100 * (1 - fadeT));
    }
  } else {
    // White dwarf: gentle shrink from start scale to tiny
    const shrinkT = t;
    target.scale = supernovaStartScale * Math.pow(1 - shrinkT, 2) + WD_FINAL_SCALE * (1 - Math.pow(1 - shrinkT, 2));
    starMaterial.uniforms.uBrightness.value = 0.3 + 0.7 * (1 - shrinkT);
    photonEmissionRate = Math.max(5, 200 * (1 - shrinkT));
    target.r = target.r * 0.98 + 0.8 * 0.02;
    target.g = target.g * 0.98 + 0.85 * 0.02;
    target.b = target.b * 0.98 + 1.0 * 0.02;
  }

  if (t >= 1.0) {
    supernovaActive = false;
    frozen = true;
    stopPhotons();
    if (supernovaMass >= 25) {
      target.scale = 0.15;
      target.r = 0; target.g = 0; target.b = 0;
      starMaterial.uniforms.uBrightness.value = 0;
      blackHoleActive = true;
      remnantType = 'blackhole';
      currentPhysicalRadius = 0.00004;
    } else if (supernovaMass >= 8) {
      target.scale = 0.03;
      target.r = 0.6; target.g = 0.75; target.b = 1.0;
      starMaterial.uniforms.uBrightness.value = 2.5;
      remnantType = 'neutronstar';
      currentPhysicalRadius = 0.000015;
    } else {
      target.scale = 0.04;
      target.r = 0.8; target.g = 0.85; target.b = 1.0;
      starMaterial.uniforms.uBrightness.value = 0.6;
      remnantType = 'whitedwarf';
      currentPhysicalRadius = 0.009;
    }
    return true; // done — user can zoom in manually to see remnant
  }
  return false;
}

export function setStarfieldSpeed(speed) {
  starfieldRotationSpeed = speed;
}

export function setSliceView(enabled) {
  sliceEnabled = enabled;
  starMaterial.uniforms.uSliceEnabled.value = enabled ? 1.0 : 0.0;
  crossSectionGroup.visible = enabled;
}

export function getCrossSectionGroup() { return crossSectionGroup; }

export function getRendererElement() {
  return renderer?.domElement;
}

export function setAutoZoom(on) { autoZoomEnabled = on; }

// Per-frame callback for things like scale bar updates
let onFrameCallback = null;
export function setOnFrameCallback(fn) { onFrameCallback = fn; }

export function getCamera() { return camera; }
export function getStarMesh() { return starMesh; }
export function getCurrentScale() { return current.scale; }

/**
 * Get scale bar info: how many pixels correspond to 1 R☉ at the current zoom.
 * Returns { pixelsPerRsun, suggestedLabel, suggestedWidth, physicalRadius }
 */
export function getScaleBarInfo() {
  if (!camera || !renderer) return null;
  const camDist = camera.position.length();
  const fovRad = camera.fov * Math.PI / 180;
  const viewH = renderer.domElement.clientHeight;

  // Scene units per R☉: the star has visual scale `current.scale` at `currentPhysicalRadius` R☉
  const unitsPerRsun = currentPhysicalRadius > 0.01 ? current.scale / currentPhysicalRadius : 0.5;

  // Pixels per scene unit at the origin (z=0)
  const pixPerUnit = viewH / (2 * camDist * Math.tan(fovRad / 2));

  const pixPerRsun = unitsPerRsun * pixPerUnit;

  // Choose a nice round number of R☉ that gives a bar of 60–150 pixels
  const candidates = [0.1, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  let bestVal = 1, bestPx = pixPerRsun;
  for (const c of candidates) {
    const px = c * pixPerRsun;
    if (px >= 50 && px <= 160) {
      bestVal = c;
      bestPx = px;
      break;
    }
  }

  const label = bestVal >= 1 ? `${bestVal} R☉` : `${bestVal} R☉`;
  return { pixelsPerRsun: pixPerRsun, suggestedLabel: label, suggestedWidth: bestPx, physicalRadius: currentPhysicalRadius };
}
