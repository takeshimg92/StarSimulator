/**
 * Local-patch convection simulation on a Cartesian grid.
 *
 * Simulates Rayleigh-Bénard convection in a small box (a few pressure
 * scale heights) at a specific depth within the star. Physical conditions
 * (T, ρ, g, κ_th) are taken from the 1D interior model at that depth,
 * so they are nearly uniform across the box — no multi-scale issues.
 *
 * Boussinesq Navier-Stokes + thermal:
 *   ∂v/∂t + (v·∇)v = -∇p/ρ₀ + ν∇²v + α g δT ŷ
 *   ∇·v = 0
 *   ∂T/∂t + (v·∇)T = κ_th ∇²T
 *
 * ŷ = radial (upward = away from center), x = tangential.
 * Hot bottom (deeper), cool top (shallower).
 *
 * Stable Fluids (Jos Stam) algorithm:
 *   1. Add buoyancy force
 *   2. Diffuse (implicit Gauss-Seidel)
 *   3. Project (pressure Poisson via Gauss-Seidel)
 *   4. Advect (semi-Lagrangian)
 *   5. Project again
 *   6. Advect + diffuse temperature
 */

export class CartesianSim {
  /**
   * @param {object} opts
   * @param {number} opts.Nx - horizontal grid cells (default 128)
   * @param {number} opts.Ny - vertical grid cells (default 128)
   * @param {number} opts.aspectRatio - width/height (default 1)
   * @param {number} opts.Ra - Rayleigh number (drives convection vigor)
   * @param {number} opts.Pr - Prandtl number ν/κ_th (default 0.7)
   * @param {number} opts.T_bot - bottom temperature (default 1)
   * @param {number} opts.T_top - top temperature (default 0)
   */
  constructor(opts = {}) {
    this.Nx = opts.Nx || 128;
    this.Ny = opts.Ny || 128;
    this.aspectRatio = opts.aspectRatio || 1;

    // Physical parameters (normalized)
    this.Ra = opts.Ra || 1e4;    // Rayleigh number
    this.Pr = opts.Pr || 0.7;   // Prandtl number

    // Non-dimensionalization: box height H = 1, ΔT = 1, α = 1.
    // Ra = g·α·ΔT·H³ / (ν·κ_th)
    // Pr = ν / κ_th
    //
    // Set κ_th = 1, ν = Pr, g_eff = Ra·Pr (= Ra·ν·κ_th with κ_th=1).
    // This gives the correct coupling strength between T and v.
    this.kappa_th = 1.0;
    this.nu = this.Pr;       // Pr = ν/κ_th, so ν = Pr when κ_th = 1
    this.g_eff = this.Ra * this.Pr;

    this.T_bot = opts.T_bot ?? 1.0;
    this.T_top = opts.T_top ?? 0.0;

    this.dx = this.aspectRatio / this.Nx;
    this.dy = 1.0 / this.Ny;

    const size = this.Nx * this.Ny;
    this.size = size;

    // Fields
    this.vx = new Float64Array(size);
    this.vy = new Float64Array(size);
    this.T = new Float64Array(size);

    // Work buffers
    this.vx0 = new Float64Array(size);
    this.vy0 = new Float64Array(size);
    this.T0 = new Float64Array(size);
    this.p = new Float64Array(size);
    this.div = new Float64Array(size);

    this._initTemperature();
    this.time = 0;
  }

  /** Index with periodic x, clamped y. */
  idx(i, j) {
    const ii = ((i % this.Nx) + this.Nx) % this.Nx;  // periodic x
    const jj = Math.max(0, Math.min(j, this.Ny - 1)); // clamped y
    return jj * this.Nx + ii;
  }

  get(field, i, j) { return field[this.idx(i, j)]; }
  set(field, i, j, val) { field[this.idx(i, j)] = val; }

