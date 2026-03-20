import { describe, it, expect } from 'vitest';

/**
 * Spot activity model extracted from main.js for testability.
 * Computes spot density and size as a function of mass and age fraction.
 */
function computeSpotActivity(mass, ageFrac) {
  let massFactor;
  if (mass < 0.35) {
    massFactor = 0.85;
  } else if (mass < 0.8) {
    massFactor = 0.25 + 0.6 * (0.8 - mass) / 0.45;
  } else if (mass <= 1.3) {
    massFactor = 0.12 + 0.13 * (1.3 - mass) / 0.5;
  } else {
    massFactor = Math.max(0, 0.12 * (1 - (mass - 1.3)));
  }

  const ageFactor = Math.max(0.15, 1.0 - 0.6 * ageFrac);
  const density = Math.max(0, Math.min(1, massFactor * ageFactor));
  const sizeFactor = mass < 0.5 ? 0.8 : mass < 1.3 ? 0.2 : 0.1;

  return { density, size: sizeFactor };
}

describe('Spot activity model', () => {
  it('solar mass at 50% age has subtle spots', () => {
    const { density, size } = computeSpotActivity(1.0, 0.5);
    expect(density).toBeLessThan(0.25);
    expect(size).toBeLessThanOrEqual(0.3);
  });

  it('M dwarf (0.2 M☉) has heavy spot coverage', () => {
    const { density } = computeSpotActivity(0.2, 0.3);
    expect(density).toBeGreaterThan(0.5);
  });

  it('massive star (5 M☉) has minimal spots', () => {
    const { density } = computeSpotActivity(5.0, 0.5);
    expect(density).toBeLessThan(0.1);
  });

  it('young star is more active than old star (same mass)', () => {
    const young = computeSpotActivity(1.0, 0.0);
    const old = computeSpotActivity(1.0, 0.9);
    expect(young.density).toBeGreaterThan(old.density);
  });

  it('density is always in [0, 1]', () => {
    const testCases = [
      [0.1, 0], [0.1, 1], [0.5, 0.5], [1.0, 0.5],
      [2.0, 0.5], [5.0, 0], [10.0, 1], [50.0, 0.5],
    ];
    for (const [mass, ageFrac] of testCases) {
      const { density } = computeSpotActivity(mass, ageFrac);
      expect(density).toBeGreaterThanOrEqual(0);
      expect(density).toBeLessThanOrEqual(1);
    }
  });
});
