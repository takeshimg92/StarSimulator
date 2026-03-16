import { constants } from './constants.js';
import { solveLaneEmden } from '../utils/laneEmden.js';

/**
 * Compute radial profiles for a polytropic star (n=3, radiative).
 *
 * Two-zone temperature mapping:
 *   - Core (r/R ≤ q): T uses μ_core
 *   - Envelope (r/R > q): T uses μ_env
 *   - Sigmoid transition over ~5% around the boundary
 *
 * Density and pressure profiles remain from the single n=3 polytrope
 * (the polytropic structure depends on overall M/R, not local composition).
 */

// Cache the Lane-Emden solution since n doesn't change in MVP
let cachedSolution = null;

function getLaneEmdenSolution() {
  if (!cachedSolution) {
    cachedSolution = solveLaneEmden(3, 2000);
  }
  return cachedSolution;
}

/**
 * Sigmoid blend function for core-envelope transition.
 * Returns 1 in the core, 0 in the envelope, smooth transition around q.
 * @param {number} rFrac - r/R
 * @param {number} q - core boundary (r/R)
 * @param {number} width - transition width (default 0.05)
 */
function coreWeight(rFrac, q, width = 0.05) {
  return 1 / (1 + Math.exp((rFrac - q) / width));
}

/**
 * Compute stellar profiles.
 * @param {number} mass - in solar masses
 * @param {number} radius - in solar radii
 * @param {number} tEff - effective temperature in K
 * @param {object} muZone - { mu_core, mu_env, q } for two-zone model.
 *                          Falls back to single μ if a number is passed.
 * @returns {{ r: number[], rho: number[], T: number[], P: number[], L: number, Tc: number, rhoc: number, Pc: number, mu: number }}
 */
export function computeProfiles(mass, radius, tEff, muZone = 0.62) {
  const { G, k_B, m_p, sigma, M_sun, R_sun } = constants;
  const le = getLaneEmdenSolution();

  const M = mass * M_sun;
  const R = radius * R_sun;
  const n = 3;

  // ξ₁ and -ξ₁² θ'(ξ₁) from Lane-Emden
  const xi1 = le.xi[le.xi.length - 1];
  const dthetaXi1 = le.dtheta[le.dtheta.length - 1];
  const negXi1SqDtheta = -xi1 * xi1 * dthetaXi1;

  const alpha = R / xi1;
  const rhoc = M / (4 * Math.PI * alpha ** 3 * negXi1SqDtheta);
  const Pc = (4 * Math.PI * G * alpha * alpha * rhoc * rhoc) / (n + 1);

  // Parse muZone: either a number (legacy) or { mu_core, mu_env, q }
  let mu_core, mu_env, q;
  if (typeof muZone === 'number') {
    mu_core = muZone;
    mu_env = muZone;
    q = 0.25;
  } else {
    mu_core = muZone.mu_core;
    mu_env = muZone.mu_env;
    q = muZone.q || 0.25;
  }

  // Central temperature from core μ
  const Tc = (Pc * mu_core * m_p) / (rhoc * k_B);

  // Luminosity from Stefan-Boltzmann
  const L = 4 * Math.PI * R * R * sigma * tEff ** 4;

  // Build radial profiles
  const numPoints = le.xi.length;
  const r = new Array(numPoints);
  const rho = new Array(numPoints);
  const T = new Array(numPoints);
  const P = new Array(numPoints);

  for (let i = 0; i < numPoints; i++) {
    const frac = le.xi[i] / xi1; // r/R
    r[i] = frac;
    const th = Math.max(le.theta[i], 0);
    rho[i] = rhoc * th ** n;
    P[i] = Pc * th ** (n + 1);

    // Two-zone temperature: T = T_c × θ × μ(r)/μ_core
    const w = coreWeight(frac, q);
    const muLocal = w * mu_core + (1 - w) * mu_env;
    let Ti = Tc * th * (muLocal / mu_core);

    // The polytrope gives T→0 at the surface, but the real photosphere
    // has T = T_eff. Blend smoothly to T_eff for r/R > 0.8.
    if (frac > 0.8) {
      const blend = (frac - 0.8) / 0.2; // 0 at r/R=0.8, 1 at r/R=1.0
      const s = blend * blend * (3 - 2 * blend); // smoothstep
      Ti = Ti * (1 - s) + tEff * s;
    }
    T[i] = Ti;
  }

  return { r, rho, T, P, L, Tc, rhoc, Pc, mu: mu_core };
}

/**
 * Default Sun-like parameters
 */
export const defaults = {
  mass: 1.0,        // M☉
};
