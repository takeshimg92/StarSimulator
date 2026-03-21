import { describe, it, expect } from 'vitest';
import { CartesianSim } from '../src/fluid/cartesianSim.js';

describe('CartesianSim', () => {
  it('initializes without NaN', () => {
    const sim = new CartesianSim({ Nx: 32, Ny: 32, Ra: 1e4 });
    for (let k = 0; k < sim.size; k++) {
      expect(isFinite(sim.T[k])).toBe(true);
    }
  });

  it('temperature BCs enforced after step', () => {
    const sim = new CartesianSim({ Nx: 32, Ny: 32, Ra: 1e4, T_bot: 1, T_top: 0 });
    sim.step(0.01);
    // Bottom row (j=0) = hot
    for (let i = 0; i < 32; i++) {
      expect(sim.get(sim.T, i, 0)).toBe(1);
    }
    // Top row (j=31) = cool
    for (let i = 0; i < 32; i++) {
      expect(sim.get(sim.T, i, 31)).toBe(0);
    }
  });

  it('no-slip BCs: velocity zero at top and bottom', () => {
    const sim = new CartesianSim({ Nx: 32, Ny: 32, Ra: 1e4 });
    sim.fastForward(50, 0.01);
    for (let i = 0; i < 32; i++) {
      expect(sim.get(sim.vx, i, 0)).toBe(0);
      expect(sim.get(sim.vy, i, 0)).toBe(0);
      expect(sim.get(sim.vx, i, 31)).toBe(0);
      expect(sim.get(sim.vy, i, 31)).toBe(0);
    }
  });

  it('develops flow at supercritical Ra', () => {
    const sim = new CartesianSim({ Nx: 32, Ny: 32, Ra: 1e4 });
    sim.fastForward(200, 0.01);
    expect(sim.maxVelocity()).toBeGreaterThan(0.001);
  });

  it('stays quiet at subcritical Ra', () => {
    const sim = new CartesianSim({ Nx: 32, Ny: 32, Ra: 100 });
    sim.fastForward(200, 0.01);
    // Low Ra: diffusion dominates, velocities should be very small
    expect(sim.maxVelocity()).toBeLessThan(1);
  });

  it('no NaN after many steps', () => {
    const sim = new CartesianSim({ Nx: 32, Ny: 32, Ra: 5e4 });
    sim.fastForward(300, 0.01);
    for (let k = 0; k < sim.size; k++) {
      expect(isFinite(sim.vx[k])).toBe(true);
      expect(isFinite(sim.vy[k])).toBe(true);
      expect(isFinite(sim.T[k])).toBe(true);
    }
  });

  it('periodic x boundary: wraps correctly', () => {
    const sim = new CartesianSim({ Nx: 32, Ny: 32, Ra: 1e4 });
    expect(sim.idx(-1, 5)).toBe(sim.idx(31, 5));
    expect(sim.idx(32, 5)).toBe(sim.idx(0, 5));
  });
});
