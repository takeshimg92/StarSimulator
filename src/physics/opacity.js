/**
 * Opacity models for stellar interiors.
 *
 * Sources (all in SI: m²/kg):
 *   Kramers' ff+bf:  κ_K  = 3.68×10²² g_bf ρ T⁻³·⁵ (1+X)(Z+0.001)  [cm²/g]
 *                         → 3.68×10¹⁸ ρ T⁻³·⁵ (1+X)(Z+0.001)        [m²/kg]
 *                    Combined free-free + bound-free with g_bf ≈ 1.
 *   H⁻ opacity:     κ_H⁻ ≈ 2.5×10⁻³² (Z/0.02) ρ^{1/2} T⁹          [m²/kg]
 *                    Dominant in cool envelopes (3000–10000 K); drives
 *                    deep convective zones in solar-type stars.
 *   Electron scattering: κ_es = 0.02 (1+X)                            [m²/kg]
 *
 * Total opacity: Rosseland-mean approximation via harmonic mean of
 * the dominant contributors, capped at KAPPA_MAX.
 */

const KAPPA_MAX = 1e5; // m²/kg — cap for very cool surface layers

/**
 * Kramers' combined free-free + bound-free opacity.
 *
 * In CGS: κ = 3.68×10²² × g_bf × ρ × T⁻³·⁵ × (1+X)(Z+0.001)  [cm²/g]
 * with g_bf (bound-free Gaunt factor) ≈ 1 for this approximation.
 *
 * CGS→SI: ×10⁻⁴ (since 1 cm²/g = 0.1 m²/kg and ρ_CGS = ρ_SI/1000)
 * → κ_SI = 3.68×10¹⁸ × ρ × T⁻³·⁵ × (1+X)(Z+0.001)
 *
 * @param {number} rho - density [kg/m³]
 * @param {number} T - temperature [K]
 * @param {number} X - hydrogen mass fraction
 * @param {number} Z - metallicity
 * @returns {number} κ_K [m²/kg]
 */
export function kramersOpacity(rho, T, X, Z) {
  return 3.68e18 * rho * Math.pow(T, -3.5) * (1 + X) * (Z + 0.001);
}

/**
 * H⁻ (hydrogen minus ion) opacity.
 *
 * H⁻ forms when neutral H captures a free electron. Dominant in cool
 * stellar envelopes (T ~ 3000–10000 K). The opacity increases steeply
 * with temperature (∝ T⁹) because higher T produces more free electrons
 * to form H⁻, and peaks around ~10⁴ K where H begins to ionize
 * (destroying the neutral H needed).
 *
 * Approximate fit (Christy 1966, Hansen & Kawaler):
 *   κ_H⁻ ≈ 2.5×10⁻³¹ (Z/0.02) ρ^{1/2} T⁹  [cm²/g]
 *
 * CGS→SI: 1 cm²/g = 0.1 m²/kg, ρ_CGS = ρ_SI/1000
 *   ρ^{1/2}_CGS = (ρ_SI/1000)^{1/2} = ρ_SI^{1/2} / 31.62
 *   κ_SI = 2.5×10⁻³¹ × (Z/0.02) × (ρ_SI^{1/2}/31.62) × T⁹ × 0.1
 *        = 7.91×10⁻³⁴ × (Z/0.02) × ρ^{1/2} × T⁹
 *
 * @param {number} rho - density [kg/m³]
 * @param {number} T - temperature [K]
 * @param {number} Z - metallicity
 * @returns {number} κ_H⁻ [m²/kg]
 */
export function hMinusOpacity(rho, T, Z) {
  // Only relevant below ~12000 K; above that, H is ionized → no neutral H for H⁻
  if (T > 1.2e4) return 0;
  return 7.91e-34 * (Z / 0.02) * Math.sqrt(rho) * Math.pow(T, 9);
}

/**
 * Electron scattering opacity (Thomson).
 * @param {number} X - hydrogen mass fraction
 * @returns {number} κ_es [m²/kg]
 */
export function electronScatteringOpacity(X) {
  return 0.02 * (1 + X);
}

/**
 * Total opacity: additive combination of all sources, capped.
 *
 * In reality the Rosseland mean is a harmonic average, but for this
 * educational model we use a simple additive combination of the dominant
 * sources at each temperature regime. This correctly captures:
 *   - Hot cores: electron scattering dominates
 *   - Warm interiors: Kramers ff+bf dominates
 *   - Cool envelopes: H⁻ dominates (drives convection in solar-type stars)
 *
 * @param {number} rho - density [kg/m³]
 * @param {number} T - temperature [K]
 * @param {number} X - hydrogen mass fraction
 * @param {number} Z - metallicity
 * @returns {number} κ [m²/kg]
 */
export function totalOpacity(rho, T, X, Z) {
  const kK = kramersOpacity(rho, T, X, Z);
  const kHm = hMinusOpacity(rho, T, Z);
  const kes = electronScatteringOpacity(X);

  // Take the largest contributor (each dominates in its regime)
  const kTotal = Math.max(kK + kHm, kes);
  return Math.min(kTotal, KAPPA_MAX);
}
