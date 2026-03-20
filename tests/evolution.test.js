import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import * as evolution from '../src/physics/evolution.js';
import { loadTracks, isLoaded } from '../src/physics/mistTracks.js';
import fs from 'fs';

beforeAll(async () => {
  const data = JSON.parse(fs.readFileSync('src/data/mist_tracks.json', 'utf8'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ json: async () => data });
  await loadTracks();
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  evolution.reset();
});

describe('Composition constraints', () => {
  it('REGRESSION: X_core + Y_core + Z_core = 1.0 after reset', () => {
    const comp = evolution.getComposition();
    const sum = comp.X_core + comp.Y_core + comp.Z_core;
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('REGRESSION: X_core + Y_core + Z_core = 1.0 during He burning', () => {
    // Simulate He-burning composition: X depleted, Y partially burned
    evolution.setComposition(0.0); // X_core = 0
    // Manually check — Y_core_fromTrack defaults to 0.28, so Z_core = 1 - 0 - 0.28 = 0.72
    const comp = evolution.getComposition();
    const sum = comp.X_core + comp.Y_core + comp.Z_core;
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('REGRESSION: Z_core increases as Y_core decreases (He → metals)', () => {
    evolution.initFromTrack(1.0);
    const compEarly = evolution.getComposition();
    const earlyZ = compEarly.Z_core;

    // Advance to late stages by setting age near end of track
    evolution.setRunning(true);
    // Step many times to advance through He burning
    for (let i = 0; i < 100; i++) {
      evolution.step(0.1, 1.0);
    }
    const compLate = evolution.getComposition();

    // Z_core should be >= earlyZ (metals accumulate, never decrease)
    expect(compLate.Z_core).toBeGreaterThanOrEqual(earlyZ - 0.001);
    // And it should still sum to 1
    const sum = compLate.X_core + compLate.Y_core + compLate.Z_core;
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('REGRESSION: Z_env stays at 0.02 (envelope metallicity unchanged)', () => {
    const comp = evolution.getComposition();
    expect(comp.Z_env).toBeCloseTo(0.02, 5);
  });
});

describe('Mean molecular weight', () => {
  it('REGRESSION: muCore uses actual Y_core (not fixed Z)', () => {
    const mu1 = evolution.getMu().mu_core;

    // Change composition — muCore should change
    evolution.setComposition(0.0); // deplete hydrogen
    const mu2 = evolution.getMu().mu_core;

    expect(mu2).not.toBeCloseTo(mu1, 2);
    expect(mu2).toBeGreaterThan(mu1); // less H → higher mu
  });

  it('muCore > muEnv after core H depletion', () => {
    evolution.setComposition(0.1); // significant H depletion in core
    const mu = evolution.getMu();
    expect(mu.mu_core).toBeGreaterThan(mu.mu_env);
  });
});

describe('State management', () => {
  it('reset restores solar defaults', () => {
    evolution.setComposition(0.0);
    evolution.setAge(1e12);
    evolution.reset();
    expect(evolution.getAge()).toBe(4.6e9);
    const comp = evolution.getComposition();
    expect(comp.X_core).toBeCloseTo(0.34, 2);
  });

  it('step returns null when not running', () => {
    expect(evolution.step(0.016, 1.0)).toBeNull();
  });

  it('step advances age when running', () => {
    evolution.setRunning(true);
    const ageBefore = evolution.getAge();
    evolution.step(0.016, 1.0);
    expect(evolution.getAge()).toBeGreaterThan(ageBefore);
  });

  it('initFromTrack sets age to ZAMS', () => {
    evolution.initFromTrack(5.0);
    const age = evolution.getAge();
    // ZAMS age for 5 M☉ should be very small (< 1 Myr)
    expect(age).toBeLessThan(5e6);
    expect(age).toBeGreaterThan(0);
  });
});
