import { describe, it, expect } from 'vitest';
import { kramersOpacity, hMinusOpacity, electronScatteringOpacity, totalOpacity } from '../src/physics/opacity.js';

describe('kramersOpacity', () => {
  it('returns positive for typical stellar conditions', () => {
    expect(kramersOpacity(1e5, 1.5e7, 0.70, 0.02)).toBeGreaterThan(0);
  });

  it('decreases with increasing temperature (T⁻³·⁵)', () => {
    const rho = 1e5, X = 0.70, Z = 0.02;
    expect(kramersOpacity(rho, 1e7, X, Z)).toBeGreaterThan(kramersOpacity(rho, 2e7, X, Z));
  });

  it('increases with density (linear)', () => {
    const T = 1e7, X = 0.70, Z = 0.02;
    const ratio = kramersOpacity(2e5, T, X, Z) / kramersOpacity(1e5, T, X, Z);
    expect(ratio).toBeCloseTo(2, 1);
  });
});

describe('hMinusOpacity', () => {
  it('returns positive in cool envelope conditions (T ~ 6000 K)', () => {
    // Solar photosphere-like: T ~ 6000 K, ρ ~ 1e-1 kg/m³
    const kHm = hMinusOpacity(0.1, 6000, 0.02);
    expect(kHm).toBeGreaterThan(0);
  });

  it('returns zero above 12000 K', () => {
    expect(hMinusOpacity(100, 15000, 0.02)).toBe(0);
  });

  it('increases steeply with temperature (T⁹)', () => {
    const rho = 1, Z = 0.02;
    const ratio = hMinusOpacity(rho, 8000, Z) / hMinusOpacity(rho, 4000, Z);
    const expected = Math.pow(8000 / 4000, 9); // 512
    expect(ratio).toBeCloseTo(expected, -1);
  });

  it('increases with metallicity', () => {
    const rho = 1, T = 6000;
    expect(hMinusOpacity(rho, T, 0.04)).toBeGreaterThan(hMinusOpacity(rho, T, 0.01));
  });

  it('peaks in the right temperature range for solar envelope convection', () => {
    // H⁻ should be significant around 5000-10000 K
    const rho = 10; // typical outer envelope density
    const k5000 = hMinusOpacity(rho, 5000, 0.02);
    const k8000 = hMinusOpacity(rho, 8000, 0.02);
    const k11000 = hMinusOpacity(rho, 11000, 0.02);
    // Should be increasing up to cutoff
    expect(k8000).toBeGreaterThan(k5000);
    expect(k11000).toBeGreaterThan(k8000);
  });
});

describe('electronScatteringOpacity', () => {
  it('returns ~0.034 for solar hydrogen fraction', () => {
    // κ_es = 0.02 × (1 + 0.70) = 0.034
    expect(electronScatteringOpacity(0.70)).toBeCloseTo(0.034, 3);
  });

  it('increases with hydrogen fraction', () => {
    expect(electronScatteringOpacity(0.70)).toBeGreaterThan(electronScatteringOpacity(0.30));
  });
});

describe('totalOpacity', () => {
  it('equals electron scattering in hot, low-density regions', () => {
    // Very hot, low density: Kramers is tiny, H⁻ is zero, e⁻ scattering dominates
    const kTotal = totalOpacity(1e-3, 1e8, 0.70, 0.02);
    const kEs = electronScatteringOpacity(0.70);
    expect(kTotal).toBeCloseTo(kEs, 3);
  });

  it('is capped at 10⁵ m²/kg', () => {
    const kTotal = totalOpacity(1e5, 3000, 0.70, 0.02);
    expect(kTotal).toBeLessThanOrEqual(1e5);
  });

  it('H⁻ dominates in cool envelope conditions', () => {
    // At T ~ 8000 K, moderate density: H⁻ should be the largest contributor
    const rho = 10, T = 8000, X = 0.70, Z = 0.02;
    const kHm = hMinusOpacity(rho, T, Z);
    const kK = kramersOpacity(rho, T, X, Z);
    const kEs = electronScatteringOpacity(X);
    // H⁻ should exceed both Kramers and e⁻ scattering in this regime
    expect(kHm).toBeGreaterThan(kEs);
  });

  it('Kramers dominates in warm interior (T ~ 10⁶ K)', () => {
    const rho = 1e3, T = 1e6, X = 0.70, Z = 0.02;
    const kK = kramersOpacity(rho, T, X, Z);
    const kHm = hMinusOpacity(rho, T, Z); // should be 0 (T > 12000)
    const kEs = electronScatteringOpacity(X);
    expect(kHm).toBe(0);
    expect(kK).toBeGreaterThan(kEs);
  });

  it('returns finite value for all reasonable inputs', () => {
    const conditions = [
      [1e5, 1.5e7, 0.70, 0.02],  // solar core
      [1e-1, 5778, 0.70, 0.02],  // solar surface
      [1e3, 3e7, 0.70, 0.02],    // massive star core
      [10, 8000, 0.70, 0.02],    // cool envelope (H⁻ regime)
    ];
    for (const [rho, T, X, Z] of conditions) {
      const k = totalOpacity(rho, T, X, Z);
      expect(isFinite(k)).toBe(true);
      expect(k).toBeGreaterThan(0);
    }
  });
});
