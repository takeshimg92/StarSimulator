/**
 * Particle simulation: multi-species particles in a box with Maxwell-Boltzmann velocities.
 *
 * Top region: 2D box with bouncing particles (H⁺, He⁴, e⁻).
 * Bottom region: velocity distribution histogram vs. theoretical MB curve.
 *
 * Species composition reflects solar core:
 *   - H⁺ (protons): X ≈ 0.70 by mass
 *   - ⁴He: Y ≈ 0.28 by mass
 *   - e⁻: charge neutrality → n_e = n_H + 2·n_He
 *
 * Each species has its own mass, so at the same T they have different
 * thermal speeds: v_th ∝ 1/√m. Electrons are ~43× faster than protons.
 */

import { constants } from '../physics/constants.js';

let canvas, ctx, dpr;
let particles = [];
let animId = null;
let lastTime = 0;

const HIST_BINS = 25;

// Current core temperature (updated from outside)
let coreTemp = 15e6; // K

// Box layout (in CSS pixels, set on resize)
let boxW = 0, boxH = 0, histH = 0, totalW = 0, totalH = 0;
const BOX_FRAC = 0.7;
const HIST_FRAC = 0.3;
const PAD = 8;
const HIST_PAD_BOTTOM = 20;

const VISUAL_SPEED_SCALE = 80;

// Species definitions
// Solar core composition by mass: X=0.70 (H), Y=0.28 (He), Z=0.02 (metals, ignored)
// Number fractions: n_H ∝ X/1, n_He ∝ Y/4
// n_H : n_He ≈ 0.70 : 0.07 = 10 : 1
// n_e = n_H + 2·n_He ≈ 10 + 2 = 12 (per 10 H)
// Normalize: total ~ 10+1+12 = 23 → H:43%, He:4%, e:53%
// For visibility, cap electrons and boost He slightly
const SPECIES = [
  {
    id: 'H',
    label: 'H⁺',
    color: 'rgba(100, 180, 255, 0.9)',
    histColor: 'rgba(100, 180, 255, 0.35)',
    massRatio: 1,        // relative to proton
    fraction: 0.43,
    radius: 2.5,
  },
  {
    id: 'He',
    label: '⁴He',
    color: 'rgba(255, 200, 80, 0.9)',
    histColor: 'rgba(255, 200, 80, 0.35)',
    massRatio: 4,
    fraction: 0.09,      // boosted slightly for visibility
    radius: 3.5,
  },
  {
    id: 'e',
    label: 'e⁻',
    color: 'rgba(180, 255, 180, 0.9)',
    histColor: 'rgba(180, 255, 180, 0.35)',
    massRatio: 1 / 1836, // electron mass / proton mass
    fraction: 0.48,
    radius: 1.5,
  },
];

const TOTAL_PARTICLES = 120;

export function initParticleSim(canvasElement) {
  canvas = canvasElement;
  ctx = canvas.getContext('2d');
  dpr = window.devicePixelRatio || 1;
  resizeParticleCanvas();
  spawnParticles();
  lastTime = performance.now();
  animate();
}

export function resizeParticleCanvas() {
  if (!canvas) return;
  totalW = canvas.clientWidth;
  totalH = canvas.clientHeight;
  dpr = window.devicePixelRatio || 1;
  canvas.width = totalW * dpr;
  canvas.height = totalH * dpr;
  canvas.style.width = totalW + 'px';
  canvas.style.height = totalH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  boxW = totalW - PAD * 2;
  boxH = totalH * BOX_FRAC - PAD * 2;
  histH = totalH * HIST_FRAC - HIST_PAD_BOTTOM;
}

let prevCoreTemp = 15e6;

export function updateParticleTemp(Tc) {
  const newTemp = Math.max(Tc, 1e4);
  if (Math.abs(newTemp - coreTemp) < 1) return; // no meaningful change

  const oldTemp = coreTemp;
  coreTemp = newTemp;

  // Rescale existing velocities: v_th ∝ √T, so scale factor = √(T_new / T_old)
  // But we use exaggerated visual scaling (power 1.6), so match that
  for (const p of particles) {
    const oldVth = thermalSpeedForMassAtTemp(p.massRatio, oldTemp);
    const newVth = thermalSpeedForMass(p.massRatio);
    if (oldVth > 0.01) {
      const scale = newVth / oldVth;
      p.vx *= scale;
      p.vy *= scale;
    }
  }
}

