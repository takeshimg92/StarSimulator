/**
 * Local-patch renderer for the stellar interior.
 *
 * Renders a small Cartesian box (a few H_P wide) at a specific depth,
 * showing the temperature field from the 2D Rayleigh-Bénard simulation
 * with streamlines overlaid.
 *
 * Bottom = deeper (hotter), Top = shallower (cooler).
 */

import { getColormap, FIELD_INFO } from './colormaps.js';

const STREAMLINE_SEEDS = 30;
const STREAMLINE_STEPS = 80;
const STREAMLINE_DT = 0.008;

export class PatchRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {number} size - canvas pixel size
   */
  constructor(canvas, size = 512) {
    this.canvas = canvas;
    this.size = size;
    canvas.width = size;
    canvas.height = size;
    this.ctx = canvas.getContext('2d');
    this.sim = null;
    this.depthInfo = null;
    this.activeField = 'temperature'; // 'temperature', 'density', 'pressure', 'energy', 'velocity'
    this.model = null; // 1D interior model for radial profile rendering
  }

  setModel(model) { this.model = model; }

  setField(field) { this.activeField = field; }

  setSim(sim) {
    this.sim = sim;
  }

  setDepthInfo(info) {
    this.depthInfo = info;
  }

  render() {
    if (!this.sim) return;
    const { ctx, size, sim } = this;
    const { Nx, Ny } = sim;

    ctx.clearRect(0, 0, size, size);

    // --- Layer 1: Heatmap for active field ---
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const cmap = getColormap(this.activeField);
    const fieldData = this._getFieldData();

    // Find range
    let fMin = Infinity, fMax = -Infinity;
    for (const v of fieldData.values) {
      if (v < fMin) fMin = v;
      if (v > fMax) fMax = v;
    }
    const fRange = fMax - fMin || 1;

    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const fi = (px / size) * Nx;
        const fj = (py / size) * Ny;
        const i0 = Math.min(Math.floor(fi), Nx - 1);
        const j0 = Math.min(Math.floor(fj), Ny - 1);
        const fx = fi - i0;
        const fy = fj - j0;

        // Flip y: sim j=0 is bottom (hot), pixel y=0 is top
        const sj0 = Ny - 1 - j0;
        const sj1 = Math.max(0, sj0 - 1);

        let val;
        if (fieldData.is2D) {
          const f = fieldData.field;
          const v00 = sim.get(f, i0, sj0);
          const v10 = sim.get(f, i0 + 1, sj0);
          const v01 = sim.get(f, i0, sj1);
          const v11 = sim.get(f, i0 + 1, sj1);
          val = (1 - fx) * ((1 - fy) * v00 + fy * v01) +
                fx * ((1 - fy) * v10 + fy * v11);
        } else {
          // 1D profile: only varies with height (j)
          val = fieldData.values[sj0] || 0;
        }

        const t = (val - fMin) / fRange;
        const [r, g, b] = cmap(Math.max(0, Math.min(1, t)));
        const idx4 = (py * size + px) * 4;
        data[idx4] = r;
        data[idx4 + 1] = g;
        data[idx4 + 2] = b;
        data[idx4 + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // --- Layer 2: Streamlines ---
    this._drawStreamlines();

    // --- Layer 3: Mini-map showing box position in star ---
    this._drawMiniMap();

    // --- Layer 4: Labels and info ---
    this._drawLabels();
  }

  /**
   * Get the field data for the active field.
   * Returns { field, values, is2D }.
   *   - is2D=true: field is a sim Float64Array, sample with (i, j)
   *   - is2D=false: values is a 1D array[Ny], varies only with height
   */
  _getFieldData() {
    const { sim } = this;
    const { Nx, Ny } = sim;

    if (this.activeField === 'temperature') {
      return { field: sim.T, values: sim.T, is2D: true };
    }

    if (this.activeField === 'velocity') {
      // Velocity magnitude from sim
      const vmag = new Float64Array(sim.size);
      for (let k = 0; k < sim.size; k++) {
        vmag[k] = Math.sqrt(sim.vx[k] * sim.vx[k] + sim.vy[k] * sim.vy[k]);
      }
      return { field: vmag, values: vmag, is2D: true };
    }

    // For density, pressure, energy: use 1D radial profile from the interior model
    // mapped to box height (bottom = deeper = higher values)
    if (!this.model || !this.depthInfo) {
      // Fallback: linear gradient
      const vals = new Float64Array(Ny);
      for (let j = 0; j < Ny; j++) vals[j] = j / (Ny - 1);
      return { field: null, values: vals, is2D: false };
    }

    const m = this.model;
    const rCenter = this.depthInfo.rFrac;
    const H_P = this.depthInfo.H_P_km * 1000; // back to meters
    const R = m.radius * 6.957e8; // R_sun in meters
    const boxHalf = 1.75 * H_P; // half the box height in meters

    let profileArr;
    switch (this.activeField) {
      case 'density': profileArr = m.rho; break;
      case 'pressure': profileArr = m.P; break;
      case 'energy': profileArr = m.epsilon; break;
      default: profileArr = m.T;
    }

    const vals = new Float64Array(Ny);
    for (let j = 0; j < Ny; j++) {
      // j=0 is bottom (deeper, larger r toward center), j=Ny-1 is top (shallower)
      const frac = j / (Ny - 1); // 0=bottom, 1=top
      const rFrac = rCenter + (0.5 - frac) * (3.5 * H_P / R);
      // Interpolate from model
      const rArr = m.rFrac;
      let lo = 0, hi = rArr.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (rArr[mid] <= rFrac) lo = mid; else hi = mid; }
      const f = rArr[hi] !== rArr[lo] ? (rFrac - rArr[lo]) / (rArr[hi] - rArr[lo]) : 0;
      vals[j] = profileArr[lo] + Math.max(0, Math.min(1, f)) * (profileArr[hi] - profileArr[lo]);
    }

    return { field: null, values: vals, is2D: false };
  }

  _drawStreamlines() {
    const { ctx, size, sim } = this;
    if (!sim) return;
    const maxV = sim.maxVelocity();
    if (maxV < 1e-10) return;

    const { Nx, Ny } = sim;

    // Seed points scattered across the domain (avoid fixed rows)
    const seeds = [];
    const total = STREAMLINE_SEEDS * 2;
    for (let s = 0; s < total; s++) {
      seeds.push({
        i: (s * 7.13 + 3.7) % Nx,  // quasi-random spread via irrational offset
        j: 2 + ((s * 11.17 + 1.3) % (Ny - 4)),
      });
    }

    for (const seed of seeds) {
      const points = [];
      let ci = seed.i, cj = seed.j;

      for (let step = 0; step < STREAMLINE_STEPS; step++) {
        // Sample velocity at (ci, cj) with bilinear interp
        const i0 = Math.floor(ci);
        const j0 = Math.floor(cj);
        const fx = ci - i0;
        const fy = cj - j0;

        const vx = (1 - fx) * ((1 - fy) * sim.get(sim.vx, i0, j0) + fy * sim.get(sim.vx, i0, j0 + 1)) +
                   fx * ((1 - fy) * sim.get(sim.vx, i0 + 1, j0) + fy * sim.get(sim.vx, i0 + 1, j0 + 1));
        const vy = (1 - fx) * ((1 - fy) * sim.get(sim.vy, i0, j0) + fy * sim.get(sim.vy, i0, j0 + 1)) +
                   fx * ((1 - fy) * sim.get(sim.vy, i0 + 1, j0) + fy * sim.get(sim.vy, i0 + 1, j0 + 1));

        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed < 1e-12) break;

        // Map to pixel coordinates (flip y)
        const px = (ci / Nx) * size;
        const py = (1 - cj / Ny) * size;
        points.push({ px, py, vy });

        // RK2 integration in grid-index space
        const dt = STREAMLINE_DT;
        const ci_mid = ci + 0.5 * dt * vx / sim.dx;
        const cj_mid = cj + 0.5 * dt * vy / sim.dy;
        const vx2 = this._sampleV(sim.vx, ci_mid, cj_mid);
        const vy2 = this._sampleV(sim.vy, ci_mid, cj_mid);

        ci += dt * vx2 / sim.dx;
        cj += dt * vy2 / sim.dy;

        // Stop if out of bounds
        if (cj < 0.5 || cj > Ny - 1.5 || ci < -Nx * 0.5 || ci > Nx * 1.5) break;
        // Wrap x (periodic)
        ci = ((ci % Nx) + Nx) % Nx;
      }

      if (points.length < 3) continue;

      // Color by average vy: positive (rising) = warm, negative (sinking) = cool
      const avgVy = points.reduce((s, p) => s + p.vy, 0) / points.length;
      let color;
      if (avgVy > 0.01 * maxV) {
        color = 'rgba(255, 200, 80, 0.5)';  // rising hot
      } else if (avgVy < -0.01 * maxV) {
        color = 'rgba(80, 160, 255, 0.5)';   // sinking cool
      } else {
        color = 'rgba(200, 200, 200, 0.3)';
      }

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.0;
      ctx.moveTo(points[0].px, points[0].py);
      for (let k = 1; k < points.length; k++) {
        ctx.lineTo(points[k].px, points[k].py);
      }
      ctx.stroke();

      // Arrowhead
      if (points.length >= 3) {
        const last = points[points.length - 1];
        const prev = points[points.length - 3];
        const angle = Math.atan2(last.py - prev.py, last.px - prev.px);
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.moveTo(last.px, last.py);
        ctx.lineTo(last.px - 4 * Math.cos(angle - 0.4), last.py - 4 * Math.sin(angle - 0.4));
        ctx.lineTo(last.px - 4 * Math.cos(angle + 0.4), last.py - 4 * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  _sampleV(field, ci, cj) {
    const { Nx, Ny } = this.sim;
    const i0 = Math.floor(((ci % Nx) + Nx) % Nx);
    const j0 = Math.max(0, Math.min(Math.floor(cj), Ny - 2));
    const fx = ci - Math.floor(ci);
    const fy = cj - j0;
    return (1 - fx) * ((1 - fy) * this.sim.get(field, i0, j0) + fy * this.sim.get(field, i0, j0 + 1)) +
           fx * ((1 - fy) * this.sim.get(field, i0 + 1, j0) + fy * this.sim.get(field, i0 + 1, j0 + 1));
  }

  /**
   * Draw a small schematic of the star cross-section with the box's
   * radial position and angular extent highlighted.
   */
  _drawMiniMap() {
    if (!this.depthInfo || !this.model) return;
    const { ctx, size } = this;

    const mapR = 36; // radius of the mini-star circle
    const cx = size - mapR - 10;
    const cy = mapR + 30;

    // Star circle (dark fill)
    ctx.beginPath();
    ctx.arc(cx, cy, mapR, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(40, 20, 0, 0.7)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 200, 100, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Zone boundaries (dashed arcs)
    ctx.save();
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 0.5;
    for (const bnd of this.model.zoneBoundaries) {
      ctx.beginPath();
      ctx.arc(cx, cy, bnd * mapR, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();

    // Box position: show as a highlighted radial band
    const rFrac = this.depthInfo.rFrac;
    const R_star = this.model.radius * 6.957e8;
    const H_P = this.depthInfo.H_P_km * 1000;
    const boxHalfR = (1.75 * H_P / R_star); // half box height in r/R
    const rInner = Math.max(0, rFrac - boxHalfR);
    const rOuter = Math.min(1, rFrac + boxHalfR);

    // Draw the box as a highlighted annular wedge (small angle for visibility)
    const wedgeAngle = Math.PI / 6; // 30° for visibility
    const startAngle = -Math.PI / 2 - wedgeAngle / 2;
    const endAngle = -Math.PI / 2 + wedgeAngle / 2;

    ctx.beginPath();
    ctx.arc(cx, cy, rOuter * mapR, startAngle, endAngle);
    ctx.arc(cx, cy, rInner * mapR, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 200, 80, 0.5)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 1.5, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(255, 255, 200, 0.6)';
    ctx.fill();
  }

  _drawLabels() {
    const { ctx, size, depthInfo } = this;

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '10px Inter, sans-serif';

    // Top-left: depth info
    ctx.textAlign = 'left';
    if (depthInfo) {
      ctx.fillText(`Depth: r/R = ${depthInfo.rFrac.toFixed(2)}`, 8, 16);
      ctx.fillText(`H_P = ${(depthInfo.H_P_km).toFixed(0)} km`, 8, 28);
      ctx.fillText(`Box: ${depthInfo.boxSize_km.toFixed(0)} km`, 8, 40);
    }

    // Bottom/top labels
    ctx.fillStyle = 'rgba(255,150,50,0.6)';
    ctx.textAlign = 'center';
    ctx.fillText('deeper (hotter)', size / 2, size - 6);
    ctx.fillStyle = 'rgba(80,160,255,0.6)';
    ctx.fillText('shallower (cooler)', size / 2, 14);

    // Ra label
    if (this.sim) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.textAlign = 'right';
      ctx.fillText(`Ra = ${this.sim.Ra.toExponential(1)}`, size - 8, size - 6);
    }
  }
}
