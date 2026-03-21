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

    // Derived diffusion coefficients (in sim units where box height = 1)
    // Ra = g α ΔT H³ / (ν κ_th),  Pr = ν / κ_th
    // Choose κ_th = 1, then ν = Pr, and g_eff = Ra * ν * κ_th / (ΔT * H³)
    //   = Ra * Pr / 1 = Ra * Pr  (with ΔT=1, H=1)
    this.kappa_th = 0.02;
    this.nu = this.kappa_th * this.Pr;
    this.g_eff = this.Ra * this.nu * this.kappa_th;

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
        // ±10% noise + multi-mode sinusoidal perturbation
        const noise = (Math.random() - 0.5) * 0.2 * dT;
        const mode1 = 0.05 * dT * Math.sin(2 * Math.PI * i / Nx * 3) * Math.sin(Math.PI * frac);
        const mode2 = 0.03 * dT * Math.sin(2 * Math.PI * i / Nx * 7 + 1.3) * Math.sin(2 * Math.PI * frac);
        this.set(this.T, i, j, T_base + noise + mode1 + mode2);
      }
    }

    // Larger random velocity seed to kick-start circulation
    for (let k = 0; k < this.size; k++) {
      this.vx[k] = (Math.random() - 0.5) * 0.05;
      this.vy[k] = (Math.random() - 0.5) * 0.05;
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

    this.kappa_th = 0.02;
    this.nu = this.kappa_th * this.Pr;
    this.g_eff = this.Ra * this.nu * this.kappa_th;

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

  _addTurbulentNoise(dt) {
    const { Nx, Ny } = this;
    const maxV = this.maxVelocity() || 0.01;
    const dT = Math.abs(this.T_bot - this.T_top) || 1;

    // Velocity noise: ~2% of max velocity
    const vNoiseAmp = maxV * 0.02;
    // Temperature noise: ~1% of ΔT (drives buoyancy fluctuations)
    const tNoiseAmp = dT * 0.01;

    for (let j = 2; j < Ny - 2; j++) {
      for (let i = 0; i < Nx; i++) {
        const k = this.idx(i, j);
        this.vx[k] += (Math.random() - 0.5) * 2 * vNoiseAmp;
        this.vy[k] += (Math.random() - 0.5) * 2 * vNoiseAmp;
        this.T[k] += (Math.random() - 0.5) * 2 * tNoiseAmp;
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
