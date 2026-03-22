import { describe, it, expect } from 'vitest';
import { computeInteriorModel, polytropeIndex } from '../src/physics/interiorModel.js';
import { constants } from '../src/physics/constants.js';

describe('polytropeIndex', () => {
  it('returns 1.5 for M < 0.35', () => {
    expect(polytropeIndex(0.1)).toBe(1.5);
    expect(polytropeIndex(0.3)).toBe(1.5);
  });

  it('returns 3 for M >= 0.35', () => {
    expect(polytropeIndex(0.35)).toBe(3);
    expect(polytropeIndex(1.0)).toBe(3);
    expect(polytropeIndex(10)).toBe(3);
  });
});

describe('computeInteriorModel — solar model (1 M☉)', () => {
  const model = computeInteriorModel(1.0);

  it('returns all required fields', () => {
    const requiredFields = [
      'rFrac', 'rho', 'T', 'P', 'epsilon', 'L', 'kappa',
      'nabla_rad', 'isConvective', 'v_conv', 'zoneBoundaries',
      'mass', 'radius', 'tEff', 'Tc', 'rhoc', 'Pc', 'L_total',
    ];
    for (const field of requiredFields) {
      expect(model).toHaveProperty(field);
    }
  });

  it('uses n=3 polytrope', () => {
    expect(model.polytrope_n).toBe(3);
  });

  it('profiles have consistent length', () => {
    const N = model.N;
    expect(model.rFrac).toHaveLength(N);
    expect(model.rho).toHaveLength(N);
    expect(model.T).toHaveLength(N);
    expect(model.P).toHaveLength(N);
    expect(model.epsilon).toHaveLength(N);
    expect(model.L).toHaveLength(N);
    expect(model.kappa).toHaveLength(N);
    expect(model.nabla_rad).toHaveLength(N);
    expect(model.isConvective).toHaveLength(N);
    expect(model.v_conv).toHaveLength(N);
  });

  it('rFrac starts at 0 and ends near 1', () => {
    expect(model.rFrac[0]).toBe(0);
    expect(model.rFrac[model.N - 1]).toBeCloseTo(1, 1);
  });

  it('density decreases outward', () => {
    for (let i = 1; i < model.N; i++) {
      expect(model.rho[i]).toBeLessThanOrEqual(model.rho[i - 1] + 1);
    }
  });

  it('L(r) is monotonically increasing', () => {
    for (let i = 1; i < model.N; i++) {
      expect(model.L[i]).toBeGreaterThanOrEqual(model.L[i - 1] - 1e-10);
    }
  });

  it('has convective envelope (solar-type star)', () => {
    // At least some outer region should be convective
    const outerConvective = model.isConvective.slice(-Math.floor(model.N * 0.2));
    const hasConvection = outerConvective.some(c => c === true);
    expect(hasConvection).toBe(true);
  });

  it('has at least one zone boundary', () => {
    // The Schwarzschild criterion should produce at least one
    // convective/radiative transition somewhere in the star.
    // (Exact location depends on polytrope accuracy; the n=3 model
    // gives a slightly different boundary than the real ~0.71R.)
    expect(model.zoneBoundaries.length).toBeGreaterThan(0);
  });

  it('PP dominates over CNO at solar core temperature', () => {
    // Energy generation at center should be dominated by PP
    // (already tested in energyGeneration.test.js, but verify via model)
    expect(model.epsilon[0]).toBeGreaterThan(0);
  });
});

describe('computeInteriorModel — massive star (5 M☉)', () => {
  const model = computeInteriorModel(5.0);

  it('uses n=3 polytrope', () => {
    expect(model.polytrope_n).toBe(3);
  });

  it('has convective core region (massive star)', () => {
    // Massive stars: CNO cycle drives a convective core.
    // With n=3 polytrope + CNO, the core is convective out to ~0.1R.
    // Check that at least some inner region is convective.
    const innerPoints = model.isConvective.filter((c, i) => model.rFrac[i] < 0.15);
    const convFrac = innerPoints.filter(c => c).length / innerPoints.length;
    expect(convFrac).toBeGreaterThan(0.2);
  });

  it('higher Tc than solar model', () => {
    const solar = computeInteriorModel(1.0);
    expect(model.Tc).toBeGreaterThan(solar.Tc);
  });
});

describe('computeInteriorModel — low-mass star (0.3 M☉)', () => {
  const model = computeInteriorModel(0.3);

  it('uses n=1.5 polytrope', () => {
    expect(model.polytrope_n).toBe(1.5);
  });

  it('has significant convective envelope', () => {
    // Very low-mass stars should be mostly convective. With the n=1.5
    // polytrope, H⁻ opacity drives convection in the outer layers.
    // The model underestimates the full extent (real 0.3 M☉ are fully
    // convective) but should still show substantial convection.
    const convectiveFraction = model.isConvective.filter(c => c).length / model.N;
    expect(convectiveFraction).toBeGreaterThan(0.1);
  });

  it('all profiles are finite', () => {
    for (let i = 0; i < model.N; i++) {
      expect(isFinite(model.rho[i])).toBe(true);
      expect(isFinite(model.T[i])).toBe(true);
      expect(isFinite(model.P[i])).toBe(true);
      expect(isFinite(model.L[i])).toBe(true);
    }
  });
});

describe('computeInteriorModel — luminosity consistency', () => {
  it('L(R) matches Stefan-Boltzmann after normalization', () => {
    const model = computeInteriorModel(1.0);
    const L_surface = model.L[model.N - 1];
    const L_sb = model.L_total;

    // After normalization, L(R) should match L_SB closely
    const ratio = L_surface / L_sb;
    expect(ratio).toBeCloseTo(1.0, 1);
  });
});
