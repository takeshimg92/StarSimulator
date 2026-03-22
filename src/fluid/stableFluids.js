/**
 * Stable Fluids solver (Jos Stam, 1999) on a polar grid.
 *
 * Algorithm per timestep:
 *   1. Add external forces (buoyancy)
 *   2. Advect (semi-Lagrangian backtrace)
 *   3. Diffuse (implicit via Gauss-Seidel)
 *   4. Project (pressure correction to enforce ∇·v = 0)
 *
 * All operations work on the PolarGrid from polarGrid.js.
 */

/**
 * Add force field to velocity (explicit Euler).
 * v += dt * force
 */
export function addForce(v, force, dt, size) {
  for (let k = 0; k < size; k++) {
    v[k] += dt * force[k];
  }
}

/**
 * Semi-Lagrangian advection on polar grid.
 *
 * For each cell (i, j), backtrace the velocity to find where the fluid
 * came from, then interpolate the source field at that location.
 *
 * @param {import('./polarGrid.js').PolarGrid} grid
 * @param {Float64Array} field - field to advect (overwritten with result)
 * @param {Float64Array} vr - radial velocity
 * @param {Float64Array} vtheta - angular velocity
 * @param {number} dt - timestep
 * @param {Float64Array} tmp - temporary buffer (same size)
 */
export function advect(grid, field, vr, vtheta, dt, tmp) {
  const { Nr, Ntheta, dr, dtheta, rInner } = grid;

  // Copy field to tmp (we read from tmp, write to field)
  tmp.set(field);

  for (let i = 0; i < Nr; i++) {
    const r = grid.r[i];
    const theta = 0; // theta = j * dtheta, but we work in index space

    for (let j = 0; j < Ntheta; j++) {
      const k = grid.idx(i, j);

      // Backtrace position
      const vr_here = vr[k];
      const vth_here = vtheta[k];

      // Convert velocity to grid index displacement
      const di = vr_here * dt / dr;           // radial displacement in cells
      const dj = vth_here * dt / (r * dtheta); // angular displacement in cells

      // Source position (in fractional grid indices)
      const si = i - di;
      const sj = j - dj;

      // Bilinear interpolation from tmp
      field[k] = bilinearInterp(grid, tmp, si, sj);
    }
  }
}

/**
 * Bilinear interpolation on the polar grid.
 * Handles periodic θ and clamped r boundaries.
 */
function bilinearInterp(grid, f, si, sj) {
  const { Nr, Ntheta } = grid;

  // Clamp radial
  const si_c = Math.max(0, Math.min(si, Nr - 1.001));
  const i0 = Math.floor(si_c);
  const i1 = Math.min(i0 + 1, Nr - 1);
  const fr = si_c - i0;

  // Wrap angular (periodic)
  let sj_w = ((sj % Ntheta) + Ntheta) % Ntheta;
  const j0 = Math.floor(sj_w);
  const j1 = (j0 + 1) % Ntheta;
  const fth = sj_w - j0;

  // Bilinear
  const v00 = f[i0 * Ntheta + j0];
  const v10 = f[i1 * Ntheta + j0];
  const v01 = f[i0 * Ntheta + j1];
  const v11 = f[i1 * Ntheta + j1];

  return (1 - fr) * ((1 - fth) * v00 + fth * v01) +
         fr * ((1 - fth) * v10 + fth * v11);
}

/**
 * Implicit diffusion via Gauss-Seidel relaxation.
 *
 * Solves: (I - D(r)·dt·∇²) x = x₀
 * where D(r) is the diffusion coefficient (scalar or per-row array).
 *
 * @param {import('./polarGrid.js').PolarGrid} grid
 * @param {Float64Array} field - field to diffuse (modified in-place)
 * @param {Float64Array} field0 - original field (before diffusion)
 * @param {number|Float64Array} diff - diffusion coefficient: scalar or array[Nr]
 * @param {number} dt - timestep
 * @param {number} iterations - number of Gauss-Seidel iterations
 */
