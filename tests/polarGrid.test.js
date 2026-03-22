import { describe, it, expect } from 'vitest';
import { PolarGrid } from '../src/fluid/polarGrid.js';

describe('PolarGrid', () => {
  const grid = new PolarGrid(16, 32, 0.2, 0.8);

  it('has correct dimensions', () => {
    expect(grid.Nr).toBe(16);
    expect(grid.Ntheta).toBe(32);
    expect(grid.size).toBe(16 * 32);
  });

  it('radial positions are within bounds', () => {
    expect(grid.r[0]).toBeGreaterThan(0.2);
    expect(grid.r[0]).toBeLessThan(0.8);
    expect(grid.r[grid.Nr - 1]).toBeLessThan(0.8);
    expect(grid.r[grid.Nr - 1]).toBeGreaterThan(0.2);
  });

  it('createField returns zero-filled array of correct size', () => {
    const f = grid.createField();
    expect(f.length).toBe(grid.size);
    expect(f.every(v => v === 0)).toBe(true);
  });

  it('idx wraps theta periodically', () => {
    expect(grid.idx(5, 0)).toBe(grid.idx(5, 32)); // period = Ntheta
    expect(grid.idx(5, -1)).toBe(grid.idx(5, 31));
  });

  it('idx clamps radial', () => {
    expect(grid.idx(-1, 5)).toBe(grid.idx(0, 5));
    expect(grid.idx(100, 5)).toBe(grid.idx(15, 5));
  });

  it('get/set round-trips correctly', () => {
    const f = grid.createField();
    grid.set(f, 3, 7, 42.0);
    expect(grid.get(f, 3, 7)).toBe(42.0);
  });
});

describe('PolarGrid.laplacian', () => {
  it('laplacian of constant field is zero', () => {
    const grid = new PolarGrid(16, 32, 0.2, 0.8);
    const f = grid.createField();
    f.fill(5.0);
    const out = grid.createField();
    grid.laplacian(f, out);

    // Should be zero everywhere (within numerical precision)
    for (let k = 0; k < grid.size; k++) {
      expect(Math.abs(out[k])).toBeLessThan(1e-10);
    }
  });

  it('laplacian of r² gives correct result', () => {
    // ∇²(r²) = 4 in 2D polar coordinates
    const grid = new PolarGrid(32, 64, 0.3, 0.7);
    const f = grid.createField();
    const out = grid.createField();

    for (let i = 0; i < grid.Nr; i++) {
      const r = grid.r[i];
      for (let j = 0; j < grid.Ntheta; j++) {
        grid.set(f, i, j, r * r);
      }
    }

    grid.laplacian(f, out);

    // Check interior points (skip boundaries where Neumann BCs affect accuracy)
    for (let i = 2; i < grid.Nr - 2; i++) {
      for (let j = 0; j < grid.Ntheta; j++) {
        expect(grid.get(out, i, j)).toBeCloseTo(4.0, 0);
      }
    }
  });
});

describe('PolarGrid.divergence', () => {
  it('divergence of zero field is zero', () => {
    const grid = new PolarGrid(16, 32, 0.2, 0.8);
    const vr = grid.createField();
    const vth = grid.createField();
    const div = grid.createField();
    grid.divergence(vr, vth, div);

    for (let k = 0; k < grid.size; k++) {
      expect(Math.abs(div[k])).toBeLessThan(1e-10);
    }
  });
});