/**
 * Thermal speed for a given mass ratio (relative to proton).
 * v_th = sqrt(2 k_B T / m), scaled to visual units.
 */
function thermalSpeedForMass(massRatio) {
  return thermalSpeedForMassAtTemp(massRatio, coreTemp);
}

function thermalSpeedForMassAtTemp(massRatio, temp) {
  const { k_B, m_p } = constants;
  const vPhysical = Math.sqrt(2 * k_B * temp / (massRatio * m_p));
  const v15MK = Math.sqrt(2 * k_B * 15e6 / m_p);
  const ratio = vPhysical / v15MK;
  const raw = Math.pow(ratio, 1.6) * VISUAL_SPEED_SCALE;
  return Math.min(raw, VISUAL_SPEED_SCALE * 4);
}

/**
 * Update species fractions from evolving composition.
 * Gradually adds/removes particles to match target counts.
 * Removes one random particle of over-represented species,
 * spawns one for under-represented species.
 */
export function updateParticleComposition(X, Y) {
  const Z_val = 1 - X - Y;
  const nH = X;
  const nHe = Y / 4;
  const nE = nH + 2 * nHe;
  const total = nH + nHe + nE;

  SPECIES[0].fraction = nH / total;
  SPECIES[1].fraction = nHe / total;
  SPECIES[2].fraction = nE / total;

  // Target counts
  for (const species of SPECIES) {
    const targetCount = Math.round(TOTAL_PARTICLES * species.fraction);
    const current = particles.filter(p => p.speciesId === species.id);
    const diff = targetCount - current.length;

    if (diff < 0) {
      // Remove |diff| random particles of this species (fade out)
      let toRemove = Math.min(-diff, 3); // remove at most 3 per update
      for (let i = 0; i < toRemove; i++) {
        const idx = particles.findIndex(p => p.speciesId === species.id);
        if (idx >= 0) particles.splice(idx, 1);
      }
    } else if (diff > 0) {
      // Spawn |diff| new particles of this species
      let toAdd = Math.min(diff, 3); // add at most 3 per update
      const vth = thermalSpeedForMass(species.massRatio);
      for (let i = 0; i < toAdd; i++) {
        const speed = sampleMBSpeed(vth);
        const angle = Math.random() * Math.PI * 2;
        particles.push({
          x: PAD + Math.random() * boxW,
          y: PAD + Math.random() * boxH,
          vx: speed * Math.cos(angle),
          vy: speed * Math.sin(angle),
          radius: species.radius,
          color: species.color,
          speciesId: species.id,
          massRatio: species.massRatio,
        });
      }
    }
  }
}

function protonThermalSpeed() {
  return thermalSpeedForMass(1);
}

function sampleMBSpeed(vth) {
  const sigma = vth / Math.sqrt(2);
  const vx = gaussianRandom() * sigma;
  const vy = gaussianRandom() * sigma;
  return Math.sqrt(vx * vx + vy * vy);
}

