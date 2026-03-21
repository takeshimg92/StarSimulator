/**
 * Energy transport and convection criterion for stellar interiors.
 *
 * Radiative gradient:  ∇_rad = (3 κ P L) / (16π a c T⁴ G m)
 * Adiabatic gradient:  ∇_ad = 0.4 (ideal gas, γ = 5/3)
 * Schwarzschild:       convective if ∇_rad > ∇_ad
 * Convective velocity: v_conv from mixing-length theory (MLT)
 */

import { constants } from './constants.js';

const NABLA_AD = 0.4; // ideal monatomic gas, γ = 5/3
const ALPHA_MLT = 1.6; // mixing-length parameter

/**
 * Radiation constant a = 4σ/c.
 */
function radiationConstant() {
  return 4 * constants.sigma / constants.c;
}

/**
 * Radiative temperature gradient (dimensionless).
 *
 * ∇_rad = (3 κ P L) / (16π a c T⁴ G m)
 *
 * At r→0 where L→0 and m→0, use limiting form:
 *   ∇_rad(0) = (κ_c ε_c ρ_c) / (16π a c T_c³ × (4/3)G ρ_c)
 *            = (3 κ_c ε_c) / (64π a c T_c³ G)   (independent of ρ_c)
 *
 * @param {number} kappa - opacity [m²/kg]
 * @param {number} P - pressure [Pa]
 * @param {number} L - enclosed luminosity [W]
 * @param {number} T - temperature [K]
 * @param {number} m - enclosed mass [kg]
 * @returns {number} ∇_rad (dimensionless)
 */
export function nablaRad(kappa, P, L, T, m) {
  const { c, G } = constants;
  const a = radiationConstant();
  const denom = 16 * Math.PI * a * c * Math.pow(T, 4) * G * m;
  if (denom === 0 || !isFinite(denom)) return 0;
  return (3 * kappa * P * L) / denom;
}

/**
 * Radiative gradient at the center (r→0 limiting form).
 * @param {number} kappa_c - central opacity [m²/kg]
 * @param {number} epsilon_c - central energy generation [W/kg]
 * @param {number} T_c - central temperature [K]
 * @returns {number} ∇_rad(0)
 */
export function nablaRadCenter(kappa_c, epsilon_c, T_c) {
  const { c, G } = constants;
  const a = radiationConstant();
  return (3 * kappa_c * epsilon_c) / (64 * Math.PI * a * c * Math.pow(T_c, 3) * G);
}

/**
 * Adiabatic temperature gradient (constant for ideal gas).
 * @returns {number} ∇_ad = 0.4
 */
export function nablaAd() {
  return NABLA_AD;
}

/**
 * Schwarzschild convection criterion.
 * @param {number} kappa - opacity [m²/kg]
 * @param {number} P - pressure [Pa]
 * @param {number} L - enclosed luminosity [W]
 * @param {number} T - temperature [K]
 * @param {number} m - enclosed mass [kg]
 * @returns {boolean} true if convective
 */
export function isConvective(kappa, P, L, T, m) {
  return nablaRad(kappa, P, L, T, m) > NABLA_AD;
}

/**
 * Pressure scale height.
 * H_P = P / (ρ g) where g = G m / r²
 * @param {number} P - pressure [Pa]
 * @param {number} rho - density [kg/m³]
 * @param {number} m - enclosed mass [kg]
 * @param {number} r - radius [m]
 * @returns {number} H_P [m]
 */
export function pressureScaleHeight(P, rho, m, r) {
  if (r < 1e-10 || m < 1e-10) return Infinity;
  const g = constants.G * m / (r * r);
  return P / (rho * g);
}

