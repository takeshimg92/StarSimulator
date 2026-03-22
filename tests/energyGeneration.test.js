import { describe, it, expect } from 'vitest';
import { epsilonPP, epsilonCNO, epsilonTotal, computeLuminosityProfile } from '../src/physics/energyGeneration.js';

describe('epsilonPP', () => {
  it('returns positive value for solar core conditions', () => {
    // Solar core: ρ ≈ 1.5×10⁵ kg/m³, T ≈ 1.5×10⁷ K, X = 0.70
    const eps = epsilonPP(1.5e5, 1.5e7, 0.70);
    expect(eps).toBeGreaterThan(0);
  });

  it('gives ~10⁻³ W/kg at solar core (order of magnitude)', () => {
    // Standard solar model: ε_PP(center) ≈ few × 10⁻³ W/kg
    const eps = epsilonPP(1.5e5, 1.5e7, 0.70);
    expect(eps).toBeGreaterThan(1e-4);
    expect(eps).toBeLessThan(1);
  });

  it('increases with temperature (Gamow peak)', () => {
    const rho = 1e5, X = 0.70;
    // With the exponential Gamow form, rate increases steeply with T
    // but not as a fixed power law
    expect(epsilonPP(rho, 2e7, X)).toBeGreaterThan(epsilonPP(rho, 1e7, X));
    expect(epsilonPP(rho, 3e7, X)).toBeGreaterThan(epsilonPP(rho, 2e7, X));
  });

  it('scales as X²', () => {
    const rho = 1e5, T = 1.5e7;
    const ratio = epsilonPP(rho, T, 0.5) / epsilonPP(rho, T, 0.25);
    expect(ratio).toBeCloseTo(4, 1); // (0.5/0.25)² = 4
  });

  it('scales linearly with density', () => {
    const T = 1.5e7, X = 0.70;
    const ratio = epsilonPP(2e5, T, X) / epsilonPP(1e5, T, X);
    expect(ratio).toBeCloseTo(2, 1);
  });

  it('returns zero for very low temperature', () => {
    expect(epsilonPP(1e5, 100, 0.70)).toBe(0);
  });

  it('is negligible at low T (Gamow suppression)', () => {
    // At 1 MK, the Gamow barrier strongly suppresses the rate
    // compared to 15 MK (should be many orders of magnitude smaller)
    const eps_1MK = epsilonPP(1e5, 1e6, 0.70);
    const eps_15MK = epsilonPP(1e5, 1.5e7, 0.70);
    expect(eps_1MK / eps_15MK).toBeLessThan(1e-6);
  });
});

describe('epsilonCNO', () => {
  it('returns positive value for hot massive star core conditions', () => {
    const eps = epsilonCNO(5e3, 3e7, 0.70, 0.02);
    expect(eps).toBeGreaterThan(0);
  });

  it('increases much more steeply with T than PP', () => {
    const rho = 1e4, X = 0.70, Z = 0.02;
    const T1 = 2e7, T2 = 3e7;
    const ratioCNO = epsilonCNO(rho, T2, X, Z) / epsilonCNO(rho, T1, X, Z);
    const ratioPP = epsilonPP(rho, T2, X) / epsilonPP(rho, T1, X);
    // CNO has a steeper Gamow barrier → much higher T-sensitivity
    expect(ratioCNO).toBeGreaterThan(ratioPP * 10);
  });
});

describe('PP vs CNO crossover', () => {
  it('PP dominates at solar core temperature (15 MK)', () => {
    const rho = 1.5e5, T = 1.5e7, X = 0.70, Z = 0.02;
    expect(epsilonPP(rho, T, X)).toBeGreaterThan(epsilonCNO(rho, T, X, Z));
  });

  it('CNO dominates at high temperature (25 MK)', () => {
    const rho = 1e4, T = 2.5e7, X = 0.70, Z = 0.02;
    expect(epsilonCNO(rho, T, X, Z)).toBeGreaterThan(epsilonPP(rho, T, X));
  });

  it('crossover occurs between 15-25 MK', () => {
    // Find where CNO/PP = 1
    const rho = 1e5, X = 0.70, Z = 0.02;
    let crossoverT = 0;
    for (let T_MK = 10; T_MK <= 30; T_MK += 0.5) {
      const T = T_MK * 1e6;
      if (epsilonCNO(rho, T, X, Z) > epsilonPP(rho, T, X)) {
        crossoverT = T_MK;
        break;
      }
    }
    expect(crossoverT).toBeGreaterThan(15);
    expect(crossoverT).toBeLessThan(25);
  });
});

describe('computeLuminosityProfile', () => {
  it('L(r) is monotonically increasing', () => {
    const N = 50;
    const rFrac = Array.from({ length: N }, (_, i) => i / (N - 1));
    const rho = rFrac.map(r => 1e5 * Math.max(1 - r, 0.01));
    const T = rFrac.map(r => 1.5e7 * Math.max(1 - r * 0.8, 0.1));
    const R = 6.957e8;

    const { L } = computeLuminosityProfile(rFrac, rho, T, R, 0.70, 0.02);

    expect(L[0]).toBe(0);
    for (let i = 1; i < N; i++) {
      expect(L[i]).toBeGreaterThanOrEqual(L[i - 1]);
    }
  });

  it('L(R) is positive and finite', () => {
    const N = 50;
    const rFrac = Array.from({ length: N }, (_, i) => i / (N - 1));
    const rho = rFrac.map(r => 1e5 * Math.max(1 - r, 0.01));
    const T = rFrac.map(r => 1.5e7 * Math.max(1 - r * 0.8, 0.1));
    const R = 6.957e8;

    const { L } = computeLuminosityProfile(rFrac, rho, T, R, 0.70, 0.02);
    const Ltotal = L[N - 1];

    expect(Ltotal).toBeGreaterThan(0);
    expect(isFinite(Ltotal)).toBe(true);
  });
});
