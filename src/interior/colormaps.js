/**
 * Colormap functions for interior heatmap visualization.
 *
 * Each colormap maps a normalized value t ∈ [0, 1] to [r, g, b] ∈ [0, 255].
 * Based on standard scientific colormaps (inferno, viridis, plasma, cividis).
 */

/**
 * Multi-stop color ramp with linear interpolation.
 */
function ramp(t, stops) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [
        c0[0] + (c1[0] - c0[0]) * f,
        c0[1] + (c1[1] - c0[1]) * f,
        c0[2] + (c1[2] - c0[2]) * f,
      ];
    }
  }
  return stops[stops.length - 1][1];
}

/**
 * Temperature: inferno (black → purple → red → orange → yellow → white).
 * Perceptually uniform, widely used for thermal data.
 */
export function colormapTemperature(t) {
  return ramp(t, [
    [0.00, [0, 0, 4]],
    [0.13, [28, 16, 68]],
    [0.25, [79, 18, 123]],
    [0.38, [136, 34, 106]],
    [0.50, [186, 54, 85]],
    [0.63, [227, 89, 51]],
    [0.75, [249, 140, 10]],
    [0.88, [249, 201, 50]],
    [1.00, [252, 255, 164]],
  ]);
}

/**
 * Density: viridis (dark purple → teal → green → yellow).
 * Perceptually uniform, good for continuous data.
 */
export function colormapDensity(t) {
  return ramp(t, [
    [0.00, [68, 1, 84]],
    [0.13, [72, 27, 109]],
    [0.25, [62, 74, 137]],
    [0.38, [49, 104, 142]],
    [0.50, [38, 130, 142]],
    [0.63, [31, 158, 137]],
    [0.75, [53, 183, 121]],
    [0.88, [110, 206, 88]],
    [1.00, [253, 231, 37]],
  ]);
}

/**
 * Pressure: plasma (dark purple → magenta → orange → yellow).
 * Perceptually uniform, high contrast.
 */
export function colormapPressure(t) {
  return ramp(t, [
    [0.00, [13, 8, 135]],
    [0.13, [75, 3, 161]],
    [0.25, [126, 3, 168]],
    [0.38, [168, 34, 150]],
    [0.50, [203, 70, 121]],
    [0.63, [229, 107, 93]],
    [0.75, [248, 148, 65]],
    [0.88, [253, 195, 40]],
    [1.00, [240, 249, 33]],
  ]);
}

/**
 * Energy generation: hot (black → red → yellow → white).
 * Good for emission-like data concentrated in the core.
 */
export function colormapEnergy(t) {
  return ramp(t, [
    [0.00, [0, 0, 0]],
    [0.20, [80, 0, 0]],
    [0.40, [180, 20, 0]],
    [0.60, [230, 120, 0]],
    [0.80, [255, 220, 50]],
    [1.00, [255, 255, 220]],
  ]);
}

/**
 * Velocity: cividis (dark blue → teal → yellow).
 * Perceptually uniform, colorblind-friendly.
 */
export function colormapVelocity(t) {
  return ramp(t, [
    [0.00, [0, 32, 77]],
    [0.13, [0, 50, 100]],
    [0.25, [46, 71, 105]],
    [0.38, [78, 91, 105]],
    [0.50, [109, 112, 108]],
    [0.63, [142, 132, 100]],
    [0.75, [177, 155, 78]],
    [0.88, [216, 183, 47]],
    [1.00, [253, 231, 37]],
  ]);
}

/**
 * Get colormap function by field name.
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
  velocity: { label: 'v', unit: 'm/s', name: 'Velocity' },
};