  /**
   * Initialize temperature: linear conduction profile + perturbation.
   */
  _initTemperature() {
    const { Nx, Ny } = this;
    const dT = this.T_bot - this.T_top;

    for (let j = 0; j < Ny; j++) {
      const frac = j / (Ny - 1); // 0 = bottom (hot), 1 = top (cool)
      const T_base = this.T_bot - dT * frac;

      for (let i = 0; i < Nx; i++) {
        // Smooth multi-mode perturbation (no white noise)
        // Modes at different scales seed convection cells of various sizes
        const mode1 = 0.04 * dT * Math.sin(2 * Math.PI * i / Nx * 3) * Math.sin(Math.PI * frac);
        const mode2 = 0.02 * dT * Math.sin(2 * Math.PI * i / Nx * 6 + 1.3) * Math.sin(2 * Math.PI * frac);
        const mode3 = 0.01 * dT * Math.sin(2 * Math.PI * i / Nx * 11 + 2.7) * Math.sin(3 * Math.PI * frac);
        this.set(this.T, i, j, T_base + mode1 + mode2 + mode3);
      }
    }

    // Small smooth velocity seed
    for (let j = 0; j < Ny; j++) {
      for (let i = 0; i < Nx; i++) {
        const k = this.idx(i, j);
        this.vx[k] = 0.02 * Math.sin(2 * Math.PI * i / Nx * 4) * Math.sin(Math.PI * j / Ny);
        this.vy[k] = 0.02 * Math.cos(2 * Math.PI * i / Nx * 4) * Math.sin(Math.PI * j / Ny);
      }
    }
  }

  reset(opts = {}) {
    if (opts.Ra !== undefined) this.Ra = opts.Ra;
    if (opts.Pr !== undefined) this.Pr = opts.Pr;
    if (opts.Nx !== undefined || opts.Ny !== undefined) {
      this.Nx = opts.Nx || this.Nx;
      this.Ny = opts.Ny || this.Ny;
      this.dx = this.aspectRatio / this.Nx;
      this.dy = 1.0 / this.Ny;
      const size = this.Nx * this.Ny;
      this.size = size;
      this.vx = new Float64Array(size);
      this.vy = new Float64Array(size);
      this.T = new Float64Array(size);
      this.vx0 = new Float64Array(size);
      this.vy0 = new Float64Array(size);
      this.T0 = new Float64Array(size);
      this.p = new Float64Array(size);
      this.div = new Float64Array(size);
    } else {
      this.vx.fill(0);
      this.vy.fill(0);
    }

    this.kappa_th = 1.0;
    this.nu = this.Pr;
    this.g_eff = this.Ra * this.Pr;

    this._initTemperature();
    this.time = 0;
  }

  /**
   * Advance by one timestep.
   */
  step(dt) {
    const { vx, vy, T, vx0, vy0, T0, p, div } = this;
    const { Nx, Ny, size } = this;

    // 1. Buoyancy: F_y = g_eff · (T - T_avg_at_height)
    //    Using angular (horizontal) average as reference prevents net vertical drift.
    for (let j = 0; j < Ny; j++) {
      let T_avg = 0;
      for (let i = 0; i < Nx; i++) T_avg += this.get(T, i, j);
      T_avg /= Nx;
      for (let i = 0; i < Nx; i++) {
        const k = this.idx(i, j);
        vy[k] += dt * this.g_eff * (T[k] - T_avg);
      }
    }

    // 2. Diffuse velocity
    vx0.set(vx); vy0.set(vy);
    this._diffuse(vx, vx0, this.nu, dt);
    this._diffuse(vy, vy0, this.nu, dt);

    // 3. Project
    this._project();

    // 4. Advect velocity
    vx0.set(vx); vy0.set(vy);
    this._advect(vx, vx0, vy0, dt);
    this._advect(vy, vx0, vy0, dt);

    // 5. Project again
    this._project();

    // 6. Temperature: advect + diffuse
    T0.set(T);
    this._advect(T, vx, vy, dt);
    T0.set(T);
    this._diffuse(T, T0, this.kappa_th, dt);

    // 7. Subgrid turbulent forcing: small random velocity kicks
    //    to maintain fine-scale structure that the coarse grid and
    //    diffusive semi-Lagrangian advection would otherwise damp out
    this._addTurbulentNoise(dt);

    // 8. Enforce BCs
    this._enforceBCs();

    this.time += dt;
  }

