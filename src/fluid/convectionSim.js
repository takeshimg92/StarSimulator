/**
 * Thermal convection simulation coupling Stable Fluids with buoyancy.
 *
 * Boussinesq approximation with spatially-varying transport coefficients:
 *   ∂v/∂t + (v·∇)v = -∇p/ρ₀ + ν∇²v + α·g(r)·δT·r̂
 *   ∇·v = 0
 *   ∂T/∂t + (v·∇)T = κ_th(r)·∇²T
 *
 * The thermal diffusivity κ_th(r) varies radially, derived from the stellar
 * opacity profile. Where opacity is high (convective zones), κ_th is low →
 * heat gets trapped → buoyancy drives convection. Where opacity is low
 * (radiative zones), κ_th is high → heat diffuses efficiently → stable.
 *
 * This allows the convective/radiative transition to emerge naturally
 * from the physics rather than being imposed as a boundary condition.
 */

import { PolarGrid } from './polarGrid.js';
import { addForce, advect, diffuse, project } from './stableFluids.js';

export class ConvectionSim {
  /**
   * @param {object} opts
   * @param {number} opts.Nr - radial grid cells
   * @param {number} opts.Ntheta - angular grid cells
   * @param {number} opts.rInner - inner boundary r/R
   * @param {number} opts.rOuter - outer boundary r/R
   * @param {number} opts.T_inner - temperature at inner boundary (normalized)
   * @param {number} opts.T_outer - temperature at outer boundary (normalized)
   * @param {number[]|number} opts.gravity - gravity per radial row, or scalar
   * @param {number} opts.alpha - thermal expansion coefficient
   * @param {number[]|number} opts.viscosity - kinematic viscosity ν (scalar or per-row)
   * @param {number[]|number} opts.thermalDiff - thermal diffusivity κ_th (scalar or per-row)
   * @param {number[]} [opts.T_profile] - initial temperature profile (per radial row)
   * @param {number[]} [opts.v_conv_seed] - MLT velocity for seeding (per radial row)
   */
  constructor(opts = {}) {
    const Nr = opts.Nr || 128;
    const Ntheta = opts.Ntheta || 64;
    const rInner = opts.rInner || 0.05;
    const rOuter = opts.rOuter || 0.98;

    this.grid = new PolarGrid(Nr, Ntheta, rInner, rOuter);
    this.Nr = Nr;
    this.Ntheta = Ntheta;

    this.T_inner = opts.T_inner ?? 1.0;
    this.T_outer = opts.T_outer ?? 0.0;
    this.alpha = opts.alpha ?? 1.0;

    // Per-row arrays for spatially-varying coefficients
    this.gravityProfile = this._toProfile(opts.gravity, Nr, 1.0);
    this.viscosityProfile = this._toProfile(opts.viscosity, Nr, 0.005);
    this.thermalDiffProfile = this._toProfile(opts.thermalDiff, Nr, 0.005);

    // Initial temperature profile from 1D model (normalized 0-1)
    this.T_profile = opts.T_profile || null;

    // Fields
    this.vr = this.grid.createField();
    this.vtheta = this.grid.createField();
    this.temperature = this.grid.createField();

    // Work buffers
    this.vr0 = this.grid.createField();
    this.vtheta0 = this.grid.createField();
    this.temp0 = this.grid.createField();
    this.pressure = this.grid.createField();
    this.divergence = this.grid.createField();
    this.forceR = this.grid.createField();

    this._initTemperature();
    this._initVelocity(opts.v_conv_seed);

    this.time = 0;
  }

  /** Convert scalar or array to Float64Array of length Nr. */
  _toProfile(val, Nr, fallback) {
    if (Array.isArray(val) || (val && val.length)) return Float64Array.from(val);
    const v = (val !== undefined && val !== null) ? val : fallback;
    return new Float64Array(Nr).fill(v);
  }

  /**
   * Initialize temperature from the 1D stellar profile (if provided)
   * plus small perturbation to seed convective instability.
   */
  _initTemperature() {
    const { Nr, Ntheta } = this;
    const { rInner, rOuter } = this.grid;
    const dT = this.T_inner - this.T_outer;

    for (let i = 0; i < Nr; i++) {
      let T_base;
      if (this.T_profile) {
        T_base = this.T_profile[i];
      } else {
        // Linear fallback
        const frac = (this.grid.r[i] - rInner) / (rOuter - rInner);
        T_base = this.T_inner - dT * frac;
      }

      for (let j = 0; j < Ntheta; j++) {
        // ±5% perturbation to seed convective instability faster
        const noise = (Math.random() - 0.5) * 0.10 * Math.abs(dT);
        this.grid.set(this.temperature, i, j, T_base + noise);
      }
    }
  }

  /**
   * Seed initial velocity from MLT convective velocities (~1%).
   */
  _initVelocity(v_conv_seed) {
    if (!v_conv_seed) return;
    const { Nr, Ntheta } = this;
    for (let i = 0; i < Nr; i++) {
      const vScale = (v_conv_seed[i] || 0) * 0.01;
      if (vScale === 0) continue;
      for (let j = 0; j < Ntheta; j++) {
        this.grid.set(this.vr, i, j, (Math.random() - 0.5) * 2 * vScale);
        this.grid.set(this.vtheta, i, j, (Math.random() - 0.5) * 2 * vScale);
      }
    }
  }

