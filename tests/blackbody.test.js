import { describe, it, expect } from 'vitest';
import { temperatureToRGB } from '../src/physics/blackbody.js';

describe('temperatureToRGB', () => {
  it('Sun (~5778 K) produces yellowish-white', () => {
    const rgb = temperatureToRGB(5778);
    expect(rgb.r).toBeGreaterThan(rgb.b);
    expect(rgb.r).toBeGreaterThan(0.8);
    expect(rgb.g).toBeGreaterThan(0.6);
  });

  it('hot star (30000 K) is bluish', () => {
    const rgb = temperatureToRGB(30000);
    expect(rgb.b).toBeGreaterThanOrEqual(rgb.r);
  });

  it('cool star (3000 K) is reddish', () => {
    const rgb = temperatureToRGB(3000);
    expect(rgb.r).toBeGreaterThan(rgb.b);
    expect(rgb.r).toBeGreaterThan(rgb.g);
  });

  it('all channels stay in [0, 1] for extreme temperatures', () => {
    for (const T of [1000, 2000, 3000, 5778, 10000, 20000, 40000]) {
      const rgb = temperatureToRGB(T);
      expect(rgb.r).toBeGreaterThanOrEqual(0);
      expect(rgb.r).toBeLessThanOrEqual(1);
      expect(rgb.g).toBeGreaterThanOrEqual(0);
      expect(rgb.g).toBeLessThanOrEqual(1);
      expect(rgb.b).toBeGreaterThanOrEqual(0);
      expect(rgb.b).toBeLessThanOrEqual(1);
    }
  });

  it('higher temperature is bluer', () => {
    const cool = temperatureToRGB(3000);
    const hot = temperatureToRGB(20000);
    expect(hot.b / hot.r).toBeGreaterThan(cool.b / cool.r);
  });
});