  _diffuse(field, field0, diff, dt, iterations = 15) {
    const { Nx, Ny, dx, dy } = this;
    const ax = diff * dt / (dx * dx);
    const ay = diff * dt / (dy * dy);
    const denom = 1 + 2 * ax + 2 * ay;

    for (let iter = 0; iter < iterations; iter++) {
      for (let j = 0; j < Ny; j++) {
        for (let i = 0; i < Nx; i++) {
          const k = this.idx(i, j);
          const left = this.get(field, i - 1, j);
          const right = this.get(field, i + 1, j);
          const down = (j > 0) ? this.get(field, i, j - 1) : this.get(field, i, j);
          const up = (j < Ny - 1) ? this.get(field, i, j + 1) : this.get(field, i, j);
          field[k] = (field0[k] + ax * (left + right) + ay * (down + up)) / denom;
        }
      }
    }
  }

  _advect(field, vxF, vyF, dt) {
    const { Nx, Ny, dx, dy } = this;
    const tmp = this.T0; // reuse buffer
    tmp.set(field);

    for (let j = 0; j < Ny; j++) {
      for (let i = 0; i < Nx; i++) {
        const k = this.idx(i, j);
        // Backtrace
        const si = i - vxF[k] * dt / dx;
        const sj = j - vyF[k] * dt / dy;

        // Bilinear interpolation
        const si_c = Math.max(0, Math.min(si, Nx - 1.001));
        const sj_c = Math.max(0, Math.min(sj, Ny - 1.001));
        const i0 = Math.floor(si_c);
        const j0 = Math.floor(sj_c);
        const fx = si_c - i0;
        const fy = sj_c - j0;

        const v00 = this.get(tmp, i0, j0);
        const v10 = this.get(tmp, i0 + 1, j0);
        const v01 = this.get(tmp, i0, j0 + 1);
        const v11 = this.get(tmp, i0 + 1, j0 + 1);

        field[k] = (1 - fx) * ((1 - fy) * v00 + fy * v01) +
                   fx * ((1 - fy) * v10 + fy * v11);
      }
    }
  }

  _project(iterations = 20) {
    const { Nx, Ny, dx, dy, vx, vy, p, div } = this;

    // Divergence
    for (let j = 0; j < Ny; j++) {
      for (let i = 0; i < Nx; i++) {
        const k = this.idx(i, j);
        const dvx = (this.get(vx, i + 1, j) - this.get(vx, i - 1, j)) / (2 * dx);
        const dvy = (j > 0 && j < Ny - 1)
          ? (this.get(vy, i, j + 1) - this.get(vy, i, j - 1)) / (2 * dy)
          : 0;
        div[k] = dvx + dvy;
      }
    }

    // Poisson solve: ∇²p = div (Gauss-Seidel with SOR)
    p.fill(0);
    const omega = 1.5;
    const denom = -2 / (dx * dx) - 2 / (dy * dy);

    for (let iter = 0; iter < iterations; iter++) {
      for (let j = 0; j < Ny; j++) {
        for (let i = 0; i < Nx; i++) {
          const k = this.idx(i, j);
          const pl = this.get(p, i - 1, j);
          const pr = this.get(p, i + 1, j);
          const pd = (j > 0) ? this.get(p, i, j - 1) : this.get(p, i, j);
          const pu = (j < Ny - 1) ? this.get(p, i, j + 1) : this.get(p, i, j);
          const newP = (div[k] - (pl + pr) / (dx * dx) - (pd + pu) / (dy * dy)) / denom;
          p[k] += omega * (newP - p[k]);
        }
      }
    }

    // Subtract gradient
    for (let j = 0; j < Ny; j++) {
      for (let i = 0; i < Nx; i++) {
        const k = this.idx(i, j);
        vx[k] -= (this.get(p, i + 1, j) - this.get(p, i - 1, j)) / (2 * dx);
        if (j > 0 && j < Ny - 1) {
          vy[k] -= (this.get(p, i, j + 1) - this.get(p, i, j - 1)) / (2 * dy);
        }
      }
    }

    // No-slip at top and bottom
    for (let i = 0; i < Nx; i++) {
      this.set(vx, i, 0, 0);
      this.set(vy, i, 0, 0);
      this.set(vx, i, Ny - 1, 0);
      this.set(vy, i, Ny - 1, 0);
    }
  }

