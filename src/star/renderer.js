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
let csProfiles = null;  // cached profiles for cross-section drawing
let csMass = 1.0;       // current stellar mass for zone structure

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
  starfieldMesh = new THREE.Points(geometry, material);
  scene.add(starfieldMesh);
}

/**
 * Zone structure depends on mass:
 *   M < 1.3 M☉: radiative core, radiative mid-zone, convective envelope
 *   M ≥ 1.3 M☉: convective core, radiative envelope
 *
 * Returns { convInner, convOuter, coreConvective }
 *   - If coreConvective: convection is from 0 to convOuter (core convection)
 *   - Otherwise: convection is from convInner to 1.0 (envelope convection)
 */
function getConvectionZone(mass) {
  if (mass >= 1.3) {
    // Massive stars: convective core extends further with mass
    const coreConvR = Math.min(0.5, 0.2 + 0.1 * (mass - 1.3));
    return { convInner: 0, convOuter: coreConvR, coreConvective: true };
  }
  // Solar-type: convective envelope starts deeper for lower-mass stars
  const envConvR = Math.max(0.4, 0.7 - 0.2 * (1.0 - mass));
  return { convInner: envConvR, convOuter: 1.0, coreConvective: false };
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
  if (!csCtx || !csProfiles) return;

  const ctx = csCtx;
  const R = CS_HALF;
  ctx.clearRect(0, 0, CS_SIZE, CS_SIZE);

  const profiles = csProfiles;
  const numR = profiles.r.length;
  const zone = getConvectionZone(csMass);

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
    // Solar-type: radiative zone from core boundary (0.25) to convInner
    if (zone.convInner > 0.30) radZones.push({ r0: 0.25, r1: zone.convInner });
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

  // --- Pulsating core glow ---
  const corePulse = 0.9 + 0.1 * Math.sin(time * 1.5);
  const coreGlowR = 0.25 * R * 1.3; // glow extends slightly beyond q
  const coreGrad = ctx.createRadialGradient(R, R, 0.15 * R, R, R, coreGlowR);
  coreGrad.addColorStop(0, `rgba(255, 255, 240, ${(0.25 * corePulse).toFixed(3)})`);
  coreGrad.addColorStop(0.6, `rgba(255, 250, 220, ${(0.1 * corePulse).toFixed(3)})`);
  coreGrad.addColorStop(1, 'rgba(255, 240, 200, 0)');
  ctx.beginPath();
  ctx.arc(R, R, coreGlowR, 0, Math.PI * 2);
  ctx.fillStyle = coreGrad;
  ctx.fill();

  // --- Soft boundary glows (instead of hard rings) ---
  // Core boundary glow at q=0.25
  const coreBndR = 0.25 * R;
  const coreBndW = R * 0.03; // glow width
  const coreBndGrad = ctx.createRadialGradient(R, R, coreBndR - coreBndW, R, R, coreBndR + coreBndW);
  coreBndGrad.addColorStop(0, 'rgba(255, 255, 220, 0)');
  coreBndGrad.addColorStop(0.45, 'rgba(255, 255, 220, 0.2)');
  coreBndGrad.addColorStop(0.55, 'rgba(255, 255, 220, 0.2)');
  coreBndGrad.addColorStop(1, 'rgba(255, 255, 220, 0)');
  ctx.beginPath();
  ctx.arc(R, R, coreBndR + coreBndW, 0, Math.PI * 2);
  ctx.fillStyle = coreBndGrad;
  ctx.fill();

  // Convection zone boundary glow
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

export function setCrossSectionProfiles(profiles, mass) {
  csProfiles = profiles;
  if (mass !== undefined) csMass = mass;
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

  // Sync cross-section with star scale and redraw canvas texture
  if (crossSectionGroup && sliceEnabled) {
    crossSectionGroup.scale.setScalar(scale);
    drawCrossSection(now / 1000);
  }

  // Bloom strength — reduce when zoomed in so surface detail is visible
  const dist = camera.position.length();
  const distFactor = Math.max(0.2, Math.min(1.0, (dist - 2) / 4));
  bloomPass.strength = current.bloom * distFactor;

  // Orbit controls
  controls.update();

  if (!frozen) {
    // Photon flux
    updatePhotons(dt);

    // Rotation
    starMesh.rotation.y += rotationSpeed;

    // Starfield counter-rotation: ambient + time evolution boost
    if (starfieldMesh) {
      starfieldMesh.rotation.y -= (STARFIELD_BASE_SPEED + starfieldRotationSpeed * dt);
    }
  }

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
  for (const p of photons) p.active = false;
}

export function freezeStar() {
  frozen = true;
  stopPhotons();
}

export function unfreezeStar() {
  frozen = false;
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

export function getCamera() { return camera; }
export function getStarMesh() { return starMesh; }
export function getCurrentScale() { return current.scale; }
