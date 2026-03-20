import { describe, it, expect } from 'vitest';
import { constants, resetConstants } from '../src/physics/constants.js';

describe('Physical constants', () => {
  it('has correct SI values for key constants', () => {
    expect(constants.G).toBeCloseTo(6.674e-11, 13);
    expect(constants.c).toBeCloseTo(2.998e8, 5);
    expect(constants.k_B).toBeCloseTo(1.381e-23, 25);
    expect(constants.M_sun).toBeCloseTo(1.989e30, 27);
    expect(constants.T_sun).toBe(5778);
  });

  it('resetConstants restores defaults after mutation', () => {
    const originalG = constants.G;
    constants.G = 0;
    expect(constants.G).toBe(0);
    resetConstants();
    expect(constants.G).toBe(originalG);
  });

  it('has all expected keys', () => {
    const keys = ['G', 'k_B', 'sigma', 'c', 'm_p', 'm_e', 'e', 'h', 'M_sun', 'R_sun', 'L_sun', 'T_sun'];
    for (const key of keys) {
      expect(constants).toHaveProperty(key);
      expect(typeof constants[key]).toBe('number');
      expect(Number.isFinite(constants[key])).toBe(true);
    }
  });
});
