import { constants } from './constants.js';
import { solveLaneEmden } from '../utils/laneEmden.js';

/**
 * Compute radial profiles for a polytropic star (n=3, radiative).
 *
 * Given user-controlled (M, R, T_eff), we solve Lane-Emden n=3 and
 * map the dimensionless solution to physical units.
 *
 * Polytropic relation: P = K ρ^(1+1/n)
 *
 * Scaling relations for n=3 polytrope:
 *   ρ_c = -(M / (4π R³)) × (ξ₁ / (dθ/dξ)|_{ξ₁})
 *   P_c = (G M²) / (4π(1+n) R⁴ (dθ/dξ)²|_{ξ₁})   [wait, use standard]
 *
 * We compute central density from the mass and radius,
 * then derive T_c from ideal gas law assuming mean molecular weight μ ≈ 0.6.
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
 * Compute stellar profiles.
 * @param {number} mass - in solar masses
 * @param {number} radius - in solar radii
 * @param {number} tEff - effective temperature in K
 * @returns {{ r: number[], rho: number[], T: number[], P: number[], L: number, Tc: number, rhoc: number }}
 */
export function computeProfiles(mass, radius, tEff) {
  const { G, k_B, m_p, sigma, M_sun, R_sun } = constants;
  const le = getLaneEmdenSolution();

  const M = mass * M_sun;
  const R = radius * R_sun;
  const n = 3;

  // ξ₁ and -ξ₁² θ'(ξ₁) from Lane-Emden
  const xi1 = le.xi[le.xi.length - 1];
  const dthetaXi1 = le.dtheta[le.dtheta.length - 1]; // negative value
  const negXi1SqDtheta = -xi1 * xi1 * dthetaXi1;

  // Central density: ρ_c = M / (4π R³) × ξ₁ / (-ξ₁² θ'₁) × 3
  // More precisely: M = 4π R³ ρ_c (-ξ₁² θ'₁) / ξ₁³  × (something)
  // Standard: M = 4π α³ ρ_c (-ξ₁² θ'(ξ₁)), where α = R/ξ₁
  // So: ρ_c = M / (4π (R/ξ₁)³ (-ξ₁² θ'₁))
  const alpha = R / xi1;
  const rhoc = M / (4 * Math.PI * alpha ** 3 * negXi1SqDtheta);

  // Mean molecular weight (fully ionized H/He mix, X=0.7, Y=0.28)
  const mu = 0.62;

  // Central temperature from ideal gas + radiation pressure
  // For simplicity, use ideal gas: P_c = ρ_c k_B T_c / (μ m_p)
  // Central pressure from polytropic relation:
  // P_c = G M² / (4π(n+1) R⁴ (θ'₁)²)  — but let's use a cleaner route
  // P_c = K ρ_c^(4/3) where K = (4π G / (n+1))^(1/2) × ...
  // Simpler: P_c = (4πG / (n+1)) × α² × ρ_c²
  const Pc = (4 * Math.PI * G * alpha * alpha * rhoc * rhoc) / (n + 1);
  const Tc = (Pc * mu * m_p) / (rhoc * k_B);

  // Luminosity from Stefan-Boltzmann
  const L = 4 * Math.PI * R * R * sigma * tEff ** 4;

  // Build radial profiles by mapping Lane-Emden solution
  const numPoints = le.xi.length;
  const r = new Array(numPoints);
  const rho = new Array(numPoints);
  const T = new Array(numPoints);
  const P = new Array(numPoints);

  for (let i = 0; i < numPoints; i++) {
    const frac = le.xi[i] / xi1; // r/R
    r[i] = frac;
    const th = Math.max(le.theta[i], 0);
    rho[i] = rhoc * th ** n;           // ρ = ρ_c θ^n
    P[i] = Pc * th ** (n + 1);         // P = P_c θ^(n+1)
    T[i] = Tc * th;                     // T = T_c θ  (for ideal gas polytrope)
  }

  return { r, rho, T, P, L, Tc, rhoc, Pc };
}

/**
 * Default Sun-like parameters
 */
export const defaults = {
  mass: 1.0,        // M☉
  radius: 1.0,      // R☉
  temperature: 5778, // K
  hydrogen: 0.70,   // X
};
