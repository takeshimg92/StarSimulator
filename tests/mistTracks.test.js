import { describe, it, expect, beforeAll } from 'vitest';
import { loadTracks, getStateAtAge, getMaxAge, getZAMSAge, getSolarAge, getPhaseName, getAvailableMasses, isLoaded } from '../src/physics/mistTracks.js';
import fs from 'fs';

beforeAll(async () => {
  // Load tracks from disk (bypassing fetch since we're in Node)
  const data = JSON.parse(fs.readFileSync('src/data/mist_tracks.json', 'utf8'));
  // Manually inject — loadTracks expects a fetch, so we mock it
  await loadTracksFromData(data);
});

// Helper: directly set the tracks data since loadTracks uses fetch
async function loadTracksFromData(data) {
  // We need to call loadTracks but it uses fetch. Instead, use the module internals.
  // Since mistTracks uses module-level state, we'll use a workaround:
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ json: async () => data });
  await loadTracks();
  globalThis.fetch = originalFetch;
}

describe('MIST tracks', () => {
  it('tracks are loaded', () => {
    expect(isLoaded()).toBe(true);
  });

  it('getAvailableMasses returns sorted array', () => {
    const masses = getAvailableMasses();
    expect(masses.length).toBeGreaterThan(10);
    for (let i = 1; i < masses.length; i++) {
      expect(masses[i]).toBeGreaterThan(masses[i - 1]);
    }
  });

  it('getStateAtAge returns valid state for Sun at 4.6 Gyr', () => {
    const state = getStateAtAge(1.0, 4.6e9);
    expect(state).not.toBeNull();
    expect(state.Teff).toBeGreaterThan(4000);
    expect(state.Teff).toBeLessThan(7000);
    expect(state.R).toBeGreaterThan(0.5);
    expect(state.R).toBeLessThan(2.0);
    expect(state.L).toBeGreaterThan(0.5);
    expect(state.L).toBeLessThan(2.0);
  });

  it('getStateAtAge clamps to track bounds without NaN', () => {
    const state = getStateAtAge(1.0, 1e20); // way past end
    expect(state).not.toBeNull();
    expect(Number.isFinite(state.Teff)).toBe(true);
    expect(Number.isFinite(state.R)).toBe(true);
  });

  it('REGRESSION: getMaxAge matches getStateAtAge maxAge for all masses', () => {
    const masses = [0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 24.1, 30.0, 50.0, 100.0];
    for (const m of masses) {
      const maxAge = getMaxAge(m);
      const state = getStateAtAge(m, 0);
      expect(maxAge).toBe(state.maxAge);
    }
  });

  it('REGRESSION: interpolated mass (24.1 M☉) uses nearest track maxAge', () => {
    const maxAge = getMaxAge(24.1);
    // 24.1 is between 20 and 30, closer to 20 (frac=0.41 < 0.5)
    // Should use 20 M☉ track's maxAge (~9.62 Myr), NOT interpolated
    const maxAge20 = getMaxAge(20.0);
    expect(maxAge).toBe(maxAge20);
  });

  it('ZAMS age < max age for all masses', () => {
    for (const m of [0.5, 1.0, 5.0, 20.0, 100.0]) {
      expect(getZAMSAge(m)).toBeLessThan(getMaxAge(m));
    }
  });

  it('phase names resolve for all known codes', () => {
    for (const code of [-1, 0, 2, 3, 4, 5, 6, 9]) {
      const name = getPhaseName(code);
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('state at ZAMS has phase 0 or -1', () => {
    for (const m of [1.0, 5.0, 20.0]) {
      const zams = getZAMSAge(m);
      const state = getStateAtAge(m, zams);
      expect([0, -1]).toContain(state.phase);
    }
  });

  it('massive stars have short lifetimes', () => {
    expect(getMaxAge(20.0)).toBeLessThan(20e6);
    expect(getMaxAge(50.0)).toBeLessThan(10e6);
    // And low mass stars live much longer
    expect(getMaxAge(1.0)).toBeGreaterThan(1e9);
  });
});
