/**
 * Main-sequence empirical scaling relations.
 *
 * These approximate the mass-luminosity-radius-temperature relations
 * for main-sequence stars. They're not exact, but good enough for
 * the educational purpose of showing how parameters are coupled.
 *
 * All values relative to solar units.
 */

/**
 * Radius from mass (R/R☉ as a function of M/M☉).
 * R ∝ M^0.57 for M < 1, R ∝ M^0.8 for M > 1
 */
export function radiusFromMass(mass) {
  if (mass <= 1) return Math.pow(mass, 0.57);
  return Math.pow(mass, 0.8);
}

/**
 * Luminosity from mass (L/L☉ as a function of M/M☉).
 * L ∝ M^4 for M < 0.43, L ∝ M^3.5 for 0.43 < M < 2, L ∝ M^2.5 for M > 2
 */
export function luminosityFromMass(mass) {
  if (mass < 0.43) return 0.23 * Math.pow(mass, 2.3);
  if (mass < 2) return Math.pow(mass, 4);
  return 1.4 * Math.pow(mass, 3.5);
}

/**
 * Effective temperature from mass (T/T☉).
 * Derived from L = 4πR²σT⁴ → T ∝ (L/R²)^(1/4)
 */
export function temperatureFromMass(mass) {
  const L = luminosityFromMass(mass);
  const R = radiusFromMass(mass);
  return 5778 * Math.pow(L / (R * R), 0.25);
}

/**
 * Inverse: estimate mass from effective temperature.
 * Uses bisection since the T(M) relation isn't trivially invertible.
 */
export function massFromTemperature(targetT) {
  let lo = 0.1, hi = 50;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (temperatureFromMass(mid) < targetT) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
