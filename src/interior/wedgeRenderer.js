/**
 * Wedge (pizza-slice) renderer for the stellar interior.
 *
 * Shows an angular sector (e.g. 60°) of the stellar cross-section at
 * high resolution, with:
 *   - 1D radial heatmap (temperature, density, etc.) as background
 *   - Streamlines from the 2D fluid sim showing convective flow
 *   - Zone boundary arcs
 *   - Colorbar and labels
 */

import { getColormap, FIELD_INFO } from './colormaps.js';

// Streamline parameters
const SEED_COUNT = 40;        // number of seed points for streamlines
const STREAMLINE_STEPS = 120; // integration steps per streamline
const STREAMLINE_DT = 0.003;  // integration step size

export class WedgeRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {number} size - canvas pixel size (width = height)
   */
  constructor(canvas, size = 512) {
    this.canvas = canvas;
    this.size = size;
    canvas.width = size;
    canvas.height = size;
    this.ctx = canvas.getContext('2d');

    // Wedge geometry
    this.wedgeAngle = Math.PI / 3; // 60°
    this.thetaCenter = -Math.PI / 2; // pointing up
    this.thetaMin = this.thetaCenter - this.wedgeAngle / 2;
    this.thetaMax = this.thetaCenter + this.wedgeAngle / 2;

    this.activeField = 'temperature';
    this.model = null;
    this.convSim = null;

    // Radial LUT
    this.radialLUT = new Uint8Array(256 * 3);
    this._fieldMin = 0;
    this._fieldMax = 1;

    // Cached heatmap image (redrawn only on field/model change)
    this._heatmapDirty = true;
    this._heatmapCache = null;
  }

  setModel(model) {
    this.model = model;
    this._buildRadialLUT();
    this._heatmapDirty = true;
  }

  setConvectionSim(sim) {
    this.convSim = sim;
  }

  setField(field) {
    if (field !== this.activeField) {
      this.activeField = field;
      this._buildRadialLUT();
      this._heatmapDirty = true;
    }
  }

  // --- Radial LUT ---

  _buildRadialLUT() {
    const model = this.model;
    if (!model) return;

    const cmap = getColormap(this.activeField);
    const profile = this._getFieldProfile();
    if (!profile) return;

    let min = Infinity, max = -Infinity;
    for (let i = 0; i < profile.length; i++) {
      if (isFinite(profile[i])) {
        if (profile[i] < min) min = profile[i];
        if (profile[i] > max) max = profile[i];
      }
    }

    // Use log scale for fields with large dynamic range
    const useLog = (this.activeField === 'energy' ||
                    this.activeField === 'temperature' ||
                    this.activeField === 'density' ||
                    this.activeField === 'pressure');
    if (useLog) {
      min = Math.log10(Math.max(min, 1e-30));
      max = Math.log10(Math.max(max, 1e-30));
    }
    const range = max - min || 1;

    for (let lutIdx = 0; lutIdx < 256; lutIdx++) {
      const rFrac = lutIdx / 255;
      const val = this._interpProfile(model.rFrac, profile, rFrac);
      let t;
      if (useLog) {
        t = (Math.log10(Math.max(val, 1e-30)) - min) / range;
      } else {
        t = (val - min) / range;
      }
      t = Math.max(0, Math.min(1, t));
      const [r, g, b] = cmap(t);
      this.radialLUT[lutIdx * 3] = r;
      this.radialLUT[lutIdx * 3 + 1] = g;
      this.radialLUT[lutIdx * 3 + 2] = b;
    }

    this._fieldMin = useLog ? Math.pow(10, min) : min;
    this._fieldMax = useLog ? Math.pow(10, max) : max;
  }

  _getFieldProfile() {
    const m = this.model;
    if (!m) return null;
    switch (this.activeField) {
      case 'temperature': return m.T;
      case 'density': return m.rho;
      case 'pressure': return m.P;
      case 'energy': return m.epsilon;
      case 'velocity': return m.v_conv;
      default: return m.T;
    }
  }

  _interpProfile(rFracArr, values, rTarget) {
    if (rTarget <= rFracArr[0]) return values[0];
    if (rTarget >= rFracArr[rFracArr.length - 1]) return values[values.length - 1];
    let lo = 0, hi = rFracArr.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (rFracArr[mid] <= rTarget) lo = mid;
      else hi = mid;
    }
    const frac = (rTarget - rFracArr[lo]) / (rFracArr[hi] - rFracArr[lo]);
    return values[lo] + frac * (values[hi] - values[lo]);
  }

  // --- Coordinate transforms ---

  _toPixel(rFrac, theta) {
    const { size } = this;
    const margin = 24;
    const maxR = size - 2 * margin;
    const cx = size / 2;
    const cy = size - margin;
    const px = cx + rFrac * maxR * Math.cos(theta);
    const py = cy + rFrac * maxR * Math.sin(theta);
    return [px, py];
  }

  _getLayout() {
    const margin = 24;
    const maxR = this.size - 2 * margin;
    const cx = this.size / 2;
    const cy = this.size - margin;
    return { cx, cy, maxR, margin };
  }

  // --- Streamlines ---

  /**
   * Sample velocity from the fluid sim at (r, theta) in r/R and radians.
   * Returns [vr, vtheta] in sim units.
   */
  _sampleVelocity(r, theta) {
    const sim = this.convSim;
    if (!sim) return [0, 0];

    const { rInner, rOuter, Nr, Ntheta, dtheta } = sim.grid;
    if (r < rInner || r > rOuter) return [0, 0];

    const fi = (r - rInner) / (rOuter - rInner) * (Nr - 1);
    const simTheta = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const fj = simTheta / dtheta;

    const i0 = Math.max(0, Math.min(Math.floor(fi), Nr - 2));
    const i1 = i0 + 1;
    const j0 = Math.floor(fj) % Ntheta;
    const j1 = (j0 + 1) % Ntheta;
    const fr = fi - i0;
    const fth = fj - Math.floor(fj);

    const vr = (1 - fr) * ((1 - fth) * sim.vr[i0 * Ntheta + j0] + fth * sim.vr[i0 * Ntheta + j1]) +
               fr * ((1 - fth) * sim.vr[i1 * Ntheta + j0] + fth * sim.vr[i1 * Ntheta + j1]);
    const vth = (1 - fr) * ((1 - fth) * sim.vtheta[i0 * Ntheta + j0] + fth * sim.vtheta[i0 * Ntheta + j1]) +
                fr * ((1 - fth) * sim.vtheta[i1 * Ntheta + j0] + fth * sim.vtheta[i1 * Ntheta + j1]);

    return [vr, vth];
  }

  /**
   * Compute a single streamline by integrating the velocity field.
   * Returns array of {r, theta} points.
   */
  _computeStreamline(r0, theta0) {
    const sim = this.convSim;
    if (!sim) return [];

    const { rInner, rOuter } = sim.grid;
    const points = [{ r: r0, theta: theta0 }];
    let r = r0, theta = theta0;

    for (let step = 0; step < STREAMLINE_STEPS; step++) {
      const [vr, vth] = this._sampleVelocity(r, theta);
      const speed = Math.sqrt(vr * vr + vth * vth);
      if (speed < 1e-10) break;

      // RK2 (midpoint method)
      const dt = STREAMLINE_DT;
      const r_mid = r + 0.5 * dt * vr;
      const theta_mid = theta + 0.5 * dt * vth / Math.max(r, 0.01);
      const [vr2, vth2] = this._sampleVelocity(r_mid, theta_mid);

      r += dt * vr2;
      theta += dt * vth2 / Math.max(r, 0.01);

      // Stop if out of bounds
      if (r < rInner || r > rOuter) break;
      if (theta < this.thetaMin - 0.1 || theta > this.thetaMax + 0.1) break;

      points.push({ r, theta });
    }

    return points;
  }

  /**
   * Draw streamlines across the full domain.
   * Flow will naturally appear only where convection develops.
   */
  _drawStreamlines() {
    const sim = this.convSim;
    if (!sim) return;

    const { ctx } = this;
    const { rInner, rOuter } = sim.grid;
    const maxV = sim.maxVelocity();
    if (maxV < 1e-12) return;

    // Seed points distributed across the full star
    const seeds = [];
    const nRadial = 8;
    const nAngular = Math.ceil(SEED_COUNT / nRadial);

    for (let ir = 0; ir < nRadial; ir++) {
      const r = rInner + (ir + 0.5) / nRadial * (rOuter - rInner);
      for (let jth = 0; jth < nAngular; jth++) {
        const theta = this.thetaMin + (jth + 0.5) / nAngular * this.wedgeAngle;
        seeds.push({ r, theta });
      }
    }

    for (const seed of seeds) {
      const points = this._computeStreamline(seed.r, seed.theta);
      if (points.length < 3) continue;

      // Sample temperature at seed to color the streamline
      const T = this._sampleSimTemp(seed.r, seed.theta);
      let color;
      if (T > 0.55) {
        // Hot (rising) — warm orange/yellow
        const intensity = Math.min(1, (T - 0.5) * 4);
        color = `rgba(255, ${180 + 60 * intensity}, ${50 + 30 * intensity}, 0.6)`;
      } else if (T < 0.45) {
        // Cool (sinking) — blue
        const intensity = Math.min(1, (0.5 - T) * 4);
        color = `rgba(${60 + 40 * intensity}, ${140 + 60 * intensity}, 255, 0.6)`;
      } else {
        color = 'rgba(200, 200, 200, 0.3)';
      }

      // Draw the streamline as a smooth curve
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;

      const [px0, py0] = this._toPixel(points[0].r, points[0].theta);
      ctx.moveTo(px0, py0);

      for (let k = 1; k < points.length; k++) {
        const [px, py] = this._toPixel(points[k].r, points[k].theta);
        ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Small arrowhead at the end to show direction
      if (points.length >= 3) {
        const last = points[points.length - 1];
        const prev = points[points.length - 3];
        const [px1, py1] = this._toPixel(last.r, last.theta);
        const [px0b, py0b] = this._toPixel(prev.r, prev.theta);
        const angle = Math.atan2(py1 - py0b, px1 - px0b);
        const aLen = 5;
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.moveTo(px1, py1);
        ctx.lineTo(px1 - aLen * Math.cos(angle - 0.4), py1 - aLen * Math.sin(angle - 0.4));
        ctx.lineTo(px1 - aLen * Math.cos(angle + 0.4), py1 - aLen * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  _sampleSimTemp(rFrac, theta) {
    const sim = this.convSim;
    if (!sim) return 0.5;
    const { rInner, rOuter, Nr, Ntheta, dtheta } = sim.grid;
    if (rFrac < rInner || rFrac > rOuter) return 0.5;

    const fi = (rFrac - rInner) / (rOuter - rInner) * (Nr - 1);
    const simTheta = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const fj = simTheta / dtheta;

    const i = Math.max(0, Math.min(Math.round(fi), Nr - 1));
    const j = Math.round(fj) % Ntheta;
    return sim.temperature[i * Ntheta + j];
  }

  // --- Main render ---

  render(time) {
    if (!this.model) return;

    const { ctx, size } = this;
    const { cx, cy, maxR } = this._getLayout();

    // --- Layer 1: Heatmap background (cached) ---
    if (this._heatmapDirty || !this._heatmapCache) {
      this._renderHeatmap();
      this._heatmapDirty = false;
    }
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this._heatmapCache, 0, 0);

    // --- Layer 2: Zone boundaries ---
    this._drawZoneBoundaries(cx, cy, maxR);

    // --- Layer 3: Streamlines ---
    this._drawStreamlines();

    // --- Layer 4: Wedge outline ---
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const [ox1, oy1] = this._toPixel(1.0, this.thetaMin);
    ctx.lineTo(ox1, oy1);
    ctx.arc(cx, cy, maxR, this.thetaMin, this.thetaMax);
    ctx.lineTo(cx, cy);
    ctx.stroke();

    // --- Layer 5: Colorbar + labels ---
    this._drawColorbar();
    this._drawLabels(cx, cy, maxR);
  }

  /** Render the heatmap to an off-screen cache canvas. */
  _renderHeatmap() {
    const { size } = this;
    if (!this._heatmapCache) {
      this._heatmapCache = document.createElement('canvas');
      this._heatmapCache.width = size;
      this._heatmapCache.height = size;
    }
    const hctx = this._heatmapCache.getContext('2d');
    const { cx, cy, maxR } = this._getLayout();

    const imgData = hctx.createImageData(size, size);
    const data = imgData.data;

    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const rFrac = dist / maxR;

        if (rFrac > 1.0 || rFrac < 0.001) continue;

        const angle = Math.atan2(dy, dx);
        if (angle < this.thetaMin || angle > this.thetaMax) continue;

        const lutIdx = Math.min(255, Math.floor(rFrac * 255));
        const idx = (py * size + px) * 4;
        data[idx] = this.radialLUT[lutIdx * 3];
        data[idx + 1] = this.radialLUT[lutIdx * 3 + 1];
        data[idx + 2] = this.radialLUT[lutIdx * 3 + 2];
        data[idx + 3] = 255;
      }
    }
    hctx.putImageData(imgData, 0, 0);
  }

  _drawZoneBoundaries(cx, cy, maxR) {
    if (!this.model) return;
    const { ctx } = this;
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';

    for (const bnd of this.model.zoneBoundaries) {
      const r = bnd * maxR;
      ctx.beginPath();
      ctx.arc(cx, cy, r, this.thetaMin, this.thetaMax);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawColorbar() {
    const { ctx, size } = this;
    const cmap = getColormap(this.activeField);
    const info = FIELD_INFO[this.activeField] || {};

    const barX = size - 28;
    const barY = 30;
    const barW = 10;
    const barH = size - 70;

    for (let py = 0; py < barH; py++) {
      const t = 1 - py / barH;
      const [r, g, b] = cmap(t);
      ctx.fillStyle = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
      ctx.fillRect(barX, barY + py, barW, 1);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(this._formatValue(this._fieldMax), barX - 3, barY + 8);
    ctx.fillText(this._formatValue(this._fieldMin), barX - 3, barY + barH);

    ctx.textAlign = 'left';
    ctx.fillText(info.name || this.activeField, 8, 16);
  }

  _drawLabels(cx, cy, maxR) {
    if (!this.model) return;
    const { ctx } = this;

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '9px Inter, sans-serif';

    const edgeAngle = this.thetaMax;
    for (const rFrac of [0.2, 0.4, 0.6, 0.8]) {
      const [px, py] = this._toPixel(rFrac, edgeAngle);
      ctx.textAlign = 'left';
      ctx.fillText(`${rFrac.toFixed(1)}R`, px + 4, py);
    }

    // Zone type labels at boundaries
    if (this.model.zoneBoundaries.length > 0) {
      const midAngle = this.thetaCenter;
      for (let b = 0; b < this.model.zoneBoundaries.length; b++) {
        const bnd = this.model.zoneBoundaries[b];
        // Label the zone just inside the boundary
        const labelR = (b === 0) ? bnd * 0.5 : (bnd + (this.model.zoneBoundaries[b - 1] || 0)) / 2;
        const [px, py] = this._toPixel(labelR, midAngle);
        const midIdx = Math.min(this.model.N - 1, Math.round(labelR * (this.model.N - 1)));
        const isConv = this.model.isConvective[midIdx];
        ctx.textAlign = 'center';
        ctx.fillStyle = isConv ? 'rgba(255, 180, 80, 0.5)' : 'rgba(120, 180, 255, 0.5)';
        ctx.fillText(isConv ? 'convective' : 'radiative', px, py);
      }
    }
  }

  _formatValue(val) {
    if (val === undefined || !isFinite(val)) return '—';
    if (Math.abs(val) >= 1e6) return val.toExponential(1);
    if (Math.abs(val) >= 100) return Math.round(val).toString();
    if (Math.abs(val) >= 1) return val.toFixed(1);
    return val.toExponential(1);
  }
}
