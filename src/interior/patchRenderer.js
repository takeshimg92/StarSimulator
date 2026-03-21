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

const PARTICLE_COUNT = 800;
const PARTICLE_MAX_AGE = 180;
const TRAIL_WIDTH = 0.5; // in CSS pixels

export class PatchRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {number} size - canvas pixel size
   */
  constructor(canvas, size = 512) {
    this.canvas = canvas;

    // Let the canvas fill its container; read actual CSS size
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    this._updateSize();

    this.ctx = canvas.getContext('2d');
    this.ctx.scale(dpr, dpr); // scale so drawing coords are in CSS pixels
    this.sim = null;
    this.depthInfo = null;
    this.activeField = 'temperature';
    this.model = null;
    this.showStreamlines = true;

    // Material tracer particles
    this.particles = [];
    this._trailCanvas = null;
    this._trailCtx = null;
    this._prevPos = null; // previous pixel positions for drawing line segments

    // Global color range (set once from the 1D model, not per-frame)
    this._globalRange = null; // { T: {min,max}, rho: {min,max}, ... }
  }

  _updateSize() {
    const rect = this.canvas.getBoundingClientRect();
    // Use the CSS width (constrained by the panel), or fallback to 400
    const cssW = rect.width > 10 ? rect.width : 400;
    this.cssSize = cssW;
    this.size = Math.round(cssW * this.dpr);
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.ctx = this.canvas.getContext('2d');
  }

  setModel(model) {
    this.model = model;
    this._computeGlobalRanges();
  }

  setField(field) { this.activeField = field; }

  setShowStreamlines(show) { this.showStreamlines = show; }

  /**
   * Precompute global min/max for each field from the full 1D model.
   * Uses log scale for T, ρ, P, ε so the colormap spans the full star.
   */
  _computeGlobalRanges() {
    const m = this.model;
    if (!m) return;
    this._globalRange = {};
    const fields = {
      temperature: m.T,
      density: m.rho,
      pressure: m.P,
      energy: m.epsilon,
    };
    for (const [name, arr] of Object.entries(fields)) {
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (v > 0 && isFinite(v)) {
          const lv = Math.log10(v);
          if (lv < min) min = lv;
          if (lv > max) max = lv;
        }
      }
      this._globalRange[name] = { min, max };
    }
    // Velocity: linear scale, 0 to max
    let vMax = 0;
    for (let i = 0; i < m.v_conv.length; i++) {
      if (m.v_conv[i] > vMax) vMax = m.v_conv[i];
    }
    this._globalRange.velocity = { min: 0, max: vMax || 1 };
  }

  setSim(sim) {
    this.sim = sim;
    this._initParticles();
  }

  _initParticles() {
    if (!this.sim) return;
    const { Nx, Ny } = this.sim;
    this.particles = [];
    this._prevPos = new Float64Array(PARTICLE_COUNT * 2).fill(-1);
    for (let p = 0; p < PARTICLE_COUNT; p++) {
      this.particles.push(this._spawnParticle());
    }
    this._trailCanvas = document.createElement('canvas');
    this._trailCanvas.width = this.size;
    this._trailCanvas.height = this.size;
    this._trailCtx = this._trailCanvas.getContext('2d');
    this._trailCtx.clearRect(0, 0, this.size, this.size);
  }

  _spawnParticle() {
    const { Nx, Ny } = this.sim;
    return {
      ci: Math.random() * (Nx - 1),      // grid x
      cj: 1 + Math.random() * (Ny - 2),  // grid y (avoid boundaries)
      age: Math.floor(Math.random() * PARTICLE_MAX_AGE), // stagger ages
    };
  }

  setDepthInfo(info) {
    this.depthInfo = info;
  }

  render() {
    if (!this.sim) return;
    this._updateSize();
    const { ctx, sim, dpr } = this;
    const pixelSize = this.size; // actual pixel size (CSS * dpr)
    const cssSize = this.cssSize;
    const { Nx, Ny } = sim;

    // Reset transform for pixel-level drawing
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pixelSize, pixelSize);

    // --- Layer 1: Heatmap with base color + fluctuation brightness ---
    //
    // For each row (height), compute the horizontal average (= 1D base value).
    // Map the base through the colormap for the background color.
    // Then brighten (hot perturbation) or darken (cool perturbation) based
    // on the deviation from the average. This makes convective fluctuations
    // visible at every depth, while the base color shows the radial gradient.
    //
    const imgData = ctx.createImageData(pixelSize, pixelSize);
    const data = imgData.data;
    const cmap = getColormap(this.activeField);
    const fieldData = this._getFieldData();

    // Global range for base color (log scale for T/ρ/P/ε)
    const useLog = (this.activeField !== 'velocity');
    const gr = this._globalRange && this._globalRange[this.activeField];
    let gMin = gr ? gr.min : 0;
    let gMax = gr ? gr.max : 1;
    const gRange = gMax - gMin || 1;

    // Pre-compute row averages and values for fluctuation
    // (work in sim-grid rows, then map to pixels)
    const rowAvg = new Float64Array(Ny);
    const rowStd = new Float64Array(Ny);

    if (fieldData.is2D) {
      const f = fieldData.field;
      for (let sj = 0; sj < Ny; sj++) {
        let sum = 0;
        for (let i = 0; i < Nx; i++) sum += sim.get(f, i, sj);
        rowAvg[sj] = sum / Nx;
        let sq = 0;
        for (let i = 0; i < Nx; i++) sq += (sim.get(f, i, sj) - rowAvg[sj]) ** 2;
        rowStd[sj] = Math.sqrt(sq / Nx) || 1e-10;
      }
    }

    // Compute the physical value range at this depth from the 1D model.
    // The base color maps to this LOCAL range within the global colormap,
    // so the radial gradient (hotter at bottom, cooler at top) is visible
    // but doesn't span the entire star's range.
    let localTmin = 0, localTmax = 1;
    // For velocity: use sim's own range (not 1D model's v_conv which is in
    // different units and may be zero at this depth)
    const isVelocity = (this.activeField === 'velocity');
    if (isVelocity && fieldData.is2D) {
      // Find sim velocity magnitude range
      let vMin = Infinity, vMax = -Infinity;
      for (let k = 0; k < sim.size; k++) {
        const v = fieldData.field[k];
        if (v < vMin) vMin = v;
        if (v > vMax) vMax = v;
      }
      // Map directly: 0 → localTmin, max → localTmax (linear, full colormap)
      localTmin = 0;
      localTmax = 1;
      // Override gMin/gMax for the pixel loop below
      gMin = vMin;
      gMax = vMax;
    } else if (fieldData.is2D && this.depthInfo && this.model && gr) {
      const m = this.model;
      const rCenter = this.depthInfo.rFrac;
      const H_P = this.depthInfo.H_P_km * 1000;
      const R = m.radius * 6.957e8;
      const boxHalf = 1.75 * H_P / R;

      // Physical values at bottom (deeper) and top (shallower) of box
      const rBot = Math.max(0, rCenter - boxHalf);
      const rTop = Math.min(1, rCenter + boxHalf);

      // Interpolate from model
      const interpT = (rFrac, arr) => {
        const rArr = m.rFrac;
        let lo = 0, hi = rArr.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (rArr[mid] <= rFrac) lo = mid; else hi = mid; }
        const f = rArr[hi] !== rArr[lo] ? Math.max(0, Math.min(1, (rFrac - rArr[lo]) / (rArr[hi] - rArr[lo]))) : 0;
        return arr[lo] + f * (arr[hi] - arr[lo]);
      };

      const physBot = interpT(rBot, m.T); // hotter (bottom)
      const physTop = interpT(rTop, m.T); // cooler (top)

      // Map to global colormap positions
      if (useLog && physBot > 0 && physTop > 0) {
        localTmax = (Math.log10(physBot) - gMin) / gRange; // bottom = higher T = higher t
        localTmin = (Math.log10(physTop) - gMin) / gRange; // top = lower T = lower t
      }
    }

    // Store for text color decisions
    this._localTmin = localTmin;
    this._localTmax = localTmax;

    // Subtle fluctuation gain
    const FLUCT_GAIN = 12;

    for (let py = 0; py < pixelSize; py++) {
      for (let px = 0; px < pixelSize; px++) {
        const fi = (px / pixelSize) * Nx;
        const fj = (py / pixelSize) * Ny;
        const i0 = Math.min(Math.floor(fi), Nx - 1);
        const j0 = Math.min(Math.floor(fj), Ny - 1);
        const fx = fi - i0;
        const fy = fj - j0;

        const sj0 = Ny - 1 - j0;
        const sj1 = Math.max(0, sj0 - 1);

        let val, baseVal;
        if (fieldData.is2D) {
          const f = fieldData.field;
          const v00 = sim.get(f, i0, sj0);
          const v10 = sim.get(f, i0 + 1, sj0);
          const v01 = sim.get(f, i0, sj1);
          const v11 = sim.get(f, i0 + 1, sj1);
          val = (1 - fx) * ((1 - fy) * v00 + fy * v01) +
                fx * ((1 - fy) * v10 + fy * v11);
          baseVal = (1 - fy) * rowAvg[sj0] + fy * rowAvg[sj1];
        } else {
          val = fieldData.values[sj0] || 0;
          baseVal = val;
        }

        // Map base value to colormap position
        let t;
        if (isVelocity && fieldData.is2D) {
          // Velocity: map sim value directly to [0,1] using sim's own range
          const vRange = gMax - gMin || 1;
          t = (val - gMin) / vRange;
        } else if (fieldData.is2D) {
          // T and other 2D fields: map to local physical range
          t = localTmin + (localTmax - localTmin) * baseVal;
        } else if (useLog && baseVal > 0) {
          t = (Math.log10(baseVal) - gMin) / gRange;
        } else {
          t = (baseVal - gMin) / gRange;
        }
        t = Math.max(0, Math.min(1, t));

        const [cr, cg, cb] = cmap(t);

        // Subtle fluctuation brightness
        let fluct = 0;
        if (fieldData.is2D) {
          const dev = val - baseVal;
          const std = (1 - fy) * rowStd[sj0] + fy * rowStd[sj1];
          fluct = (std > 1e-12) ? (dev / std) * FLUCT_GAIN : 0;
        }

        const idx4 = (py * pixelSize + px) * 4;
        data[idx4] = Math.max(0, Math.min(255, cr + fluct));
        data[idx4 + 1] = Math.max(0, Math.min(255, cg + fluct));
        data[idx4 + 2] = Math.max(0, Math.min(255, cb + fluct));
        data[idx4 + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // Restore DPR scaling for vector drawing (labels, streamlines)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // --- Layer 2: Streamlines (if enabled) ---
    if (this.showStreamlines) {
      this._drawStreamlines();
    }

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

  /**
   * Advect and draw material tracer particles.
   * Each particle drifts with the local velocity, colored by temperature.
   * Fading trails show the flow history.
   */
  _drawStreamlines() {
    const { sim, cssSize: size, particles } = this;
    if (!sim || !particles.length) return;

    const { Nx, Ny } = sim;
    const maxV = sim.maxVelocity();
    if (maxV < 1e-12) return;

    // Ensure trail canvas matches current size
    if (!this._trailCanvas || this._trailCanvas.width !== this.size) {
      this._trailCanvas = document.createElement('canvas');
      this._trailCanvas.width = this.size;
      this._trailCanvas.height = this.size;
      this._trailCtx = this._trailCanvas.getContext('2d');
    }
    const tctx = this._trailCtx;

    // Fade trails — balance between persistence and not obscuring heatmap
    tctx.globalCompositeOperation = 'destination-out';
    tctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    tctx.fillRect(0, 0, this.size, this.size);
    tctx.globalCompositeOperation = 'source-over';

    const dpr = this.dpr;
    // Normalize so particles move ~0.15 grid cells/frame at max velocity.
    // Slower = smoother trails, less chaotic appearance.
    const advectScale = maxV > 0.01 ? 0.15 / maxV : 0;

    for (let pidx = 0; pidx < particles.length; pidx++) {
      const p = particles[pidx];
      // Sample velocity at particle position (bilinear)
      const i0 = Math.max(0, Math.min(Math.floor(p.ci), Nx - 2));
      const j0 = Math.max(0, Math.min(Math.floor(p.cj), Ny - 2));
      const fx = p.ci - i0;
      const fy = p.cj - j0;

      const vx = (1 - fx) * ((1 - fy) * sim.get(sim.vx, i0, j0) + fy * sim.get(sim.vx, i0, j0 + 1)) +
                 fx * ((1 - fy) * sim.get(sim.vx, i0 + 1, j0) + fy * sim.get(sim.vx, i0 + 1, j0 + 1));
      const vy = (1 - fx) * ((1 - fy) * sim.get(sim.vy, i0, j0) + fy * sim.get(sim.vy, i0, j0 + 1)) +
                 fx * ((1 - fy) * sim.get(sim.vy, i0 + 1, j0) + fy * sim.get(sim.vy, i0 + 1, j0 + 1));

      // Advect particle
      const speed = Math.sqrt(vx * vx + vy * vy);
      p.ci += vx * advectScale / sim.dx;
      p.cj += vy * advectScale / sim.dy;

      // Only age particles that are actually moving — prevents premature
      // respawn while convection is still developing from initial conditions
      if (speed > maxV * 0.01) p.age++;

      // Respawn if out of bounds, stuck near walls, or too old
      const wallDist = Math.min(p.cj, Ny - 1 - p.cj);
      const stuckAtWall = wallDist < 2 && speed < maxV * 0.02;
      if (p.ci < 0 || p.ci > Nx - 1 || p.cj < 0.5 || p.cj > Ny - 1.5 || stuckAtWall || p.age > PARTICLE_MAX_AGE) {
        const fresh = this._spawnParticle();
        p.ci = fresh.ci;
        p.cj = fresh.cj;
        p.age = 0;
        this._prevPos[pidx * 2] = -1; // clear trail on respawn
        this._prevPos[pidx * 2 + 1] = -1;
        continue;
      }

      // Pixel position (in actual canvas pixels for trail drawing)
      const px = (p.ci / Nx) * this.size;
      const py = (1 - p.cj / Ny) * this.size;

      // Draw line segment from previous position to current
      const prevPx = this._prevPos[pidx * 2];
      const prevPy = this._prevPos[pidx * 2 + 1];

      if (prevPx >= 0 && prevPy >= 0) {
        // Only draw if the segment isn't too long (skip respawn jumps)
        const segLen = Math.sqrt((px - prevPx) ** 2 + (py - prevPy) ** 2);
        if (segLen < this.size * 0.1) {
          tctx.strokeStyle = 'rgba(230, 230, 230, 0.35)';
          tctx.lineWidth = TRAIL_WIDTH * dpr;
          tctx.lineCap = 'round';
          tctx.beginPath();
          tctx.moveTo(prevPx, prevPy);
          tctx.lineTo(px, py);
          tctx.stroke();
        }
      }

      this._prevPos[pidx * 2] = px;
      this._prevPos[pidx * 2 + 1] = py;
    }

    // Composite trail canvas onto main canvas
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this._trailCanvas, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // restore CSS space
  }

  /**
   * Draw a small schematic of the star cross-section with the box's
   * radial position and angular extent highlighted.
   */
  _drawMiniMap() {
    if (!this.depthInfo || !this.model) return;
    const { ctx, cssSize: size } = this;

    const mapR = 36;
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

    // Box position: fixed-pixel-size square marker at current depth
    const rFrac = this.depthInfo.rFrac;
    const markerPx = 6; // half-size in pixels (constant regardless of depth)
    const markerY = cy - rFrac * mapR; // above center (upward = outward)
    const markerX = cx;

    ctx.fillStyle = 'rgba(255, 200, 80, 0.6)';
    ctx.fillRect(markerX - markerPx, markerY - markerPx, markerPx * 2, markerPx * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(markerX - markerPx, markerY - markerPx, markerPx * 2, markerPx * 2);

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 1.5, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(255, 255, 200, 0.6)';
    ctx.fill();
  }

  /** Enable text shadow for readability on any background. */
  _setTextShadow(on) {
    this.ctx.shadowColor = on ? 'rgba(0, 0, 0, 0.8)' : 'transparent';
    this.ctx.shadowBlur = on ? 3 : 0;
    this.ctx.shadowOffsetX = on ? 1 : 0;
    this.ctx.shadowOffsetY = on ? 1 : 0;
  }

  _drawLabels() {
    const { ctx, cssSize: size, depthInfo } = this;
    const info = FIELD_INFO[this.activeField] || {};

    this._setTextShadow(true);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '10px Inter, sans-serif';

    // Top-left: position info
    ctx.textAlign = 'left';
    if (depthInfo) {
      ctx.fillText(`r/R = ${depthInfo.rFrac.toFixed(2)}`, 8, 16);
      ctx.fillText(`H_P = ${(depthInfo.H_P_km).toFixed(0)} km`, 8, 28);
      ctx.fillText(`Box: ${depthInfo.boxSize_km.toFixed(0)} km`, 8, 40);
    }

    // Bottom/top labels
    ctx.fillStyle = 'rgba(255, 150, 50, 0.8)';
    ctx.textAlign = 'center';
    ctx.fillText('deeper (hotter)', size / 2, size - 6);
    ctx.fillStyle = 'rgba(80, 160, 255, 0.8)';
    ctx.fillText('shallower (cooler)', size / 2, 14);

    // Ra label
    if (this.sim) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.textAlign = 'right';
      ctx.fillText(`Ra = ${this.sim.Ra.toExponential(1)}`, size - 8, size - 6);
    }

    this._setTextShadow(false);

    // --- Colorbar ---
    this._drawColorbar(size, info);
  }

  _drawColorbar(size, info) {
    const { ctx } = this;
    const cmap = getColormap(this.activeField);

    const barX = 8;
    const barY = size - 60;
    const barW = 10;
    const barH = 45;

    // Draw gradient
    for (let py = 0; py < barH; py++) {
      const t = 1 - py / barH; // top of bar = max
      const [r, g, b] = cmap(t);
      ctx.fillStyle = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
      ctx.fillRect(barX, barY + py, barW, 1);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(barX, barY, barW, barH);

    // Compute value range for labels
    let valMax = '', valMin = '';
    if (this.activeField === 'velocity' && this.sim) {
      // Velocity: show "relative" since sim units aren't physical
      valMax = 'max';
      valMin = '0';
    } else if (this.depthInfo && this.model) {
      const gr = this._globalRange && this._globalRange[this.activeField];
      if (gr) {
        valMax = this._fmtVal(Math.pow(10, gr.max)) + ' ' + (info.unit || '');
        valMin = this._fmtVal(Math.pow(10, gr.min)) + ' ' + (info.unit || '');
      }
    }

    this._setTextShadow(true);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(valMax, barX + barW + 3, barY + 7);
    ctx.fillText(valMin, barX + barW + 3, barY + barH);

    // Field name + unit
    ctx.font = '9px Inter, sans-serif';
    ctx.fillText(info.name || this.activeField, barX + barW + 3, barY - 4);
    this._setTextShadow(false);
  }

  _fmtVal(v) {
    if (!isFinite(v)) return '—';
    if (Math.abs(v) >= 1e9) return v.toExponential(1);
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'k';
    if (Math.abs(v) >= 1) return v.toFixed(1);
    if (Math.abs(v) >= 0.01) return v.toFixed(3);
    return v.toExponential(1);
  }
}
