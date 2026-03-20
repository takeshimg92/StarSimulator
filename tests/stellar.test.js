import { describe, it, expect } from 'vitest';
import { computeProfiles } from '../src/physics/stellar.js';
import { constants } from '../src/physics/constants.js';

describe('computeProfiles', () => {
  const solarProfiles = computeProfiles(1.0, 1.0, 5778, { mu_core: 0.85, mu_env: 0.62, q: 0.25 });

  it('returns all required fields', () => {
    for (const key of ['r', 'rho', 'T', 'P', 'L', 'Tc', 'rhoc', 'Pc', 'mu']) {
      expect(solarProfiles).toHaveProperty(key);
    }
  });

  it('luminosity matches Stefan-Boltzmann (L = 4piR^2 sigma T^4)', () => {
    const { sigma, R_sun } = constants;
    const expectedL = 4 * Math.PI * (R_sun ** 2) * sigma * (5778 ** 4);
    expect(solarProfiles.L).toBeCloseTo(expectedL, -24); // within ~1%
  });

  it('temperature decreases outward (monotonic in core)', () => {
    const { T, r } = solarProfiles;
    // Check core region (r/R < 0.7 to avoid photosphere blending)
    for (let i = 1; i < T.length; i++) {
      if (r[i] > 0.7) break;
      expect(T[i]).toBeLessThanOrEqual(T[i - 1] + 1); // allow tiny numerical noise
    }
  });

  it('central temperature exceeds surface temperature', () => {
    expect(solarProfiles.Tc).toBeGreaterThan(5778);
  });

  it('higher mu_core gives higher central temperature', () => {
    const lowMu = computeProfiles(1.0, 1.0, 5778, { mu_core: 0.62, mu_env: 0.62, q: 0.25 });
    const highMu = computeProfiles(1.0, 1.0, 5778, { mu_core: 1.2, mu_env: 0.62, q: 0.25 });
    expect(highMu.Tc).toBeGreaterThan(lowMu.Tc);
  });
});
