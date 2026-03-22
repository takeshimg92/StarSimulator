/**
 * Interior model orchestrator.
 *
 * Given a stellar mass, computes the complete 1D interior structure:
 * radial profiles of T, ρ, P, ε, κ, L(r), ∇_rad, convection flag, v_conv,
 * plus zone boundary locations.
 *
 * Uses n=1.5 polytrope for M < 0.35 M☉ (fully convective),
 * n=3 for M ≥ 0.35 M☉ (radiative interior).
 */

import { constants } from './constants.js';
import { solveLaneEmden } from '../utils/laneEmden.js';
import { radiusFromMass, luminosityFromMass, temperatureFromMass } from './scaling.js';
import { computeLuminosityProfile } from './energyGeneration.js';
import { totalOpacity } from './opacity.js';
import { computeTransportProfile } from './transport.js';

// Cache Lane-Emden solutions by polytrope index
const leCache = {};

function getLaneEmden(n) {
  if (!leCache[n]) {
    leCache[n] = solveLaneEmden(n, 2000);
  }
  return leCache[n];
}

/**
 * Choose polytrope index based on mass.
 * M < 0.35 M☉: n=1.5 (fully convective, adiabatic)
 * M ≥ 0.35 M☉: n=3 (radiative, Eddington standard model)
 * @param {number} mass - in solar masses
 * @returns {number} polytrope index
 */
export function polytropeIndex(mass) {
  return mass < 0.35 ? 1.5 : 3;
}

/**
 * Compute radial profiles from Lane-Emden solution.
 * Returns arrays in physical units.
 */
function computeBaseProfiles(mass, radius, tEff, n) {
  const { G, k_B, m_p, sigma, M_sun, R_sun } = constants;
  const le = getLaneEmden(n);

  const M = mass * M_sun;
  const R = radius * R_sun;

  const xi1 = le.xi[le.xi.length - 1];
  const dthetaXi1 = le.dtheta[le.dtheta.length - 1];
  const negXi1SqDtheta = -xi1 * xi1 * dthetaXi1;

  const alpha = R / xi1;
  const rhoc = M / (4 * Math.PI * Math.pow(alpha, 3) * negXi1SqDtheta);
  const Pc = (4 * Math.PI * G * alpha * alpha * rhoc * rhoc) / (n + 1);

  // Mean molecular weight (solar composition)
  const X = 0.70;
  const Y = 0.28;
  const Z = 0.02;
  const mu = 1 / (2 * X + 0.75 * Y + 0.5 * Z);

  const Tc = (Pc * mu * m_p) / (rhoc * k_B);
  const L = 4 * Math.PI * R * R * sigma * Math.pow(tEff, 4);

  const numPoints = le.xi.length;
  const rFrac = new Array(numPoints);
  const rho = new Array(numPoints);
  const T = new Array(numPoints);
  const P = new Array(numPoints);

  for (let i = 0; i < numPoints; i++) {
    rFrac[i] = le.xi[i] / xi1;
    const th = Math.max(le.theta[i], 0);
    rho[i] = rhoc * Math.pow(th, n);
    P[i] = Pc * Math.pow(th, n + 1);

    // Temperature profile: T = Tc × θ for polytrope
    let Ti = Tc * th;

    // Blend to T_eff near surface
    if (rFrac[i] > 0.8) {
      const blend = (rFrac[i] - 0.8) / 0.2;
      const s = blend * blend * (3 - 2 * blend);
      Ti = Ti * (1 - s) + tEff * s;
    }
    T[i] = Ti;
  }

  return { rFrac, rho, T, P, Tc, rhoc, Pc, L_total: L, M_total: M, R_total: R, X, Y, Z, mu };
}

/**
 * Compute complete interior model for a given stellar mass.
 *
 * @param {number} mass - stellar mass in solar masses (0.1 to 50)
 * @returns {object} Complete interior model with all profiles and zone info
 */
export function computeInteriorModel(mass) {
  const n = polytropeIndex(mass);
  const radius = radiusFromMass(mass);
  const tEff = temperatureFromMass(mass);

  const base = computeBaseProfiles(mass, radius, tEff, n);
  const { rFrac, rho, T, P, R_total, X, Z } = base;

  // Energy generation and luminosity profile
  const { L: L_raw, epsilon } = computeLuminosityProfile(
    rFrac, rho, T, R_total, X, Z
  );

  // Normalize L(r) so that L(R) = L_SB (Stefan-Boltzmann).
  // The simplified ε formulas don't integrate to the exact luminosity,
  // but the shape of L(r) is correct. This preserves ∇_rad accuracy.
  const L_integrated = L_raw[L_raw.length - 1];
  const L_profile = new Array(L_raw.length);
  const normFactor = (L_integrated > 0) ? base.L_total / L_integrated : 1;
  for (let i = 0; i < L_raw.length; i++) {
    L_profile[i] = L_raw[i] * normFactor;
  }

  // Opacity profile
  const kappa = new Array(rFrac.length);
  for (let i = 0; i < rFrac.length; i++) {
    kappa[i] = totalOpacity(rho[i], T[i], X, Z);
  }

  // Transport: ∇_rad, convection criterion, velocities, zone boundaries
  const transport = computeTransportProfile(
    rFrac, rho, T, P, L_profile, kappa,
    R_total, base.M_total
  );

  return {
    // Grid
    rFrac,          // r/R, 0 to 1
    N: rFrac.length,

    // Base profiles (physical units)
    rho,            // density [kg/m³]
    T,              // temperature [K]
    P,              // pressure [Pa]

    // Energy
    epsilon,        // energy generation [W/kg]
    L: L_profile,   // enclosed luminosity [W]

    // Opacity
    kappa,          // total opacity [m²/kg]

    // Transport
    nabla_rad: transport.nabla_rad,
    isConvective: transport.isConvective,
    v_conv: transport.v_conv,
    mEnclosed: transport.mEnclosed,
    zoneBoundaries: transport.zoneBoundaries,

    // Scalars
    mass,           // M/M☉
    radius,         // R/R☉
    tEff,           // effective temperature [K]
    Tc: base.Tc,    // central temperature [K]
    rhoc: base.rhoc,// central density [kg/m³]
    Pc: base.Pc,    // central pressure [Pa]
    L_total: base.L_total, // total luminosity [W]
    X: base.X,
    Y: base.Y,
    Z: base.Z,
    mu: base.mu,
    polytrope_n: n,

    // Zone summary
    coreConvective: transport.isConvective[0],
    envelopeConvective: transport.isConvective[transport.isConvective.length - 2] || false,
  };
}
