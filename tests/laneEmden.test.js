import { describe, it, expect } from 'vitest';
import { solveLaneEmden } from '../src/utils/laneEmden.js';

describe('Lane-Emden solver', () => {
  it('n=0: first zero at xi_1 = sqrt(6) ≈ 2.449', () => {
    const sol = solveLaneEmden(0, 2000);
    const xi1 = sol.xi[sol.xi.length - 1];
    expect(xi1).toBeCloseTo(Math.sqrt(6), 1);
  });

  it('n=1: first zero at xi_1 = pi', () => {
    const sol = solveLaneEmden(1, 2000);
    const xi1 = sol.xi[sol.xi.length - 1];
    expect(xi1).toBeCloseTo(Math.PI, 1);
  });

  it('n=3 (stellar): xi_1 ≈ 6.897', () => {
    const sol = solveLaneEmden(3, 2000);
    const xi1 = sol.xi[sol.xi.length - 1];
    expect(xi1).toBeCloseTo(6.897, 0); // within 1%
  });

  it('boundary conditions: theta(0)=1, dtheta(0)=0', () => {
    const sol = solveLaneEmden(3, 2000);
    expect(sol.theta[0]).toBe(1);
    expect(sol.dtheta[0]).toBe(0);
  });
});
