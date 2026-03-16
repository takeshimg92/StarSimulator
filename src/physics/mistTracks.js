/**
 * MIST stellar evolution track interpolator.
 *
 * Loads pre-computed MIST v1.2 tracks (solar metallicity, non-rotating)
 * and provides interpolation by mass and age.
 *
 * Data: Choi et al. (2016), Dotter (2016), Paxton et al. (2011, 2013, 2015).
 *
 * Phase codes (FSPS convention):
 *   -1  Pre-main sequence
 *    0  Main sequence
 *    2  Subgiant + RGB
 *    3  Core helium burning (CHeB / horizontal branch)
 *    4  Early AGB
 *    5  Thermally-pulsing AGB
 *    6  Post-AGB
 *    9  Wolf-Rayet
 */

let tracks = null;       // { "1.0": { star_age: [...], log_L: [...], ... }, ... }
let massKeys = [];       // sorted mass strings
let massValues = [];     // sorted mass numbers

const PHASE_NAMES = {
  [-1]: 'Pre-main sequence',
  0: 'Main sequence',
  2: 'Subgiant / RGB',
  3: 'Core He burning',
  4: 'Early AGB',
  5: 'TP-AGB',
  6: 'Post-AGB',
  9: 'Wolf-Rayet',
};

/**
 * Load the MIST tracks JSON. Call once at startup.
 */
export async function loadTracks() {
  const resp = await fetch(new URL('../data/mist_tracks.json', import.meta.url));
  tracks = await resp.json();
  massKeys = Object.keys(tracks).sort((a, b) => parseFloat(a) - parseFloat(b));
  massValues = massKeys.map(parseFloat);
}

export function isLoaded() { return tracks !== null; }

/**
 * Find the two bracketing masses for interpolation.
 * Returns { lo, hi, frac } where frac is the interpolation fraction.
 */
function bracketMass(mass) {
  if (mass <= massValues[0]) return { lo: 0, hi: 0, frac: 0 };
  if (mass >= massValues[massValues.length - 1]) {
    const last = massValues.length - 1;
    return { lo: last, hi: last, frac: 0 };
  }
  for (let i = 0; i < massValues.length - 1; i++) {
    if (mass >= massValues[i] && mass <= massValues[i + 1]) {
      const frac = (mass - massValues[i]) / (massValues[i + 1] - massValues[i]);
      return { lo: i, hi: i + 1, frac };
    }
  }
  return { lo: 0, hi: 0, frac: 0 };
}

/**
 * Interpolate a single track at a given age.
 * Returns the row values by linearly interpolating between the two bracketing age points.
 */
function interpTrackAtAge(trackKey, ageYears) {
  const t = tracks[trackKey];
  const ages = t.star_age;
  const n = ages.length;

  // Clamp to track bounds
  if (ageYears <= ages[0]) return extractRow(t, 0);
  if (ageYears >= ages[n - 1]) return extractRow(t, n - 1);

  // Binary search for bracketing age
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ages[mid] <= ageYears) lo = mid;
    else hi = mid;
  }

  const frac = (ageYears - ages[lo]) / (ages[hi] - ages[lo]);
  return lerpRows(t, lo, hi, frac);
}

function extractRow(t, i) {
  return {
    age: t.star_age[i],
    logL: t.log_L[i],
    logTeff: t.log_Teff[i],
    logR: t.log_R[i],
    logTc: t.log_center_T[i],
    logRhoc: t.log_center_Rho[i],
    heCoreM: t.he_core_mass[i],
    Xc: t.center_h1[i],
    Yc: t.center_he4[i],
    Xs: t.surface_h1[i],
    phase: t.phase[i],
  };
}

