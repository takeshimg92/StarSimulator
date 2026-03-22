/**
 * Heatmap renderer for the interior cross-section.
 *
 * Composites:
 *   1. Base layer: 1D radial profile → colormap (covers full disk)
 *   2. Flow layer: 2D convection sim overlay in convective zones
 *   3. Zone boundaries: dashed lines at convective/radiative transitions
 *   4. Radiative zones: subtle outward pulse animation
 */

import { getColormap, FIELD_INFO } from './colormaps.js';

export class HeatmapRenderer {
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
    this.imageData = this.ctx.createImageData(size, size);

    this.activeField = 'temperature';
    this.model = null;       // 1D interior model
    this.convSim = null;     // 2D convection simulation

    // Radial lookup table (256 entries)
    this.radialLUT = new Uint8Array(256 * 3);

    // Animation
    this.pulsePhase = 0;
  }

  /**
   * Set the 1D interior model data.
   * @param {object} model - from computeInteriorModel()
   */
  setModel(model) {
    this.model = model;
    this._buildRadialLUT();
  }

  /**
   * Set the 2D convection simulation reference.
   * @param {import('../fluid/convectionSim.js').ConvectionSim} sim
   */
  setConvectionSim(sim) {
    this.convSim = sim;
  }

  /**
   * Set the active field for rendering.
   * @param {string} field - 'temperature', 'density', 'pressure', 'energy', 'velocity'
   */
  setField(field) {
    if (field !== this.activeField) {
      this.activeField = field;
      this._buildRadialLUT();
    }
  }

  /**
   * Build the 1D radial color lookup table for the current field.
   * Maps 256 entries (r/R = 0 to 1) to RGB colors.
   */
  _buildRadialLUT() {
    const model = this.model;
    if (!model) return;

    const cmap = getColormap(this.activeField);
    const profile = this._getFieldProfile();
    if (!profile) return;

    // Find min/max for normalization
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < profile.length; i++) {
      if (isFinite(profile[i])) {
        if (profile[i] < min) min = profile[i];
        if (profile[i] > max) max = profile[i];
      }
    }

    // For energy generation, use log scale (concentrated in core)
    const useLog = (this.activeField === 'energy');

    if (useLog) {
      min = Math.log10(Math.max(min, 1e-30));
      max = Math.log10(Math.max(max, 1e-30));
    }

    const range = max - min || 1;

    // Build LUT: 256 entries mapping radial position to color
    for (let lutIdx = 0; lutIdx < 256; lutIdx++) {
      const rFrac = lutIdx / 255; // 0 to 1

      // Interpolate the profile at this r/R
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

    // Store min/max for colorbar
    this._fieldMin = useLog ? Math.pow(10, min) : min;
    this._fieldMax = useLog ? Math.pow(10, max) : max;
  }

  /**
   * Get the profile array for the active field.
   */
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

  /**
   * Linearly interpolate a radial profile at fractional radius.
   */
  _interpProfile(rFracArr, values, rTarget) {
    if (rTarget <= rFracArr[0]) return values[0];
    if (rTarget >= rFracArr[rFracArr.length - 1]) return values[values.length - 1];

    // Binary search
    let lo = 0, hi = rFracArr.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (rFracArr[mid] <= rTarget) lo = mid;
      else hi = mid;
    }

    const frac = (rTarget - rFracArr[lo]) / (rFracArr[hi] - rFracArr[lo]);
    return values[lo] + frac * (values[hi] - values[lo]);
  }

  /**
   * Render one frame.
   * @param {number} time - animation time (for pulse effect)
   */
  render(time) {
    if (!this.model) return;

    const { size, imageData, radialLUT } = this;
    const data = imageData.data;
    const cx = size / 2;
    const cy = size / 2;
    const maxR = size / 2 - 2; // leave 2px border

    this.pulsePhase = (time || 0) * 0.5;

    // Fill pixel by pixel
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const rFrac = dist / maxR; // 0 at center, 1 at edge

        const idx = (py * size + px) * 4;

        if (rFrac > 1.0) {
          // Outside star
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 255;
          continue;
        }

        // Base color from radial LUT
        const lutIdx = Math.min(255, Math.floor(rFrac * 255));
        let r = radialLUT[lutIdx * 3];
        let g = radialLUT[lutIdx * 3 + 1];
        let b = radialLUT[lutIdx * 3 + 2];

        // 2D convection overlay (temperature perturbation)
        if (this.convSim && this.activeField === 'temperature') {
          const delta = this._sampleConvectionTemp(rFrac, Math.atan2(dy, dx));
          if (delta !== 0) {
            // Blend perturbation: brighter for hot plumes, darker for cool
            const boost = delta * 40; // scale for visibility
            r = Math.max(0, Math.min(255, r + boost));
            g = Math.max(0, Math.min(255, g + boost * 0.5));
            b = Math.max(0, Math.min(255, b - boost * 0.3));
          }
        }

        // Velocity field overlay: show flow in convective zones
        if (this.convSim && this.activeField === 'velocity') {
          const vMag = this._sampleConvectionVelocity(rFrac, Math.atan2(dy, dx));
          if (vMag > 0) {
            const cmap = getColormap('velocity');
            const [vr, vg, vb] = cmap(Math.min(1, vMag * 3));
            r = vr;
            g = vg;
            b = vb;
          }
        }

        // Radiative zone pulse (subtle outward-moving rings)
        if (this._isRadiative(rFrac)) {
          const pulse = this._radiativePulse(rFrac, time);
          r = Math.min(255, r + pulse * 15);
          g = Math.min(255, g + pulse * 15);
          b = Math.min(255, b + pulse * 20);
        }

        // Zone boundary highlight
        if (this._isNearBoundary(rFrac)) {
          r = Math.min(255, r + 60);
          g = Math.min(255, g + 60);
          b = Math.min(255, b + 60);
        }

        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    this.ctx.putImageData(imageData, 0, 0);

    // Draw zone boundary lines on top
    this._drawZoneBoundaries();

    // Draw colorbar
    this._drawColorbar();
  }

  /**
   * Sample the 2D convection simulation temperature perturbation at (r/R, θ).
   * Returns δT (deviation from mean) normalized to [-1, 1].
   */
  _sampleConvectionTemp(rFrac, theta) {
    const sim = this.convSim;
    if (!sim) return 0;

    const { rInner, rOuter, Nr, Ntheta, dtheta } = sim.grid;
    if (rFrac < rInner || rFrac > rOuter) return 0;

    // Convert to grid indices
    const fi = (rFrac - rInner) / (rOuter - rInner) * Nr;
    const normalizedTheta = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const fj = normalizedTheta / dtheta;

    // Bilinear interpolation
    const i0 = Math.max(0, Math.min(Math.floor(fi), Nr - 1));
    const i1 = Math.min(i0 + 1, Nr - 1);
    const j0 = Math.floor(fj) % Ntheta;
    const j1 = (j0 + 1) % Ntheta;
    const fr = fi - Math.floor(fi);
    const fth = fj - Math.floor(fj);

    const T00 = sim.temperature[i0 * Ntheta + j0];
    const T10 = sim.temperature[i1 * Ntheta + j0];
    const T01 = sim.temperature[i0 * Ntheta + j1];
    const T11 = sim.temperature[i1 * Ntheta + j1];

    const T = (1 - fr) * ((1 - fth) * T00 + fth * T01) +
              fr * ((1 - fth) * T10 + fth * T11);

    // Normalize to perturbation
    const T_mean = (sim.T_inner + sim.T_outer) / 2;
    const dT = sim.T_inner - sim.T_outer;
    return dT > 0 ? (T - T_mean) / dT : 0;
  }

  /**
   * Sample the 2D convection velocity magnitude at (r/R, θ).
   * Returns normalized magnitude [0, 1].
   */
  _sampleConvectionVelocity(rFrac, theta) {
    const sim = this.convSim;
    if (!sim) return 0;

    const { rInner, rOuter, Nr, Ntheta, dtheta } = sim.grid;
    if (rFrac < rInner || rFrac > rOuter) return 0;

    const fi = (rFrac - rInner) / (rOuter - rInner) * Nr;
    const normalizedTheta = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const fj = normalizedTheta / dtheta;

    const i = Math.max(0, Math.min(Math.round(fi), Nr - 1));
    const j = Math.round(fj) % Ntheta;
    const k = i * Ntheta + j;

    const vMag = Math.sqrt(sim.vr[k] * sim.vr[k] + sim.vtheta[k] * sim.vtheta[k]);

    // Normalize by max velocity
    const maxV = sim.maxVelocity() || 1;
    return vMag / maxV;
  }

  /**
   * Check if a radial position is in a radiative zone.
   */
  _isRadiative(rFrac) {
    if (!this.model) return false;
    const m = this.model;
    // Find nearest grid point
    const idx = Math.min(m.N - 1, Math.round(rFrac * (m.N - 1)));
    return !m.isConvective[idx];
  }

  /**
   * Subtle pulsating rings for radiative zones (photon diffusion visualization).
   */
  _radiativePulse(rFrac, time) {
    const phase = this.pulsePhase;
    // Outward-moving rings
    const wave = Math.sin((rFrac * 20 - phase) * Math.PI);
    return Math.max(0, wave) * 0.5; // only positive half
  }

  /**
   * Check if r/R is near a zone boundary.
   */
  _isNearBoundary(rFrac) {
    if (!this.model) return false;
    const threshold = 0.008;
    for (const bnd of this.model.zoneBoundaries) {
      if (Math.abs(rFrac - bnd) < threshold) return true;
    }
    return false;
  }

  /**
   * Draw dashed circles at zone boundaries.
   */
  _drawZoneBoundaries() {
    if (!this.model) return;
    const { ctx, size } = this;
    const cx = size / 2;
    const maxR = size / 2 - 2;

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';

    for (const bnd of this.model.zoneBoundaries) {
      const r = bnd * maxR;
      ctx.beginPath();
      ctx.arc(cx, cx, r, 0, 2 * Math.PI);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Draw a compact colorbar on the right side of the canvas.
   */
  _drawColorbar() {
    const { ctx, size } = this;
    const cmap = getColormap(this.activeField);
    const info = FIELD_INFO[this.activeField] || {};

    const barX = size - 30;
    const barY = 40;
    const barW = 12;
    const barH = size - 80;

    // Draw colorbar gradient
    for (let py = 0; py < barH; py++) {
      const t = 1 - py / barH; // top = max, bottom = min
      const [r, g, b] = cmap(t);
      ctx.fillStyle = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
      ctx.fillRect(barX, barY + py, barW, 1);
    }

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    // Labels
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';

    const maxLabel = this._formatValue(this._fieldMax);
    const minLabel = this._formatValue(this._fieldMin);
    ctx.fillText(maxLabel, barX - 3, barY + 10);
    ctx.fillText(minLabel, barX - 3, barY + barH);

    // Field name
    ctx.fillText(info.name || this.activeField, barX + barW, barY - 8);
  }

  /**
   * Format a value for display in the colorbar.
   */
  _formatValue(val) {
    if (val === undefined || !isFinite(val)) return '—';
    if (Math.abs(val) >= 1e6) return val.toExponential(1);
    if (Math.abs(val) >= 100) return Math.round(val).toString();
    if (Math.abs(val) >= 1) return val.toFixed(1);
    return val.toExponential(1);
  }

  /**
   * Get the field value at a pixel position (for tooltips).
   * @param {number} px - pixel x
   * @param {number} py - pixel y
   * @returns {{ rFrac: number, value: number, field: string, unit: string } | null}
   */
  getValueAt(px, py) {
    if (!this.model) return null;
    const cx = this.size / 2;
    const maxR = this.size / 2 - 2;
    const dx = px - cx;
    const dy = py - cx;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const rFrac = dist / maxR;
    if (rFrac > 1) return null;

    const profile = this._getFieldProfile();
    const value = this._interpProfile(this.model.rFrac, profile, rFrac);
    const info = FIELD_INFO[this.activeField] || {};

    return {
      rFrac,
      value,
      field: this.activeField,
      unit: info.unit || '',
    };
  }
}
