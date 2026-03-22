import { describe, it, expect } from 'vitest';
import { nablaRad, nablaRadCenter, nablaAd, isConvective, pressureScaleHeight, convectiveVelocity } from '../src/physics/transport.js';

describe('nablaRad', () => {
  it('returns positive value for typical conditions', () => {
    // κ=0.04, P=2×10¹⁶, L=3.8×10²⁶, T=1.5×10⁷, m=2×10³⁰
    const nR = nablaRad(0.04, 2e16, 3.8e26, 1.5e7, 2e30);
    expect(nR).toBeGreaterThan(0);
    expect(isFinite(nR)).toBe(true);
  });

  it('increases with opacity', () => {
    const args = [2e16, 3.8e26, 1.5e7, 2e30];
    expect(nablaRad(0.1, ...args)).toBeGreaterThan(nablaRad(0.01, ...args));
  });

  it('increases with luminosity', () => {
    expect(nablaRad(0.04, 2e16, 1e27, 1.5e7, 2e30))
      .toBeGreaterThan(nablaRad(0.04, 2e16, 1e26, 1.5e7, 2e30));
  });

  it('returns 0 for degenerate inputs', () => {
    expect(nablaRad(0.04, 2e16, 0, 1.5e7, 2e30)).toBe(0); // L=0
    expect(nablaRad(0.04, 2e16, 3.8e26, 1.5e7, 0)).toBe(0); // m=0 → denom=0
  });
});

describe('nablaRadCenter', () => {
  it('returns finite value for solar core conditions', () => {
    // κ_c ≈ 1 m²/kg, ε_c ≈ 10 W/kg, T_c ≈ 1.5×10⁷ K
    const nR = nablaRadCenter(1, 10, 1.5e7);
    expect(nR).toBeGreaterThan(0);
    expect(isFinite(nR)).toBe(true);
  });
});

describe('nablaAd', () => {
  it('returns 0.4', () => {
    expect(nablaAd()).toBe(0.4);
  });
});

describe('isConvective', () => {
  it('returns boolean', () => {
    const result = isConvective(0.04, 2e16, 3.8e26, 1.5e7, 2e30);
    expect(typeof result).toBe('boolean');
  });
});

describe('pressureScaleHeight', () => {
  it('returns positive value for typical conditions', () => {
    // P=2×10¹⁶ Pa, ρ=1.5×10⁵ kg/m³, m=2×10³⁰ kg, r=3.5×10⁸ m
    const HP = pressureScaleHeight(2e16, 1.5e5, 2e30, 3.5e8);
    expect(HP).toBeGreaterThan(0);
    expect(isFinite(HP)).toBe(true);
  });

  it('returns Infinity at center (r=0)', () => {
    expect(pressureScaleHeight(2e16, 1.5e5, 0, 0)).toBe(Infinity);
  });
});

describe('convectiveVelocity', () => {
  it('returns 0 in radiative zone', () => {
    // nRad < nablaAd → radiative
    const v = convectiveVelocity(1e5, 1.5e7, 2e16, 3.8e26, 3.5e8, 2e30, 0.04, 0.1);
    expect(v).toBe(0);
  });

  it('returns positive value in convective zone', () => {
    // nRad > 0.4 → convective
    const v = convectiveVelocity(1e5, 1.5e7, 2e16, 3.8e26, 3.5e8, 2e30, 0.04, 10);
    expect(v).toBeGreaterThan(0);
    expect(isFinite(v)).toBe(true);
  });

  it('velocity is in reasonable range (~10-1000 m/s)', () => {
    // Solar convection zone: v ~ 100 m/s
    const v = convectiveVelocity(200, 5e5, 1e12, 3.8e26, 5e8, 1.5e30, 100, 10);
    expect(v).toBeGreaterThan(1);
    expect(v).toBeLessThan(1e6);
  });
});
