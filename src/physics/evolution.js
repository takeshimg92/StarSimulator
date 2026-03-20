/**
 * Time evolution of stellar structure using MIST tracks.
 *
 * When time evolution is enabled, the star's global parameters (L, T_eff, R)
 * are looked up from pre-computed MIST evolutionary tracks interpolated at
 * the current mass and age. Composition and internal structure are also
 * provided by the tracks.
 *
 * The two-zone model is still used for computing internal profiles (Lane-Emden)
 * and for the static (time-disabled) mode.
 */

import { constants } from './constants.js';
import { luminosityFromMass, radiusFromMass, temperatureFromMass } from './scaling.js';
import { getStateAtAge, isLoaded as mistLoaded, getSolarAge, getZAMSAge, getMaxAge } from './mistTracks.js';

// Two-zone parameters (used for profiles and static mode)
const Q_CORE = 0.25;
const F_CORE = 0.35;
const Z = 0.02;
const MU_0 = 1 / (2 * 0.70 + 0.75 * 0.28 + 0.5 * 0.02);

// Slow-motion mode: dramatically reduces speed during rapid evolutionary phases
let slowMotionEnabled = true;

// State
let age = 4.6e9;
let X_core = 0.34;
let X_env = 0.70;
let currentMass = 1.0;
let running = false;
let speedMyrPerSec = 500;
let lastLuminosityWatts = constants.L_sun;

// Current phase from MIST
let currentPhase = 0;
let currentPhaseName = 'Main sequence';
let trackEnded = false;
let Y_core_fromTrack = 0.28;
let heCoreM_fromTrack = 0;

function muFromX(X) {
  const Y = 1 - X - Z;
  return 1 / (2 * X + 0.75 * Y + 0.5 * Z);
}

function muCore() {
  const Y = Y_core_fromTrack;
  const Z_c = Math.max(0, 1 - X_core - Y);
  return 1 / (2 * X_core + 0.75 * Y + 0.5 * Z_c);
}
function muEnv() { return muFromX(X_env); }
function muEff() { return F_CORE * muCore() + (1 - F_CORE) * muEnv(); }

export function step(dt, mass) {
  if (!running) return null;

  let dtYears = dt * speedMyrPerSec * 1e6;

  // Adaptive time-stepping: limit the age advance so we don't skip
  // rapid evolutionary phases (RGB tip, He flash).
  if (mistLoaded()) {
    const stNow = getStateAtAge(currentMass, age);
    const stNext = getStateAtAge(currentMass, age + dtYears);
    if (stNow && stNext) {
      const rNow = stNow.R, rNext = stNext.R;
      if (rNow > 0.1 && rNext > 0.1) {
        const ratio = Math.max(rNext / rNow, rNow / rNext);
        // When slow-motion is on: cap at 5% radius change per step (very smooth)
        // When off: cap at 30% (fast but doesn't skip phases)
        const maxChange = slowMotionEnabled ? 1.05 : 1.3;
        if (ratio > maxChange) {
          dtYears *= Math.log(maxChange) / Math.log(ratio);
        }
      }
    }
  }

  age += dtYears;

  // Use MIST tracks if available
  if (mistLoaded()) {
    const state = getStateAtAge(currentMass, age);
    if (!state) return null;

    currentPhase = state.phase;
    currentPhaseName = state.phaseName;

    // Update composition from track
    X_core = Math.max(0, state.Xc);
    X_env = Math.max(0, state.Xs);
    // Core helium (for species display — decreases during CHeB)
    Y_core_fromTrack = state.Yc !== undefined ? state.Yc : (1 - X_core - Z);
    heCoreM_fromTrack = state.heCoreM || 0;

    // Track ended?
    trackEnded = age >= state.maxAge;

    return {
      mass: Math.round(currentMass * 10) / 10,
      radius: Math.round(state.R * 100) / 100,
      temperature: Math.round(state.Teff),
      luminosity: state.L,  // in L☉
      X: X_core,
      Y: 1 - X_core - Z,
      age,
      phase: currentPhase,
      phaseName: currentPhaseName,
      dead: trackEnded,
      logTc: state.logTc,
      logRhoc: state.logRhoc,
    };
  }

  // Fallback: analytical two-zone model (no MIST data)
  return stepAnalytical(dt);
}