  /**
   * Subgrid turbulent forcing with spatially-correlated noise.
   *
   * Instead of pixel-level white noise, injects smooth "thermal blobs"
   * at the scale of ~4 grid cells (matching convective eddy sizes).
   * Amplitudes are ~1% of ΔT for temperature and ~1% of max velocity,
   * consistent with observed solar convection fluctuations.
   *
   * Each frame, a few random blobs are placed; they overlap and
   * accumulate to create a spatially-smooth perturbation field.
   */
  _addTurbulentNoise(dt) {
    const { Nx, Ny } = this;
    const maxV = this.maxVelocity() || 0.01;
    const dT = Math.abs(this.T_bot - this.T_top) || 1;

    // Only inject blobs occasionally (every ~20 frames)
    this._noiseCounter = (this._noiseCounter || 0) + 1;
    if (this._noiseCounter % 20 !== 0) return;

    // 2-3 blobs per injection event
    const nBlobs = 2 + Math.floor(Math.random() * 2);
    // Blob radius in grid cells (~convective eddy scale)
    const blobR = 5;
    const blobR2 = blobR * blobR;

    const tAmp = dT * 0.008;  // ~1% of ΔT per blob
    const vAmp = maxV * 0.008;

    for (let b = 0; b < nBlobs; b++) {
      // Random blob center (interior only)
      const cx = Math.random() * Nx;
      const cy = 2 + Math.random() * (Ny - 4);
      // Random sign: hot blob (+) or cool blob (-)
      const sign = Math.random() > 0.5 ? 1 : -1;

      // Apply Gaussian-weighted perturbation around center
      const iMin = Math.max(0, Math.floor(cx - blobR * 2));
      const iMax = Math.min(Nx - 1, Math.ceil(cx + blobR * 2));
      const jMin = Math.max(2, Math.floor(cy - blobR * 2));
      const jMax = Math.min(Ny - 3, Math.ceil(cy + blobR * 2));

      for (let j = jMin; j <= jMax; j++) {
        for (let i = iMin; i <= iMax; i++) {
          const dx = i - cx;
          const dy = j - cy;
          const r2 = dx * dx + dy * dy;
          const w = Math.exp(-r2 / (2 * blobR2)); // Gaussian weight

          const k = this.idx(i, j);
          this.T[k] += sign * tAmp * w;
          this.vx[k] += (Math.random() - 0.5) * vAmp * w;
          this.vy[k] += sign * vAmp * w * 0.5; // bias vertical: hot rises, cool sinks
        }
      }
    }
  }

  _enforceBCs() {
    const { Nx, Ny } = this;
    // Fixed temperature at top and bottom
    for (let i = 0; i < Nx; i++) {
      this.set(this.T, i, 0, this.T_bot);
      this.set(this.T, i, Ny - 1, this.T_top);
    }
  }

  fastForward(nSteps, dt) {
    for (let i = 0; i < nSteps; i++) this.step(dt);
  }

  maxVelocity() {
    let maxV = 0;
    for (let k = 0; k < this.size; k++) {
      const v = Math.sqrt(this.vx[k] * this.vx[k] + this.vy[k] * this.vy[k]);
      if (v > maxV) maxV = v;
    }
    return maxV;
  }
}