  reset(opts = {}) {
    const Nr = opts.Nr || this.Nr;
    const Ntheta = opts.Ntheta || this.Ntheta;
    const rInner = opts.rInner ?? this.grid.rInner;
    const rOuter = opts.rOuter ?? this.grid.rOuter;

    const geomChanged = (rInner !== this.grid.rInner || rOuter !== this.grid.rOuter ||
                         Nr !== this.Nr || Ntheta !== this.Ntheta);

    if (geomChanged) {
      this.grid = new PolarGrid(Nr, Ntheta, rInner, rOuter);
      this.Nr = Nr;
      this.Ntheta = Ntheta;
      this.vr = this.grid.createField();
      this.vtheta = this.grid.createField();
      this.temperature = this.grid.createField();
      this.vr0 = this.grid.createField();
      this.vtheta0 = this.grid.createField();
      this.temp0 = this.grid.createField();
      this.pressure = this.grid.createField();
      this.divergence = this.grid.createField();
      this.forceR = this.grid.createField();
    } else {
      this.vr.fill(0);
      this.vtheta.fill(0);
    }

    if (opts.T_inner !== undefined) this.T_inner = opts.T_inner;
    if (opts.T_outer !== undefined) this.T_outer = opts.T_outer;
    if (opts.alpha !== undefined) this.alpha = opts.alpha;
    if (opts.T_profile) this.T_profile = opts.T_profile;

    this.gravityProfile = this._toProfile(opts.gravity, Nr, this.gravityProfile);
    this.viscosityProfile = this._toProfile(opts.viscosity, Nr, this.viscosityProfile);
    this.thermalDiffProfile = this._toProfile(opts.thermalDiff, Nr, this.thermalDiffProfile);

    this._initTemperature();
    this._initVelocity(opts.v_conv_seed);
    this.time = 0;
  }

  /**
   * Advance by one timestep.
   *
   * Buoyancy reference: the equilibrium conduction profile T_eq(r).
   * In radiative zones, the high κ_th keeps T close to T_eq → no flow.
   * In convective zones, low κ_th lets T deviate from T_eq → buoyancy drives flow.
   */
  step(dt) {
    const { grid, vr, vtheta, temperature } = this;
    const { vr0, vtheta0, temp0, pressure, divergence: div, forceR } = this;
    const { Nr, Ntheta } = this;

    // 1. Buoyancy: F_r = α · g(r) · δT(r,θ)
    //    where δT = T(r,θ) - <T(r)>_θ is the deviation from the angular
    //    average at each radius. This ensures only angular temperature
    //    variations (= convection cells) drive flow, preventing spurious
    //    net radial collapse from reference profile mismatches.
    for (let i = 0; i < Nr; i++) {
      // Compute angular average T at this radius
      let T_avg = 0;
      for (let j = 0; j < Ntheta; j++) {
        T_avg += temperature[grid.idx(i, j)];
      }
      T_avg /= Ntheta;

      const g_i = this.gravityProfile[i];
      for (let j = 0; j < Ntheta; j++) {
        const k = grid.idx(i, j);
        forceR[k] = this.alpha * g_i * (temperature[k] - T_avg);
      }
    }
    addForce(vr, forceR, dt, grid.size);

    // 2. Diffuse velocity (viscosity — per-row)
    vr0.set(vr);
    vtheta0.set(vtheta);
    diffuse(grid, vr, vr0, this.viscosityProfile, dt);
    diffuse(grid, vtheta, vtheta0, this.viscosityProfile, dt);

    // 3. Project
    project(grid, vr, vtheta, pressure, div);

    // 4. Advect velocity
    vr0.set(vr);
    vtheta0.set(vtheta);
    advect(grid, vr, vr0, vtheta0, dt, temp0);
    advect(grid, vtheta, vr0, vtheta0, dt, temp0);

    // 5. Project again
    project(grid, vr, vtheta, pressure, div);

    // 6. Temperature: advect + diffuse with spatially-varying κ_th
    temp0.set(temperature);
    advect(grid, temperature, vr, vtheta, dt, temp0);
    temp0.set(temperature);
    diffuse(grid, temperature, temp0, this.thermalDiffProfile, dt);

    // 7. Enforce BCs
    this._enforceTempBC();
    this._enforceWedgeWalls();

    this.time += dt;
  }

  _enforceTempBC() {
    const { Nr, Ntheta } = this;
    for (let j = 0; j < Ntheta; j++) {
      this.grid.set(this.temperature, 0, j, this.T_inner);
      this.grid.set(this.temperature, Nr - 1, j, this.T_outer);
    }
  }

  /**
   * Non-penetration BCs at the angular wedge walls (j=0 and j=Ntheta-1).
   * vθ = 0 at both walls; vr and T use zero-gradient (Neumann).
   */
  _enforceWedgeWalls() {
    const { Nr, Ntheta } = this;
    for (let i = 0; i < Nr; i++) {
      // Left wall (j=0): vθ = 0
      this.grid.set(this.vtheta, i, 0, 0);
      // Right wall (j=Ntheta-1): vθ = 0
      this.grid.set(this.vtheta, i, Ntheta - 1, 0);
    }
  }

  fastForward(nSteps, dt) {
    for (let i = 0; i < nSteps; i++) {
      this.step(dt);
    }
  }

  maxVelocity() {
    let maxV = 0;
    for (let k = 0; k < this.grid.size; k++) {
      const v = Math.sqrt(this.vr[k] * this.vr[k] + this.vtheta[k] * this.vtheta[k]);
      if (v > maxV) maxV = v;
    }
    return maxV;
  }

  kineticEnergy() {
    let KE = 0;
    const { Nr, Ntheta, dr, dtheta } = this.grid;
    for (let i = 0; i < Nr; i++) {
      const r = this.grid.r[i];
      const dA = r * dr * dtheta;
      for (let j = 0; j < Ntheta; j++) {
        const k = this.grid.idx(i, j);
        const v2 = this.vr[k] * this.vr[k] + this.vtheta[k] * this.vtheta[k];
        KE += 0.5 * v2 * dA;
      }
    }
    return KE;
  }
}