function gaussianRandom() {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function spawnParticles() {
  particles = [];
  for (const species of SPECIES) {
    const count = Math.round(TOTAL_PARTICLES * species.fraction);
    const vth = thermalSpeedForMass(species.massRatio);
    for (let i = 0; i < count; i++) {
      const speed = sampleMBSpeed(vth);
      const angle = Math.random() * Math.PI * 2;
      particles.push({
        x: PAD + Math.random() * boxW,
        y: PAD + Math.random() * boxH,
        vx: speed * Math.cos(angle),
        vy: speed * Math.sin(angle),
        radius: species.radius,
        color: species.color,
        speciesId: species.id,
        massRatio: species.massRatio,
      });
    }
  }
}

function stepSimulation(dt) {
  const xMin = PAD;
  const xMax = PAD + boxW;
  const yMin = PAD;
  const yMax = PAD + boxH;

  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (p.x - p.radius < xMin) {
      p.x = xMin + p.radius;
      p.vx = Math.abs(p.vx);
    } else if (p.x + p.radius > xMax) {
      p.x = xMax - p.radius;
      p.vx = -Math.abs(p.vx);
    }

    if (p.y - p.radius < yMin) {
      p.y = yMin + p.radius;
      p.vy = Math.abs(p.vy);
    } else if (p.y + p.radius > yMax) {
      p.y = yMax - p.radius;
      p.vy = -Math.abs(p.vy);
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, totalW, totalH);

  // --- Particle box ---
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(PAD, PAD, boxW, boxH);

  // Draw particles
  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
  }

  // Temperature display
  const tempStr = coreTemp >= 1e6
    ? `T_c = ${(coreTemp / 1e6).toFixed(1)} MK`
    : `T_c = ${(coreTemp / 1e3).toFixed(0)} kK`;
  ctx.font = '11px Inter, monospace';
  ctx.fillStyle = 'rgba(255, 200, 100, 0.6)';
  ctx.fillText(tempStr, PAD + boxW - ctx.measureText(tempStr).width - 4, PAD + 14);

  // Species legend (top-left of box)
  ctx.font = '9px Inter, monospace';
  let legendX = PAD + 4;
  const legendY = PAD + boxH - 6;
  for (const species of SPECIES) {
    ctx.fillStyle = species.color;
    ctx.beginPath();
    ctx.arc(legendX + 4, legendY - 3, species.radius, 0, Math.PI * 2);
    ctx.fill();
    legendX += species.radius * 2 + 3;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText(species.label, legendX, legendY);
    legendX += ctx.measureText(species.label).width + 10;
  }

  // --- Velocity distribution (protons only, for clarity) ---
  const histY = totalH * BOX_FRAC;
  const histW = boxW;
  const histX = PAD;

  const vthProton = protonThermalSpeed();
  if (vthProton < 0.01) return; // guard against zero temperature
  const maxSpeed = vthProton * 3.5;
  const binWidth = maxSpeed / HIST_BINS;

  // Histogram for protons only (electrons are too fast to show on this scale)
  const protonBins = new Array(HIST_BINS).fill(0);
  for (const p of particles) {
    if (p.speciesId !== 'H') continue;
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    const idx = Math.min(Math.floor(speed / binWidth), HIST_BINS - 1);
    if (idx >= 0) protonBins[idx]++;
  }
  const maxBin = Math.max(...protonBins, 1);

  // Histogram border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(histX, histY, histW, histH);

  // Histogram bars (protons only)
  const barW = histW / HIST_BINS;
  for (let i = 0; i < HIST_BINS; i++) {
    const count = protonBins[i];
    if (count === 0) continue;
    const barH = (count / maxBin) * (histH - 10);
    ctx.fillStyle = SPECIES[0].histColor;
    ctx.fillRect(
      histX + i * barW + 1,
      histY + histH - barH,
      barW - 2,
      barH
    );
  }

  // Theoretical MB curve for protons
  const sigmaP = vthProton / Math.sqrt(2);
  const nProtons = Math.round(TOTAL_PARTICLES * SPECIES[0].fraction);
  ctx.strokeStyle = SPECIES[0].color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i <= histW; i++) {
    const v = (i / histW) * maxSpeed;
    const fv = (v / (sigmaP * sigmaP)) * Math.exp(-v * v / (2 * sigmaP * sigmaP));
    const expectedCount = nProtons * fv * binWidth;
    const y = histY + histH - (expectedCount / maxBin) * (histH - 10);
    if (i === 0) ctx.moveTo(histX + i, y);
    else ctx.lineTo(histX + i, y);
  }
  ctx.stroke();

  // X-axis ticks (physical speed in km/s, referenced to proton mass)
  const { k_B, m_p } = constants;
  const physVth = Math.sqrt(2 * k_B * coreTemp / m_p);
  const physMaxSpeed = (maxSpeed / vthProton) * physVth;

  ctx.font = '9px Inter, monospace';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  const numTicks = 4;
  for (let i = 0; i < numTicks; i++) {
    const frac = i / numTicks;
    const x = histX + frac * histW;
    const physSpeed = frac * physMaxSpeed / 1e3;

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.moveTo(x, histY + histH);
    ctx.lineTo(x, histY + histH + 4);
    ctx.stroke();

    const label = physSpeed >= 1000
      ? `${(physSpeed / 1000).toFixed(1)}k`
      : `${Math.round(physSpeed)}`;
    const textW = ctx.measureText(label).width;
    ctx.fillText(label, x - textW / 2, histY + histH + 14);
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.fillText('km/s', histX + histW - 22, histY + histH + 14);
  ctx.fillText('f(v)', histX + 2, histY + 12);
}

function animate() {
  animId = requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  stepSimulation(dt);
  draw();
}

export function stopParticleSim() {
  if (animId) cancelAnimationFrame(animId);
}