function lerpRows(t, i, j, frac) {
  const lerp = (a, b) => a + (b - a) * frac;
  return {
    age: lerp(t.star_age[i], t.star_age[j]),
    logL: lerp(t.log_L[i], t.log_L[j]),
    logTeff: lerp(t.log_Teff[i], t.log_Teff[j]),
    logR: lerp(t.log_R[i], t.log_R[j]),
    logTc: lerp(t.log_center_T[i], t.log_center_T[j]),
    logRhoc: lerp(t.log_center_Rho[i], t.log_center_Rho[j]),
    heCoreM: lerp(t.he_core_mass[i], t.he_core_mass[j]),
    Xc: lerp(t.center_h1[i], t.center_h1[j]),
    Yc: lerp(t.center_he4[i], t.center_he4[j]),
    Xs: lerp(t.surface_h1[i], t.surface_h1[j]),
    phase: t.phase[j],
  };
}

/**
 * Get stellar parameters at a given mass and age by interpolating between tracks.
 *
 * @param {number} mass - initial mass in solar masses
 * @param {number} ageYears - stellar age in years
 * @returns {{ L, Teff, R, logTc, logRhoc, heCoreM, Xc, Xs, phase, phaseName, maxAge }}
 */
export function getStateAtAge(mass, ageYears) {
  if (!tracks) return null;

  const { lo, hi, frac } = bracketMass(mass);
  const stLo = interpTrackAtAge(massKeys[lo], ageYears);
  const stHi = lo === hi ? stLo : interpTrackAtAge(massKeys[hi], ageYears);

  const lerp = (a, b) => a + (b - a) * frac;

  const logL = lerp(stLo.logL, stHi.logL);
  const logTeff = lerp(stLo.logTeff, stHi.logTeff);
  const logR = lerp(stLo.logR, stHi.logR);

  // Use the nearest track's phase (don't interpolate discrete phases)
  const phase = frac < 0.5 ? stLo.phase : stHi.phase;

  // Max age: the end of the nearest track
  const nearKey = frac < 0.5 ? massKeys[lo] : massKeys[hi];
  const nearAges = tracks[nearKey].star_age;
  const maxAge = nearAges[nearAges.length - 1];

  return {
    L: Math.pow(10, logL),           // in L☉
    Teff: Math.pow(10, logTeff),     // in K
    R: Math.pow(10, logR),           // in R☉
    logTc: lerp(stLo.logTc, stHi.logTc),
    logRhoc: lerp(stLo.logRhoc, stHi.logRhoc),
    heCoreM: lerp(stLo.heCoreM, stHi.heCoreM),
    Xc: lerp(stLo.Xc, stHi.Xc),     // core hydrogen
    Yc: lerp(stLo.Yc, stHi.Yc),     // core helium
    Xs: lerp(stLo.Xs, stHi.Xs),     // surface hydrogen
    phase,
    phaseName: PHASE_NAMES[phase] || `Phase ${phase}`,
    maxAge,
  };
}

/**
 * Get the ZAMS age for a given mass (start of phase 0).
 */
export function getZAMSAge(mass) {
  if (!tracks) return 0;
  const { lo, hi, frac } = bracketMass(mass);
  const getZams = (key) => {
    const phases = tracks[key].phase;
    const ages = tracks[key].star_age;
    for (let i = 0; i < phases.length; i++) {
      if (phases[i] === 0) return ages[i];
    }
    return ages[0];
  };
  const zLo = getZams(massKeys[lo]);
  const zHi = lo === hi ? zLo : getZams(massKeys[hi]);
  return zLo + (zHi - zLo) * frac;
}

/**
 * Get the present-day age for a solar-mass star (~4.6 Gyr).
 */
export function getSolarAge() { return 4.6e9; }

export function getPhaseName(phase) { return PHASE_NAMES[phase] || `Phase ${phase}`; }

export function getAvailableMasses() { return massValues.slice(); }

/**
 * Get the maximum age (end of track) for a given mass.
 */
export function getMaxAge(mass) {
  if (!tracks) return 15e9;
  const { lo, hi, frac } = bracketMass(mass);
  const aLo = tracks[massKeys[lo]].star_age;
  const aHi = lo === hi ? aLo : tracks[massKeys[hi]].star_age;
  const maxLo = aLo[aLo.length - 1];
  const maxHi = aHi[aHi.length - 1];
  return maxLo + (maxHi - maxLo) * frac;
}
