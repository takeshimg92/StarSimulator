import { describe, it, expect } from 'vitest';
import { radiusFromMass, luminosityFromMass, temperatureFromMass, massFromTemperature } from '../src/physics/scaling.js';

describe('Scaling relations', () => {
  it('solar mass gives solar values', () => {
    expect(radiusFromMass(1.0)).toBeCloseTo(1.0, 2);
    expect(luminosityFromMass(1.0)).toBeCloseTo(1.0, 2);
    expect(temperatureFromMass(1.0)).toBeCloseTo(5778, -1);
  });

  it('power law is continuous at M=1 boundary', () => {
    const rBelow = radiusFromMass(0.999);
    const rAbove = radiusFromMass(1.001);
    expect(Math.abs(rAbove - rBelow)).toBeLessThan(0.01);
  });

  it('higher mass → higher luminosity', () => {
    const masses = [0.1, 0.5, 1.0, 2.0, 10.0, 50.0];
    for (let i = 1; i < masses.length; i++) {
      expect(luminosityFromMass(masses[i])).toBeGreaterThan(luminosityFromMass(masses[i - 1]));
    }
  });

  it('higher mass → higher radius', () => {
    const masses = [0.1, 0.5, 1.0, 2.0, 10.0, 50.0];
    for (let i = 1; i < masses.length; i++) {
      expect(radiusFromMass(masses[i])).toBeGreaterThan(radiusFromMass(masses[i - 1]));
    }
  });

  it('higher mass → higher temperature', () => {
    const masses = [0.1, 0.5, 1.0, 2.0, 10.0];
    for (let i = 1; i < masses.length; i++) {
      expect(temperatureFromMass(masses[i])).toBeGreaterThan(temperatureFromMass(masses[i - 1]));
    }
  });

  it('massFromTemperature inverts temperatureFromMass', () => {
    for (const m of [0.3, 1.0, 3.0, 10.0]) {
      const T = temperatureFromMass(m);
      const mRecovered = massFromTemperature(T);
      expect(mRecovered).toBeCloseTo(m, 1);
    }
  });

  it('extreme masses produce finite values', () => {
    for (const m of [0.1, 100]) {
      expect(Number.isFinite(radiusFromMass(m))).toBe(true);
      expect(Number.isFinite(luminosityFromMass(m))).toBe(true);
      expect(Number.isFinite(temperatureFromMass(m))).toBe(true);
    }
  });

  it('luminosity piecewise regimes are continuous', () => {
    // Check continuity at M=0.43 and M=2 boundaries
    expect(Math.abs(luminosityFromMass(0.429) - luminosityFromMass(0.431))).toBeLessThan(0.01);
    expect(Math.abs(luminosityFromMass(1.999) - luminosityFromMass(2.001))).toBeLessThan(0.2);
  });
});
