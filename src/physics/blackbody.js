/**
 * Convert a blackbody temperature to an approximate sRGB color.
 *
 * Uses the algorithm by Tanner Helland (attempt to match CIE 1931 2°
 * observer color-matching functions convolved with a Planck curve).
 * Valid for ~1000 K – 40000 K.
 *
 * Returns { r, g, b } in [0, 1].
 */
export function temperatureToRGB(kelvin) {
  const temp = kelvin / 100;
  let r, g, b;

  // Red
  if (temp <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * (temp - 60) ** -0.1332047592;
  }

  // Green
  if (temp <= 66) {
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
  } else {
    g = 288.1221695283 * (temp - 60) ** -0.0755148492;
  }

  // Blue
  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  }

  let rr = Math.min(1, Math.max(0, r / 255));
  let gg = Math.min(1, Math.max(0, g / 255));
  let bb = Math.min(1, Math.max(0, b / 255));

  // Mild saturation boost for educational visibility.
  // More boost at cool temps (where colors are richer),
  // less at hot temps (which should stay near blue-white).
  const avg = (rr + gg + bb) / 3;
  const boost = kelvin < 6000 ? 1.4 : 1.15;
  rr = Math.min(1, Math.max(0, avg + (rr - avg) * boost));
  gg = Math.min(1, Math.max(0, avg + (gg - avg) * boost));
  bb = Math.min(1, Math.max(0, avg + (bb - avg) * boost));

  return { r: rr, g: gg, b: bb };
}