/**
 * Convective velocity from mixing-length theory.
 *
 * v_conv ≈ (L_conv / (4π r² ρ))^{1/3} × (α_MLT × H_P)^{1/3}
 *
 * where L_conv = L × (1 - ∇_ad/∇_rad) is the convective luminosity fraction.
 * Returns 0 in radiative zones.
 *
 * @param {number} rho - density [kg/m³]
 * @param {number} T - temperature [K]
 * @param {number} P - pressure [Pa]
 * @param {number} L - enclosed luminosity [W]
 * @param {number} r - radius [m]
 * @param {number} m - enclosed mass [kg]
 * @param {number} kappa - opacity [m²/kg]
 * @param {number} nRad - ∇_rad at this point
 * @returns {number} v_conv [m/s], 0 if radiative
 */
export function convectiveVelocity(rho, T, P, L, r, m, kappa, nRad) {
  if (nRad <= NABLA_AD) return 0; // radiative zone
  if (r < 1e-10 || rho < 1e-10) return 0;

  const HP = pressureScaleHeight(P, rho, m, r);
  if (!isFinite(HP)) return 0;

  // Fraction of luminosity carried by convection
  const convFrac = Math.max(0, 1 - NABLA_AD / nRad);
  const L_conv = L * convFrac;

  const fluxTerm = L_conv / (4 * Math.PI * r * r * rho);
  const mixingTerm = ALPHA_MLT * HP;

  return Math.pow(fluxTerm, 1 / 3) * Math.pow(mixingTerm, 1 / 3);
}

/**
 * Compute transport properties over the full radial grid.
 *
 * @param {number[]} rFrac - fractional radii r/R
 * @param {number[]} rho - density [kg/m³]
 * @param {number[]} T - temperature [K]
 * @param {number[]} P - pressure [Pa]
 * @param {number[]} L - luminosity profile [W]
 * @param {number[]} kappa - opacity profile [m²/kg]
 * @param {number} R - stellar radius [m]
 * @param {number} M - stellar mass [kg]
 * @returns {{ nabla_rad: number[], isConvective: boolean[], v_conv: number[], zoneBoundaries: number[] }}
 */
export function computeTransportProfile(rFrac, rho, T, P, L, kappa, R, M) {
  const N = rFrac.length;
  const nRadArr = new Array(N);
  const isConvArr = new Array(N);
  const vConvArr = new Array(N);

  // Compute enclosed mass profile m(r) via trapezoidal integration
  const mEnclosed = new Array(N);
  mEnclosed[0] = 0;
  for (let i = 1; i < N; i++) {
    const r0 = rFrac[i - 1] * R;
    const r1 = rFrac[i] * R;
    const dr = r1 - r0;
    const shell0 = 4 * Math.PI * r0 * r0 * rho[i - 1];
    const shell1 = 4 * Math.PI * r1 * r1 * rho[i];
    mEnclosed[i] = mEnclosed[i - 1] + 0.5 * (shell0 + shell1) * dr;
  }

  // Skip center point for now; compute interior first
  for (let i = 1; i < N; i++) {
    const r = rFrac[i] * R;
    const m = mEnclosed[i];

    nRadArr[i] = nablaRad(kappa[i], P[i], L[i], T[i], m);
    isConvArr[i] = nRadArr[i] > NABLA_AD;
    vConvArr[i] = convectiveVelocity(rho[i], T[i], P[i], L[i], r, m, kappa[i], nRadArr[i]);
  }

  // Center point: extrapolate from first interior point (avoids 0/0 singularity
  // and stays consistent with the normalized L profile)
  nRadArr[0] = (N > 1) ? nRadArr[1] : 0;
  isConvArr[0] = nRadArr[0] > NABLA_AD;
  vConvArr[0] = 0;

  // Find zone boundaries: where isConvective changes
  const zoneBoundaries = [];
  for (let i = 1; i < N; i++) {
    if (isConvArr[i] !== isConvArr[i - 1]) {
      // Linear interpolation to find precise boundary
      const frac = (rFrac[i - 1] + rFrac[i]) / 2;
      zoneBoundaries.push(frac);
    }
  }

  return {
    nabla_rad: nRadArr,
    isConvective: isConvArr,
    v_conv: vConvArr,
    mEnclosed,
    zoneBoundaries,
  };
}
