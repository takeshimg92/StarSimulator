/**
 * Hertzsprung-Russell diagram.
 *
 * Plots log(L/L☉) vs log(T_eff), with T increasing to the LEFT
 * (as is conventional). Shows:
 *   - Main sequence band as a reference
 *   - Trail of past positions (grayed out)
 *   - Current position (bright, colored by blackbody temperature)
 *
 * The axes auto-zoom to keep the trail visible while maintaining context.
 */

import { temperatureToRGB } from '../physics/blackbody.js';
import { constants } from '../physics/constants.js';
import { luminosityFromMass, temperatureFromMass } from '../physics/scaling.js';

let canvas, ctx, dpr;

// Trail of past positions: { T, L } in physical units
const trail = [];
const MAX_TRAIL = 500;

// Default (full) plot bounds
const DEFAULT_LOG_T_MIN = Math.log10(2500);
const DEFAULT_LOG_T_MAX = Math.log10(50000);
const DEFAULT_LOG_L_MIN = -3;
const DEFAULT_LOG_L_MAX = 6;

// Current (possibly zoomed) bounds — smoothly interpolated
let logTMin = DEFAULT_LOG_T_MIN;
let logTMax = DEFAULT_LOG_T_MAX;
let logLMin = DEFAULT_LOG_L_MIN;
let logLMax = DEFAULT_LOG_L_MAX;

// Target bounds (what we're interpolating toward)
let targetLogTMin = logTMin;
let targetLogTMax = logTMax;
let targetLogLMin = logLMin;
let targetLogLMax = logLMax;

// Padding
const PAD = { top: 14, right: 12, bottom: 6, left: 48 };

// Minimum padding around data in log units
const DATA_MARGIN = 0.5;
// Minimum axis span
const MIN_SPAN_L = 1.5;
const MIN_SPAN_T = 0.3;

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
  if (w === 0 || h === 0) return; // hidden tab — skip to preserve dimensions
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
  const x = PAD.left + (1 - (logT - logTMin) / (logTMax - logTMin)) * plotW;
  const y = PAD.top + (1 - (logL - logLMin) / (logLMax - logLMin)) * plotH;
  return { x, y };
}

/**
 * Compute dynamic bounds that keep all trail points + current position visible,
 * with some margin, while always including the MS band context.
 */
