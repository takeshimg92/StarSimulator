/**
 * Hertzsprung-Russell diagram.
 *
 * Plots log(L/L☉) vs log(T_eff), with T increasing to the LEFT
 * (as is conventional). Shows:
 *   - Main sequence band as a reference
 *   - Trail of past positions (grayed out)
 *   - Current position (bright, colored by blackbody temperature)
 */

import { temperatureToRGB } from '../physics/blackbody.js';
import { constants } from '../physics/constants.js';
import { luminosityFromMass, temperatureFromMass } from '../physics/scaling.js';

let canvas, ctx, dpr;

// Trail of past positions: { T, L } in physical units
const trail = [];
const MAX_TRAIL = 500;

// Plot bounds (log scale)
const LOG_T_MIN = Math.log10(2500);   // cool edge (right)
const LOG_T_MAX = Math.log10(50000);  // hot edge (left)
const LOG_L_MIN = -3;                  // 0.001 L☉
const LOG_L_MAX = 6;                   // 10^6 L☉

// Padding
const PAD = { top: 8, right: 12, bottom: 24, left: 48 };

export function initHRDiagram(canvasElement) {
  canvas = canvasElement;
  ctx = canvas.getContext('2d');
  dpr = window.devicePixelRatio || 1;
  resizeHRCanvas();
}

export function resizeHRCanvas() {
  if (!canvas) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/**
 * Map (logT, logL) to canvas coordinates.
 * Note: T axis is REVERSED (hot = left, cool = right).
 */
function toCanvas(logT, logL) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const plotW = w - PAD.left - PAD.right;
  const plotH = h - PAD.top - PAD.bottom;

  // T is reversed
  const x = PAD.left + (1 - (logT - LOG_T_MIN) / (LOG_T_MAX - LOG_T_MIN)) * plotW;
  const y = PAD.top + (1 - (logL - LOG_L_MIN) / (LOG_L_MAX - LOG_L_MIN)) * plotH;
  return { x, y };
}

/**
 * Update the H-R diagram with the current star state.
 * @param {number} temperature - T_eff in K
 * @param {number} luminosity - L in watts
 */
export function updateHR(temperature, luminosity) {
  const L_solar = luminosity / constants.L_sun;
  const logT = Math.log10(Math.max(temperature, 100));
  const logL = Math.log10(Math.max(L_solar, 1e-6));

  // Add to trail (avoid duplicates if nothing changed)
  const last = trail[trail.length - 1];
  if (!last || Math.abs(last.logT - logT) > 0.001 || Math.abs(last.logL - logL) > 0.001) {
    trail.push({ logT, logL, T: temperature });
    if (trail.length > MAX_TRAIL) trail.shift();
  }

  draw(logT, logL, temperature);
}

function draw(currentLogT, currentLogL, currentT) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;

  ctx.clearRect(0, 0, w, h);

  const plotW = w - PAD.left - PAD.right;
  const plotH = h - PAD.top - PAD.bottom;

  // Main sequence band — computed from the same scaling relations the sim uses
  // Sample masses from 0.1 to 50 M☉, get (T, L) for each
  const msSamples = [];
  for (let logM = -1; logM <= 1.7; logM += 0.05) {
    const mass = Math.pow(10, logM);
    const T = temperatureFromMass(mass);
    const L = luminosityFromMass(mass);
    msSamples.push({ logT: Math.log10(T), logL: Math.log10(L) });
  }

  // Draw as a band with width ±0.3 in logL
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.beginPath();
  for (let i = 0; i < msSamples.length; i++) {
    const p = toCanvas(msSamples[i].logT, msSamples[i].logL + 0.3);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  for (let i = msSamples.length - 1; i >= 0; i--) {
    const p = toCanvas(msSamples[i].logT, msSamples[i].logL - 0.3);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();

  // MS label
  ctx.font = '9px Inter, monospace';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  // Place label near a ~3 M☉ star on the band
  const labelT = temperatureFromMass(3);
  const labelL = luminosityFromMass(3);
  const msLabelPos = toCanvas(Math.log10(labelT), Math.log10(labelL) + 0.6);
  ctx.fillText('Main Sequence', msLabelPos.x - 30, msLabelPos.y);

  // Grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;

  // Horizontal grid (luminosity)
  for (let logL = LOG_L_MIN; logL <= LOG_L_MAX; logL += 1) {
    const p = toCanvas(LOG_T_MIN, logL);
    const p2 = toCanvas(LOG_T_MAX, logL);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p2.x, p.y);
    ctx.stroke();
  }

  // Vertical grid (temperature)
  const tempTicks = [3000, 5000, 10000, 20000, 40000];
  for (const t of tempTicks) {
    const logT = Math.log10(t);
    const p = toCanvas(logT, LOG_L_MIN);
    const p2 = toCanvas(logT, LOG_L_MAX);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p2.y);
    ctx.stroke();
  }

  // Trail — older points more transparent
  if (trail.length > 1) {
    for (let i = 0; i < trail.length - 1; i++) {
      const t = trail[i];
      const opacity = 0.08 + 0.25 * (i / trail.length);
      const rgb = temperatureToRGB(t.T);
      const p = toCanvas(t.logT, t.logL);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${Math.round(rgb.r * 255)}, ${Math.round(rgb.g * 255)}, ${Math.round(rgb.b * 255)}, ${opacity})`;
      ctx.fill();
    }

    // Trail line connecting dots
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < trail.length; i++) {
      const p = toCanvas(trail[i].logT, trail[i].logL);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  // Current position — bright, colored
  const rgb = temperatureToRGB(currentT);
  const pos = toCanvas(currentLogT, currentLogL);
  // Glow
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${Math.round(rgb.r * 255)}, ${Math.round(rgb.g * 255)}, ${Math.round(rgb.b * 255)}, 0.25)`;
  ctx.fill();
  // Core dot
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = `rgb(${Math.round(rgb.r * 255)}, ${Math.round(rgb.g * 255)}, ${Math.round(rgb.b * 255)})`;
  ctx.fill();

  // Axis labels
  ctx.font = '9px Inter, monospace';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';

  // X-axis (temperature, reversed) — ticks
  for (const t of tempTicks) {
    const logT = Math.log10(t);
    const p = toCanvas(logT, LOG_L_MIN);
    const label = t >= 10000 ? `${t / 1000}k` : `${t}`;
    const textW = ctx.measureText(label).width;
    ctx.fillText(label, p.x - textW / 2, p.y + 14);
  }

  // Y-axis (luminosity) — use Unicode superscripts
  const superDigits = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  function toSuperscript(n) {
    return String(n).split('').map(c => superDigits[c] || c).join('');
  }

  for (let logL = LOG_L_MIN; logL <= LOG_L_MAX; logL += 2) {
    const p = toCanvas(LOG_T_MAX, logL);
    const label = logL === 0 ? '1' : `10${toSuperscript(logL)}`;
    ctx.fillText(label, 14, p.y + 3);
  }

  // Axis titles
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fillText('← Temperature (K)', PAD.left + plotW / 2 - 35, h - 2);

  ctx.save();
  ctx.translate(10, PAD.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Luminosity (L☉)', -35, 0);
  ctx.restore();
}

/**
 * Clear the trail (e.g. on reset).
 */
export function clearHRTrail() {
  trail.length = 0;
}