function stepAnalytical(dt) {
  const L = lastLuminosityWatts;
  const eta = 0.007;
  const M_core = F_CORE * currentMass * constants.M_sun;
  const dtYears = dt * speedMyrPerSec * 1e6;
  const dtSeconds = dtYears * 365.25 * 24 * 3600;
  const dXdt = -L / (eta * constants.c * constants.c * M_core);
  X_core = Math.max(0, X_core + dXdt * dtSeconds);

  const dM = -L * dtSeconds / (constants.c * constants.c);
  currentMass = Math.max(0.05, currentMass + dM / constants.M_sun);

  const ALPHA = 1.1, BETA = 0.85;
  const muC = muCore(), muE = muEnv();
  const muEf = F_CORE * muC + (1 - F_CORE) * muE;
  const Lf = Math.pow(muC / MU_0, ALPHA);
  const Rf = Math.pow(muEf / MU_0, BETA);
  const Tf = Math.pow(Lf / (Rf * Rf), 0.25);

  const baseR = radiusFromMass(currentMass);
  const baseT = temperatureFromMass(currentMass);

  return {
    mass: Math.round(currentMass * 10) / 10,
    radius: Math.round(baseR * Rf * 10) / 10,
    temperature: Math.round(baseT * Tf / 100) * 100,
    X: X_core,
    Y: 1 - X_core - Z,
    age,
    phase: 0,
    phaseName: 'Main sequence',
    dead: X_core < 0.01,
  };
}

/**
 * Look up the star's state at the current age without advancing time.
 * Used by the time scrubber.
 */
export function lookupCurrentState() {
  if (!mistLoaded()) return null;
  const state = getStateAtAge(currentMass, age);
  if (!state) return null;
  currentPhase = state.phase;
  currentPhaseName = state.phaseName;
  X_core = Math.max(0, state.Xc);
  X_env = Math.max(0, state.Xs);
  Y_core_fromTrack = state.Yc !== undefined ? state.Yc : (1 - X_core - Z);
  heCoreM_fromTrack = state.heCoreM || 0;
  trackEnded = age >= state.maxAge;
  return {
    mass: Math.round(currentMass * 10) / 10,
    radius: Math.round(state.R * 100) / 100,
    temperature: Math.round(state.Teff),
    luminosity: state.L,
    X: X_core,
    Y: 1 - X_core - Z,
    age,
    phase: currentPhase,
    phaseName: currentPhaseName,
    dead: trackEnded,
    logTc: state.logTc,
    logRhoc: state.logRhoc,
  };
}

export function setSlowMotion(on) { slowMotionEnabled = on; }
export function setRunning(on) { running = on; }
export function isRunning() { return running; }
export function setSpeed(myrPerSec) { speedMyrPerSec = Math.max(0.1, myrPerSec); }
export function getSpeed() { return speedMyrPerSec; }
export function getAge() { return age; }
export function setAge(newAge) { age = newAge; }
export function getTrackMaxAge() { return mistLoaded() ? getMaxAge(currentMass) : 15e9; }
export function getTrackMinAge() { return mistLoaded() ? getZAMSAge(currentMass) : 0; }
export function getPhase() { return currentPhase; }
export function getPhaseName() { return currentPhaseName; }

export function getComposition() {
  const Z_core = Math.max(0, 1 - X_core - Y_core_fromTrack);
  return {
    X_core, Y_core: Y_core_fromTrack,
    X_env, Y_env: 1 - X_env - Z,
    Z_core,
    Z_env: Z,
    Z,          // kept for backward compat (envelope metallicity)
    X: X_core, Y: Y_core_fromTrack,
    heCoreM: heCoreM_fromTrack,
  };
}

export function getMu() {
  return { mu_core: muCore(), mu_env: muEnv(), mu_eff: muEff() };
}

export function getCoreRadius() { return Q_CORE; }
export function getCoreMassFraction() { return F_CORE; }

export function setLuminosity(L_watts) { lastLuminosityWatts = L_watts; }

export function setComposition(newX) {
  X_core = Math.max(0, Math.min(0.75, newX));
}

export function setInitialMass(mass) {
  currentMass = mass;
}

/**
 * Initialize age from MIST track for the given mass.
 * Finds the present-day position on the track.
 */
export function initFromTrack(mass) {
  currentMass = mass;
  trackEnded = false;
  if (mistLoaded()) {
    // Always start from ZAMS — lets the user watch the full life of any star
    age = getZAMSAge(mass);
    const st = getStateAtAge(mass, age);
    if (st) {
      X_core = st.Xc;
      X_env = st.Xs;
      Y_core_fromTrack = st.Yc !== undefined ? st.Yc : (1 - X_core - Z);
      heCoreM_fromTrack = st.heCoreM || 0;
      currentPhase = st.phase;
      currentPhaseName = st.phaseName;
    }
  }
}

export function reset() {
  age = 4.6e9;
  X_core = 0.34;
  X_env = 0.70;
  currentMass = 1.0;
  running = false;
  currentPhase = 0;
  currentPhaseName = 'Main sequence';
  trackEnded = false;
  heCoreM_fromTrack = 0;
  Y_core_fromTrack = 0.28;
}
