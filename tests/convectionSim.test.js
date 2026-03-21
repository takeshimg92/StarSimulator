import { describe, it, expect } from 'vitest';
import { ConvectionSim } from '../src/fluid/convectionSim.js';

describe('ConvectionSim', () => {
  it('initializes with correct grid dimensions', () => {
    const sim = new ConvectionSim({ Nr: 32, Ntheta: 64, rInner: 0.3, rOuter: 0.7 });
    expect(sim.grid.Nr).toBe(32);
    expect(sim.grid.Ntheta).toBe(64);
    expect(sim.vr.length).toBe(32 * 64);
  });

  it('boundary temperatures converge after one step', () => {
    const sim = new ConvectionSim({
      Nr: 16, Ntheta: 32,
      rInner: 0.2, rOuter: 0.8,
      T_inner: 10, T_outer: 1,
    });

    // After one step, BCs are enforced exactly
    sim.step(0.01);

    const T_i0 = sim.grid.get(sim.temperature, 0, 0);
    expect(T_i0).toBe(10);

    const T_oN = sim.grid.get(sim.temperature, 15, 0);
    expect(T_oN).toBe(1);
  });

  it('velocity starts at zero', () => {
    const sim = new ConvectionSim({ Nr: 16, Ntheta: 32 });
    expect(sim.maxVelocity()).toBe(0);
  });

  it('step does not produce NaN', () => {
    const sim = new ConvectionSim({
      Nr: 16, Ntheta: 32,
      rInner: 0.3, rOuter: 0.7,
      T_inner: 1.0, T_outer: 0.0,
      gravity: 1.0, alpha: 1.0,
      viscosity: 0.01, thermalDiff: 0.01,
    });

    sim.step(0.01);

    // No NaN in any field
    for (let k = 0; k < sim.grid.size; k++) {
      expect(isFinite(sim.vr[k])).toBe(true);
      expect(isFinite(sim.vtheta[k])).toBe(true);
      expect(isFinite(sim.temperature[k])).toBe(true);
    }
  });

  it('buoyancy develops velocity after several steps', () => {
    const sim = new ConvectionSim({
      Nr: 16, Ntheta: 32,
      rInner: 0.3, rOuter: 0.7,
      T_inner: 1.0, T_outer: 0.0,
      gravity: 10.0, alpha: 1.0,
      viscosity: 0.001, thermalDiff: 0.001,
    });

    // Run 50 steps
    sim.fastForward(50, 0.01);

    // Velocity should now be non-zero (buoyancy drove flow)
    expect(sim.maxVelocity()).toBeGreaterThan(0);
  });

  it('kinetic energy is bounded (no blow-up)', () => {
    const sim = new ConvectionSim({
      Nr: 16, Ntheta: 32,
      rInner: 0.3, rOuter: 0.7,
      T_inner: 1.0, T_outer: 0.0,
      gravity: 5.0, alpha: 1.0,
      viscosity: 0.01, thermalDiff: 0.01,
    });

    const energies = [];
    for (let step = 0; step < 100; step++) {
      sim.step(0.01);
      energies.push(sim.kineticEnergy());
    }

    // Energy should not diverge
    const maxEnergy = Math.max(...energies);
    expect(isFinite(maxEnergy)).toBe(true);
    expect(maxEnergy).toBeLessThan(1e10);
  });

  it('reset clears velocity and reinitializes temperature', () => {
    const sim = new ConvectionSim({
      Nr: 16, Ntheta: 32,
      rInner: 0.3, rOuter: 0.7,
      T_inner: 1.0, T_outer: 0.0,
    });

    sim.fastForward(10, 0.01);
    expect(sim.maxVelocity()).toBeGreaterThan(0);

    sim.reset({ T_inner: 2.0 });
    expect(sim.maxVelocity()).toBe(0);
    expect(sim.T_inner).toBe(2.0);
    expect(sim.time).toBe(0);
  });

  it('temperature BCs are maintained after stepping', () => {
    const sim = new ConvectionSim({
      Nr: 16, Ntheta: 32,
      rInner: 0.3, rOuter: 0.7,
      T_inner: 5.0, T_outer: 1.0,
      gravity: 5.0, alpha: 1.0,
      viscosity: 0.01, thermalDiff: 0.01,
    });

    sim.fastForward(20, 0.01);

    // Inner boundary should still be T_inner
    for (let j = 0; j < sim.Ntheta; j++) {
      expect(sim.grid.get(sim.temperature, 0, j)).toBe(5.0);
      expect(sim.grid.get(sim.temperature, sim.Nr - 1, j)).toBe(1.0);
    }
  });
});
