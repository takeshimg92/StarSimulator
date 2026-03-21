/**
 * Colormap functions for interior heatmap visualization.
 *
 * Each colormap maps a normalized value t ∈ [0, 1] to [r, g, b] ∈ [0, 255].
 * Designed for dark backgrounds.
 */

/**
 * Linear interpolation between two colors.
 */
function lerp(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * Multi-stop color ramp.
 * @param {number} t - value in [0, 1]
 * @param {Array<[number, number[]]>} stops - array of [position, [r,g,b]]
 */
function ramp(t, stops) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t <= t1) {
      const frac = (t - t0) / (t1 - t0);
      return lerp(c0, c1, frac);
    }
  }
  return stops[stops.length - 1][1];
}

/**
 * Temperature colormap: black → dark red → red → orange → yellow → white.
 * Mimics "hot" / "inferno" style.
 */
export function colormapTemperature(t) {
  return ramp(t, [
    [0.0, [0, 0, 0]],
    [0.2, [80, 0, 0]],
    [0.4, [180, 20, 0]],
    [0.6, [230, 120, 0]],
    [0.8, [255, 220, 50]],
    [1.0, [255, 255, 220]],
  ]);
}

/**
 * Density colormap: dark blue → blue → cyan → white.
 */
export function colormapDensity(t) {
  return ramp(t, [
    [0.0, [0, 0, 10]],
    [0.25, [0, 20, 80]],
    [0.5, [0, 80, 180]],
    [0.75, [50, 200, 240]],
    [1.0, [220, 250, 255]],
  ]);
}

/**
 * Pressure colormap: dark purple → magenta → pink → white.
 */
export function colormapPressure(t) {
  return ramp(t, [
    [0.0, [5, 0, 15]],
    [0.25, [50, 0, 80]],
    [0.5, [150, 20, 150]],
    [0.75, [220, 100, 200]],
    [1.0, [255, 230, 255]],
  ]);
}

/**
 * Energy generation colormap: black → dark green → green → yellow.
 * Designed to highlight the concentrated core emission.
 */
export function colormapEnergy(t) {
  return ramp(t, [
    [0.0, [0, 0, 0]],
    [0.15, [0, 30, 0]],
    [0.4, [0, 130, 20]],
    [0.7, [100, 210, 30]],
    [1.0, [255, 255, 80]],
  ]);
}

/**
 * Velocity colormap: black (radiative) → blue → cyan → white (convective).
 */
export function colormapVelocity(t) {
  return ramp(t, [
    [0.0, [0, 0, 5]],
    [0.2, [0, 10, 50]],
    [0.5, [20, 80, 200]],
    [0.8, [80, 210, 255]],
    [1.0, [230, 255, 255]],
  ]);
}

/**
 * Get colormap function by field name.
 * @param {string} field - one of 'temperature', 'density', 'pressure', 'energy', 'velocity'
 * @returns {function(number): number[]}
 */
export function getColormap(field) {
  switch (field) {
    case 'temperature': return colormapTemperature;
    case 'density': return colormapDensity;
    case 'pressure': return colormapPressure;
    case 'energy': return colormapEnergy;
    case 'velocity': return colormapVelocity;
    default: return colormapTemperature;
  }
}

/** Field display labels and units. */
export const FIELD_INFO = {
  temperature: { label: 'T', unit: 'K', name: 'Temperature' },
  density: { label: 'ρ', unit: 'kg/m³', name: 'Density' },
  pressure: { label: 'P', unit: 'Pa', name: 'Pressure' },
  energy: { label: 'ε', unit: 'W/kg', name: 'Energy Generation' },
  velocity: { label: 'v', unit: 'm/s', name: 'Convective Velocity' },
};
