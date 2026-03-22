import { describe, it, expect } from 'vitest';
import { PolarGrid } from '../src/fluid/polarGrid.js';
import { advect, diffuse, project } from '../src/fluid/stableFluids.js';

describe('advect', () => {
  it('preserves constant field under any velocity', () => {
    const grid = new PolarGrid(16, 32, 0.2, 0.8);
    const field = grid.createField();
    field.fill(3.14);
    const vr = grid.createField();
    const vth = grid.createField();
    vr.fill(0.1);
    vth.fill(0.05);
    const tmp = grid.createField();

    advect(grid, field, vr, vth, 0.01, tmp);

    for (let k = 0; k < grid.size; k++) {
      expect(field[k]).toBeCloseTo(3.14, 2);
    }
  });
});

describe('diffuse', () => {
  it('smooths out a spike', () => {
    const grid = new PolarGrid(16, 32, 0.2, 0.8);
    const field = grid.createField();
    const field0 = grid.createField();

    // Place a spike at the center of the grid
    grid.set(field, 8, 16, 100);
    field0.set(field);

    diffuse(grid, field, field0, 0.01, 0.1, 30);

    // The spike should have spread: center value decreased
    const centerVal = grid.get(field, 8, 16);
    expect(centerVal).toBeLessThan(100);
    expect(centerVal).toBeGreaterThan(0);
  });

  it('preserves uniform field', () => {
    const grid = new PolarGrid(16, 32, 0.2, 0.8);
    const field = grid.createField();
    const field0 = grid.createField();
    field.fill(5.0);
    field0.set(field);

    diffuse(grid, field, field0, 0.01, 0.1, 30);

    for (let k = 0; k < grid.size; k++) {
      expect(field[k]).toBeCloseTo(5.0, 2);
    }
  });
});

describe('project', () => {
  it('reduces divergence', () => {
    const grid = new PolarGrid(16, 32, 0.2, 0.8);
    const vr = grid.createField();
    const vth = grid.createField();
    const p = grid.createField();
    const div = grid.createField();

    // Set up a non-divergence-free velocity field
    for (let i = 0; i < grid.Nr; i++) {
      for (let j = 0; j < grid.Ntheta; j++) {
        grid.set(vr, i, j, (Math.random() - 0.5) * 0.1);
        grid.set(vth, i, j, (Math.random() - 0.5) * 0.1);
      }
    }

    // Measure divergence before
    grid.divergence(vr, vth, div);
    let maxDivBefore = 0;
    for (let k = 0; k < grid.size; k++) {
      maxDivBefore = Math.max(maxDivBefore, Math.abs(div[k]));
    }

    // Project
    project(grid, vr, vth, p, div, 50);

    // Measure divergence after
    grid.divergence(vr, vth, div);
    let maxDivAfter = 0;
    for (let k = 0; k < grid.size; k++) {
      maxDivAfter = Math.max(maxDivAfter, Math.abs(div[k]));
    }

    // Divergence should be significantly reduced
    expect(maxDivAfter).toBeLessThan(maxDivBefore);
  });
});
