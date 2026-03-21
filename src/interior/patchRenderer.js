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
    this.depthInfo = null; // { rFrac, H_P, T, rho, g, boxSize_km }
  }

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

    // --- Layer 1: Temperature heatmap ---
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const cmap = getColormap('temperature');

    // Find T range in the sim
    let Tmin = Infinity, Tmax = -Infinity;
    for (let k = 0; k < sim.size; k++) {
      if (sim.T[k] < Tmin) Tmin = sim.T[k];
      if (sim.T[k] > Tmax) Tmax = sim.T[k];
    }
    const Trange = Tmax - Tmin || 1;

    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        // Map pixel to sim grid
        const fi = (px / size) * Nx;
        const fj = (py / size) * Ny; // py=0 = top = cool, py=size = bottom = hot

        // Bilinear interpolation
        const i0 = Math.min(Math.floor(fi), Nx - 1);
        const j0 = Math.min(Math.floor(fj), Ny - 1);
        const i1 = Math.min(i0 + 1, Nx - 1);
        const j1 = Math.min(j0 + 1, Ny - 1);
        const fx = fi - i0;
        const fy = fj - j0;

        // Note: sim j=0 is bottom (hot), but pixel y=0 is top.
        // Flip: sim_j = Ny - 1 - fj
        const sj0 = Ny - 1 - j0;
        const sj1 = Math.max(0, sj0 - 1);

        const T00 = sim.get(sim.T, i0, sj0);
        const T10 = sim.get(sim.T, i1, sj0);
        const T01 = sim.get(sim.T, i0, sj1);
        const T11 = sim.get(sim.T, i1, sj1);
        const Tval = (1 - fx) * ((1 - fy) * T00 + fy * T01) +
                     fx * ((1 - fy) * T10 + fy * T11);

        const t = (Tval - Tmin) / Trange;
        const [r, g, b] = cmap(Math.max(0, Math.min(1, t)));
        const idx = (py * size + px) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // --- Layer 2: Streamlines ---
    this._drawStreamlines();

    // --- Layer 3: Labels and info ---
    this._drawLabels();
  }

  _drawStreamlines() {
    const { ctx, size, sim } = this;
    if (!sim) return;
    const maxV = sim.maxVelocity();
    if (maxV < 1e-10) return;

    const { Nx, Ny } = sim;

    // Seed along bottom and mid-height
    const seeds = [];
    for (let s = 0; s < STREAMLINE_SEEDS; s++) {
      const i = (s + 0.5) / STREAMLINE_SEEDS * Nx;
      // Seed at 1/4 and 3/4 height
      seeds.push({ i, j: Ny * 0.25 });
      seeds.push({ i, j: Ny * 0.75 });
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
