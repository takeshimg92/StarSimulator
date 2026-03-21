/**
 * Nuclear energy generation rates for stellar interiors.
 *
 * Full Gamow-peak forms (valid across the entire main-sequence mass range):
 *
 *   ε_PP  = 2.57×10⁻³ × ρ × X² × T₉⁻²/³ × exp(-3.381 / T₉^{1/3})         [W/kg]
 *   ε_CNO = 8.24×10¹⁸ × ρ × X × X_CNO × T₉⁻²/³ × exp(-15.231 / T₉^{1/3})  [W/kg]
 *
 * where T₉ = T / 10⁹ K.
 *
 * The exponential captures the Gamow barrier: the tunnelling probability
 * for charged-particle reactions falls exponentially at low T, making
 * the rate far more sensitive to temperature than any fixed power law.
 *
 * Coefficients C_PP and C_CNO are calibrated so that:
 *   - Solar core (T_c ≈ 15.7 MK) gives ε ≈ 10 W/kg (before L normalization)
 *   - PP/CNO crossover occurs at ~17 MK
 *
 * References: Kippenhahn, Weigert & Weiss (2012) §18.5;
 *             Hansen, Kawaler & Trimble (2004) §6.2
 */

/**
 * PP chain energy generation rate (full Gamow form).
 *
 * ε_PP = C_PP × ρ × X² × T₉⁻²/³ × exp(-33.80 / T₉^{1/3})
 *
 * The T⁻²/³ × exp() captures the Gamow peak — the competition between
 * the Maxwell-Boltzmann tail (more fast particles at higher T) and the
 * Coulomb barrier penetration probability.
 *
 * @param {number} rho - density [kg/m³]
 * @param {number} T - temperature [K]
 * @param {number} X - hydrogen mass fraction
 * @returns {number} ε_PP [W/kg]
 */
export function epsilonPP(rho, T, X) {
  if (T < 1e3) return 0; // negligible below ~1000 K
  const T9 = T / 1e9;
  const T9_13 = Math.pow(T9, 1 / 3);
  // CGS: 2.57×10⁴ erg/(g·s), ×10⁻⁷ for SI (ρ in kg/m³, result in W/kg)
  return 2.57e-3 * rho * X * X * Math.pow(T9, -2 / 3) * Math.exp(-3.381 / T9_13);
}

/**
 * CNO cycle energy generation rate (full Gamow form).
 *
 * ε_CNO = C_CNO × ρ × X × X_CNO × T₉⁻²/³ × exp(-152.28 / T₉^{1/3})
 *
 * The much larger Gamow energy (152.28 vs 33.80) reflects the higher
 * Coulomb barrier for C-N-O nuclei, making CNO extremely T-sensitive
 * and dominant only in hot cores (T > ~17 MK).
 *
 * @param {number} rho - density [kg/m³]
 * @param {number} T - temperature [K]
 * @param {number} X - hydrogen mass fraction
 * @param {number} Z - metallicity (metals mass fraction)
 * @returns {number} ε_CNO [W/kg]
 */
export function epsilonCNO(rho, T, X, Z) {
  if (T < 1e3) return 0;
  const T9 = T / 1e9;
  const T9_13 = Math.pow(T9, 1 / 3);
  const X_CNO = 0.7 * Z;
  // CGS: 8.24×10²⁵ erg/(g·s), ×10⁻⁷ for SI (ρ in kg/m³, result in W/kg)
  return 8.24e18 * rho * X * X_CNO * Math.pow(T9, -2 / 3) * Math.exp(-15.231 / T9_13);
}

/**
 * Total energy generation rate.
 * @param {number} rho - density [kg/m³]
 * @param {number} T - temperature [K]
 * @param {number} X - hydrogen mass fraction
 * @param {number} Z - metallicity
 * @returns {number} ε_total [W/kg]
 */
export function epsilonTotal(rho, T, X, Z) {
  return epsilonPP(rho, T, X) + epsilonCNO(rho, T, X, Z);
}

/**
 * Compute the luminosity profile L(r) by integrating energy generation.
 *
 * L(r) = ∫₀ʳ 4π r'² ρ(r') ε(r') dr'
 *
 * Uses trapezoidal integration over the radial grid.
 *
 * @param {number[]} rFrac - fractional radii r/R (0 to 1)
 * @param {number[]} rho - density profile [kg/m³]
 * @param {number[]} T - temperature profile [K]
 * @param {number} R - total stellar radius [m]
 * @param {number} X - hydrogen mass fraction
 * @param {number} Z - metallicity
 * @returns {{ L: number[], epsilon: number[] }} luminosity profile [W] and energy generation [W/kg]
 */
export function computeLuminosityProfile(rFrac, rho, T, R, X, Z) {
  const N = rFrac.length;
  const L = new Array(N);
  const epsilon = new Array(N);

  // Compute ε at each grid point
  for (let i = 0; i < N; i++) {
    epsilon[i] = epsilonTotal(rho[i], T[i], X, Z);
  }

  // Trapezoidal integration for L(r)
  L[0] = 0;
  for (let i = 1; i < N; i++) {
    const r0 = rFrac[i - 1] * R;
    const r1 = rFrac[i] * R;
    const dr = r1 - r0;

    const integrand0 = 4 * Math.PI * r0 * r0 * rho[i - 1] * epsilon[i - 1];
    const integrand1 = 4 * Math.PI * r1 * r1 * rho[i] * epsilon[i];

    L[i] = L[i - 1] + 0.5 * (integrand0 + integrand1) * dr;
  }

  return { L, epsilon };
}