function updateBounds(currentLogT, currentLogL) {
  if (trail.length < 3) {
    // Not enough data to zoom — use defaults
    targetLogTMin = DEFAULT_LOG_T_MIN;
    targetLogTMax = DEFAULT_LOG_T_MAX;
    targetLogLMin = DEFAULT_LOG_L_MIN;
    targetLogLMax = DEFAULT_LOG_L_MAX;
  } else {
    // Find data extent
    let dLogTMin = currentLogT, dLogTMax = currentLogT;
    let dLogLMin = currentLogL, dLogLMax = currentLogL;
    for (const t of trail) {
      dLogTMin = Math.min(dLogTMin, t.logT);
      dLogTMax = Math.max(dLogTMax, t.logT);
      dLogLMin = Math.min(dLogLMin, t.logL);
      dLogLMax = Math.max(dLogLMax, t.logL);
    }

    // Add margin
    const spanL = Math.max(dLogLMax - dLogLMin + 2 * DATA_MARGIN, MIN_SPAN_L);
    const spanT = Math.max(dLogTMax - dLogTMin + 2 * DATA_MARGIN, MIN_SPAN_T);

    const centerL = (dLogLMin + dLogLMax) / 2;
    const centerT = (dLogTMin + dLogTMax) / 2;

    // Ensure we don't zoom tighter than the data needs, but also keep MS context
    // Include at least the range that shows the MS band near the data
    const msContextMinT = Math.min(centerT - spanT * 0.6, DEFAULT_LOG_T_MIN);
    const msContextMaxT = Math.max(centerT + spanT * 0.6, Math.min(DEFAULT_LOG_T_MAX, centerT + spanT));

    targetLogLMin = centerL - spanL / 2;
    targetLogLMax = centerL + spanL / 2;
    targetLogTMin = Math.max(DEFAULT_LOG_T_MIN, centerT - spanT / 2);
    targetLogTMax = Math.min(DEFAULT_LOG_T_MAX, centerT + spanT / 2);

    // Clamp: never zoom beyond the full default range
    targetLogLMin = Math.max(DEFAULT_LOG_L_MIN, targetLogLMin);
    targetLogLMax = Math.min(DEFAULT_LOG_L_MAX, targetLogLMax);
  }

  // Smooth interpolation toward targets
  const rate = 0.08;
  logTMin += (targetLogTMin - logTMin) * rate;
  logTMax += (targetLogTMax - logTMax) * rate;
  logLMin += (targetLogLMin - logLMin) * rate;
  logLMax += (targetLogLMax - logLMax) * rate;
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

  updateBounds(logT, logL);
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
  const labelT = temperatureFromMass(3);
  const labelL = luminosityFromMass(3);
  const msLabelPos = toCanvas(Math.log10(labelT), Math.log10(labelL) + 0.6);
  if (msLabelPos.x > PAD.left && msLabelPos.x < w - PAD.right &&
      msLabelPos.y > PAD.top && msLabelPos.y < h - PAD.bottom) {
    ctx.fillText('Main Sequence', msLabelPos.x - 30, msLabelPos.y);
  }

  // Grid lines — compute nice tick values for current bounds
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;

  // Horizontal grid (luminosity) — integer powers of 10 within bounds
  for (let logL = Math.ceil(logLMin); logL <= Math.floor(logLMax); logL += 1) {
    const p = toCanvas(logTMin, logL);
    const p2 = toCanvas(logTMax, logL);
    ctx.beginPath();
    ctx.moveTo(PAD.left, p.y);
    ctx.lineTo(PAD.left + plotW, p.y);
    ctx.stroke();
  }

  // Vertical grid (temperature) — select visible ticks
  const allTempTicks = [2500, 3000, 4000, 5000, 7000, 10000, 15000, 20000, 30000, 40000];
  const tempTicks = allTempTicks.filter(t => {
    const lt = Math.log10(t);
    return lt >= logTMin && lt <= logTMax;
  });
  for (const t of tempTicks) {
    const logT = Math.log10(t);
    const p = toCanvas(logT, logLMin);
    ctx.beginPath();
    ctx.moveTo(p.x, PAD.top);
    ctx.lineTo(p.x, PAD.top + plotH);
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

  // X-axis (temperature, reversed) — ticks at top
  for (const t of tempTicks) {
    const logT = Math.log10(t);
    const p = toCanvas(logT, logLMax);
    const label = t >= 1000 ? `${t / 1000}k` : `${t}`;
    const textW = ctx.measureText(label).width;
    ctx.fillText(label, p.x - textW / 2, PAD.top - 1);
  }

  // Y-axis (luminosity) — use Unicode superscripts
  const superDigits = { '-': '\u207B', '0': '\u2070', '1': '\u00B9', '2': '\u00B2', '3': '\u00B3', '4': '\u2074', '5': '\u2075', '6': '\u2076', '7': '\u2077', '8': '\u2078', '9': '\u2079' };
  function toSuperscript(n) {
    return String(n).split('').map(c => superDigits[c] || c).join('');
  }

  for (let logL = Math.ceil(logLMin); logL <= Math.floor(logLMax); logL += 1) {
    const p = toCanvas(logTMax, logL);
    // Only label every other tick if range is large, or every tick if small
    const range = logLMax - logLMin;
    if (range > 4 && logL % 2 !== 0) continue;
    const label = logL === 0 ? '1' : `10${toSuperscript(logL)}`;
    ctx.fillText(label, 14, p.y + 3);
  }

  // Axis titles
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  // Temperature title not drawn — tick labels are self-explanatory

  ctx.save();
  ctx.translate(10, PAD.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Luminosity (L\u2609)', -35, 0);
  ctx.restore();
}

/**
 * Clear the trail (e.g. on reset).
 */
export function clearHRTrail() {
  trail.length = 0;
  // Reset bounds to defaults
  logTMin = DEFAULT_LOG_T_MIN;
  logTMax = DEFAULT_LOG_T_MAX;
  logLMin = DEFAULT_LOG_L_MIN;
  logLMax = DEFAULT_LOG_L_MAX;
  targetLogTMin = logTMin;
  targetLogTMax = logTMax;
  targetLogLMin = logLMin;
  targetLogLMax = logLMax;
}