export function diffuse(grid, field, field0, diff, dt, iterations = 40) {
  const { Nr, Ntheta, dr, dtheta } = grid;
  const isArray = (typeof diff !== 'number');

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < Nr; i++) {
      const r = grid.r[i];
      const D = isArray ? diff[i] : diff;
      const a_r = D * dt / (dr * dr);
      const a_th = D * dt / (r * r * dtheta * dtheta);
      const a_r_asym = D * dt / (2 * dr * r);

      for (let j = 0; j < Ntheta; j++) {
        const k = grid.idx(i, j);

        const fr_p = (i < Nr - 1) ? grid.get(field, i + 1, j) : grid.get(field, i, j);
        const fr_m = (i > 0) ? grid.get(field, i - 1, j) : grid.get(field, i, j);
        const fth_p = grid.get(field, i, j + 1);
        const fth_m = grid.get(field, i, j - 1);

        field[k] = (field0[k] +
          a_r * (fr_p + fr_m) +
          a_r_asym * (fr_p - fr_m) +
          a_th * (fth_p + fth_m)
        ) / (1 + 2 * a_r + 2 * a_th);
      }
    }
  }
}

/**
 * Pressure projection to enforce ∇·v = 0.
 *
 * 1. Compute divergence of velocity field
 * 2. Solve Poisson equation: ∇²p = ∇·v
 * 3. Subtract gradient of p from velocity: v -= ∇p
 *
 * @param {import('./polarGrid.js').PolarGrid} grid
 * @param {Float64Array} vr - radial velocity (modified in-place)
 * @param {Float64Array} vtheta - angular velocity (modified in-place)
 * @param {Float64Array} p - pressure work buffer
 * @param {Float64Array} div - divergence work buffer
 * @param {number} iterations - Gauss-Seidel iterations for Poisson solve
 */
export function project(grid, vr, vtheta, p, div, iterations = 30) {
  const { Nr, Ntheta, dr, dtheta } = grid;

  // Step 1: compute divergence
  grid.divergence(vr, vtheta, div);

  // Step 2: solve ∇²p = div via Gauss-Seidel (SOR with ω=1.5)
  p.fill(0);
  const omega = 1.5;

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < Nr; i++) {
      const r = grid.r[i];
      const dr2 = dr * dr;
      const r2dth2 = r * r * dtheta * dtheta;

      for (let j = 0; j < Ntheta; j++) {
        const k = grid.idx(i, j);

        const pr_p = (i < Nr - 1) ? grid.get(p, i + 1, j) : grid.get(p, i, j);
        const pr_m = (i > 0) ? grid.get(p, i - 1, j) : grid.get(p, i, j);
        const pth_p = grid.get(p, i, j + 1);
        const pth_m = grid.get(p, i, j - 1);

        // (1/r) dp/dr correction
        const asym = dr / (2 * r);

        const newP = (
          div[k] * dr2 -
          (pr_p + pr_m) -
          (dr2 / r2dth2) * (pth_p + pth_m) -
          asym * (pr_p - pr_m)
        ) / (-2 - 2 * dr2 / r2dth2);

        // SOR update
        p[k] = p[k] + omega * (newP - p[k]);
      }
    }
  }

  // Step 3: subtract pressure gradient from velocity
  for (let i = 0; i < Nr; i++) {
    const r = grid.r[i];

    for (let j = 0; j < Ntheta; j++) {
      const k = grid.idx(i, j);

      // ∂p/∂r
      const pr_p = (i < Nr - 1) ? grid.get(p, i + 1, j) : grid.get(p, i, j);
      const pr_m = (i > 0) ? grid.get(p, i - 1, j) : grid.get(p, i, j);
      vr[k] -= (pr_p - pr_m) / (2 * dr);

      // (1/r) ∂p/∂θ
      const pth_p = grid.get(p, i, j + 1);
      const pth_m = grid.get(p, i, j - 1);
      vtheta[k] -= (pth_p - pth_m) / (2 * dtheta * r);
    }
  }

  // Enforce boundary conditions: no-slip at inner/outer radii
  for (let j = 0; j < Ntheta; j++) {
    vr[grid.idx(0, j)] = 0;
    vr[grid.idx(Nr - 1, j)] = 0;
    vtheta[grid.idx(0, j)] = 0;
    vtheta[grid.idx(Nr - 1, j)] = 0;
  }
}
