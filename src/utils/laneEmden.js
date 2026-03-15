/**
 * Lane-Emden equation solver using RK4.
 *
 * The Lane-Emden equation for polytropic index n:
 *   (1/ξ²) d/dξ (ξ² dθ/dξ) + θⁿ = 0
 *
 * Rewritten as a system:
 *   dθ/dξ = φ
 *   dφ/dξ = -θⁿ - (2/ξ)φ
 *
 * Boundary conditions: θ(0) = 1, θ'(0) = 0
 *
 * Returns { xi, theta, dtheta } arrays from ξ=0 to the first zero of θ.
 */
export function solveLaneEmden(n, numSteps = 1000) {
  // Step size — ξ_1 for n=3 is ~6.9, so go up to 10
  const xiMax = 10;
  const h = xiMax / numSteps;

  const xi = [0];
  const theta = [1];
  const dtheta = [0];

  for (let i = 0; i < numSteps; i++) {
    const x = xi[i];
    const t = theta[i];
    const dt = dtheta[i];

    // Handle singularity at ξ=0: use L'Hôpital limit (2/ξ)φ → 2φ'/1
    // At ξ=0, the equation gives dφ/dξ = -1/3 (for the initial step)
    const f = (xi_val, t_val, dt_val) => {
      if (xi_val < 1e-10) return -(t_val ** n) / 3;
      return -(t_val ** n) - (2 / xi_val) * dt_val;
    };

    // RK4
    const k1_t = dt;
    const k1_d = f(x, t, dt);

    const k2_t = dt + 0.5 * h * k1_d;
    const k2_d = f(x + 0.5 * h, t + 0.5 * h * k1_t, dt + 0.5 * h * k1_d);

    const k3_t = dt + 0.5 * h * k2_d;
    const k3_d = f(x + 0.5 * h, t + 0.5 * h * k2_t, dt + 0.5 * h * k2_d);

    const k4_t = dt + h * k3_d;
    const k4_d = f(x + h, t + h * k3_t, dt + h * k3_d);

    const newTheta = t + (h / 6) * (k1_t + 2 * k2_t + 2 * k3_t + k4_t);
    const newDtheta = dt + (h / 6) * (k1_d + 2 * k2_d + 2 * k3_d + k4_d);
    const newXi = x + h;

    // Stop at first zero crossing of θ
    if (newTheta <= 0) {
      // Linear interpolation to find precise zero
      const frac = t / (t - newTheta);
      xi.push(x + frac * h);
      theta.push(0);
      dtheta.push(dt + frac * (newDtheta - dt));
      break;
    }

    xi.push(newXi);
    theta.push(newTheta);
    dtheta.push(newDtheta);
  }

  return { xi, theta, dtheta };
}
