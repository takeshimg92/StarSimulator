/**
 * Polar grid data structure and operators for 2D fluid simulation.
 *
 * Grid layout: Nr radial cells × Nθ angular cells.
 * - r direction: from r_inner to r_outer (annular domain)
 * - θ direction: 0 to 2π, periodic
 *
 * Data is stored as flat Float64Arrays: field[i * Ntheta + j]
 * where i is the radial index and j is the angular index.
 */

export class PolarGrid {
  /**
   * @param {number} Nr - number of radial cells
   * @param {number} Ntheta - number of angular cells
   * @param {number} rInner - inner radius (normalized, e.g. 0.2)
   * @param {number} rOuter - outer radius (normalized, e.g. 0.7)
   */
  constructor(Nr, Ntheta, rInner, rOuter) {
    this.Nr = Nr;
    this.Ntheta = Ntheta;
    this.rInner = rInner;
    this.rOuter = rOuter;

    this.dr = (rOuter - rInner) / Nr;
    this.dtheta = (2 * Math.PI) / Ntheta;

    // Pre-compute radial positions at cell centers
    this.r = new Float64Array(Nr);
    for (let i = 0; i < Nr; i++) {
      this.r[i] = rInner + (i + 0.5) * this.dr;
    }

    this.size = Nr * Ntheta;
  }

  /** Create a new zero-filled field on this grid. */
  createField() {
    return new Float64Array(this.size);
  }

  /** Flat index from (i, j) with periodic θ. */
  idx(i, j) {
    // Clamp radial, wrap angular
    const ii = Math.max(0, Math.min(i, this.Nr - 1));
    const jj = ((j % this.Ntheta) + this.Ntheta) % this.Ntheta;
    return ii * this.Ntheta + jj;
  }

  /** Get value at (i, j) from a field. */
  get(field, i, j) {
    return field[this.idx(i, j)];
  }

  /** Set value at (i, j) in a field. */
  set(field, i, j, val) {
    field[this.idx(i, j)] = val;
  }

  /**
   * Laplacian in polar coordinates:
   *   ∇²f = ∂²f/∂r² + (1/r)∂f/∂r + (1/r²)∂²f/∂θ²
   *
   * Uses central differences. Boundary: Neumann (zero gradient) at r boundaries,
   * periodic in θ.
   *
   * @param {Float64Array} f - input field
   * @param {Float64Array} out - output field (can be same as f for in-place, but not recommended)
   */
  laplacian(f, out) {
    const { Nr, Ntheta, dr, dtheta } = this;
    const dr2 = dr * dr;
    const dth2 = dtheta * dtheta;

    for (let i = 0; i < Nr; i++) {
      const r = this.r[i];
      const r2 = r * r;

      for (let j = 0; j < Ntheta; j++) {
        const fc = this.get(f, i, j);

        // Radial second derivative + (1/r) first derivative
        const fr_p = (i < Nr - 1) ? this.get(f, i + 1, j) : fc; // Neumann at outer
        const fr_m = (i > 0) ? this.get(f, i - 1, j) : fc;      // Neumann at inner
        const d2f_dr2 = (fr_p - 2 * fc + fr_m) / dr2;
        const df_dr = (fr_p - fr_m) / (2 * dr);

        // Angular second derivative (periodic)
        const fth_p = this.get(f, i, j + 1);
        const fth_m = this.get(f, i, j - 1);
        const d2f_dth2 = (fth_p - 2 * fc + fth_m) / dth2;

        out[this.idx(i, j)] = d2f_dr2 + df_dr / r + d2f_dth2 / r2;
      }
    }
  }

  /**
   * Divergence in polar coordinates:
   *   ∇·v = (1/r)∂(r·v_r)/∂r + (1/r)∂v_θ/∂θ
   *
   * @param {Float64Array} vr - radial velocity field
   * @param {Float64Array} vtheta - angular velocity field
   * @param {Float64Array} out - divergence output
   */
  divergence(vr, vtheta, out) {
    const { Nr, Ntheta, dr, dtheta } = this;

    for (let i = 0; i < Nr; i++) {
      const r = this.r[i];

      for (let j = 0; j < Ntheta; j++) {
        // (1/r) ∂(r·vr)/∂r via central differences
        const rvr_p = (i < Nr - 1)
          ? this.r[i + 1] * this.get(vr, i + 1, j)
          : r * this.get(vr, i, j);
        const rvr_m = (i > 0)
          ? this.r[i - 1] * this.get(vr, i - 1, j)
          : r * this.get(vr, i, j);
        const div_r = (rvr_p - rvr_m) / (2 * dr * r);

        // (1/r) ∂vθ/∂θ
        const vth_p = this.get(vtheta, i, j + 1);
        const vth_m = this.get(vtheta, i, j - 1);
        const div_th = (vth_p - vth_m) / (2 * dtheta * r);

        out[this.idx(i, j)] = div_r + div_th;
      }
    }
  }

  /**
   * Gradient in polar coordinates.
   *   ∇f = (∂f/∂r) r̂ + (1/r)(∂f/∂θ) θ̂
   *
   * @param {Float64Array} f - scalar field
   * @param {Float64Array} grad_r - output radial component
   * @param {Float64Array} grad_theta - output angular component
   */
  gradient(f, grad_r, grad_theta) {
    const { Nr, Ntheta, dr, dtheta } = this;

    for (let i = 0; i < Nr; i++) {
      const r = this.r[i];

      for (let j = 0; j < Ntheta; j++) {
        const fp_r = (i < Nr - 1) ? this.get(f, i + 1, j) : this.get(f, i, j);
        const fm_r = (i > 0) ? this.get(f, i - 1, j) : this.get(f, i, j);
        grad_r[this.idx(i, j)] = (fp_r - fm_r) / (2 * dr);

        const fp_th = this.get(f, i, j + 1);
        const fm_th = this.get(f, i, j - 1);
        grad_theta[this.idx(i, j)] = (fp_th - fm_th) / (2 * dtheta * r);
      }
    }
  }
}
