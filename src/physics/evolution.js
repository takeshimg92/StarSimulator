/**
 * Time evolution of stellar composition and structure.
 *
 * Two-zone model: the star is split into a core (r/R ≤ q) and envelope.
 * Only the core burns hydrogen; the envelope stays at primordial composition.
 *
 * Core (r/R ≤ q ≈ 0.25, mass fraction f_core ≈ 0.35):
 *   - X_core depletes over time via fusion
 *   - μ_core increases → drives luminosity
 *
 * Envelope (r/R > q):
 *   - X_env stays primordial (~0.70)
 *   - μ_env ≈ 0.62, constant
 *
 * Luminosity: L ∝ μ_core^α with α ≈ 1.1
 *   (low exponent because only 35% of mass changes composition)
 *
 * Radius: R ∝ μ_eff^β with β ≈ 0.85
 *   where μ_eff = f_core × μ_core + (1 - f_core) × μ_env
 */

import { constants } from './constants.js';
import { luminosityFromMass, radiusFromMass, temperatureFromMass } from './scaling.js';

// Two-zone parameters
const Q_CORE = 0.25;      // core radius fraction r/R
const F_CORE = 0.35;      // core mass fraction (from Lane-Emden n=3 at ξ ~ 0.25 ξ₁)
const ALPHA = 1.1;         // luminosity exponent on μ_core
const BETA = 0.85;         // radius exponent on μ_eff

const Z = 0.02;            // metals (fixed everywhere)

// Reference μ for ZAMS composition (X=0.70, Y=0.28)
const MU_0 = 1 / (2 * 0.70 + 0.75 * 0.28 + 0.5 * 0.02);

// State — initialized to present-day Sun (age ~4.6 Gyr)
let age = 4.6e9;           // years
let X_core = 0.34;         // core hydrogen (depleted from 0.70 over 4.6 Gyr)
let X_env = 0.70;          // envelope hydrogen (primordial)
let currentMass = 1.0;     // solar masses
let running = false;
let speedMyrPerSec = 500;
let lastLuminosityWatts = constants.L_sun;

function muFromX(X) {
  const Y = 1 - X - Z;
  return 1 / (2 * X + 0.75 * Y + 0.5 * Z);
}

function muCore() { return muFromX(X_core); }
function muEnv() { return muFromX(X_env); }
function muEff() { return F_CORE * muCore() + (1 - F_CORE) * muEnv(); }

/**
 * Luminosity correction factor: L ∝ μ_core^α
 */
function luminosityFactor() {
  return Math.pow(muCore() / MU_0, ALPHA);
}

/**
 * Radius correction: R ∝ μ_eff^β
 * Uses mass-weighted effective μ so envelope moderates expansion.
 */
function radiusFactor() {
  return Math.pow(muEff() / MU_0, BETA);
}

/**
 * Temperature correction: T_eff ∝ (L/R²)^(1/4)
 */
function temperatureFactor() {
  const Lf = luminosityFactor();
  const Rf = radiusFactor();
  return Math.pow(Lf / (Rf * Rf), 0.25);
}

export function step(dt, mass) {
  if (!running) return null;

  const dtYears = dt * speedMyrPerSec * 1e6;
  age += dtYears;

  const L = lastLuminosityWatts;

  // Hydrogen depletion — only in the core
  const eta = 0.007;
  const M_core = F_CORE * currentMass * constants.M_sun;
  const dXdt = -L / (eta * constants.c * constants.c * M_core);

  const dtSeconds = dtYears * 365.25 * 24 * 3600;
  const dX = dXdt * dtSeconds;
  X_core = Math.max(0, X_core + dX);
  // Envelope stays unchanged

  // Mass loss from radiation: dM = -L × dt / c²
  const dM = -L * dtSeconds / (constants.c * constants.c);
  currentMass = Math.max(0.05, currentMass + dM / constants.M_sun);

  const dead = X_core < 0.01;

  // Evolved parameters
  const baseR = radiusFromMass(currentMass);
  const baseT = temperatureFromMass(currentMass);

  return {
    mass: Math.round(currentMass * 10) / 10,
    radius: Math.round(baseR * radiusFactor() * 10) / 10,
    temperature: Math.round(baseT * temperatureFactor() / 100) * 100,
    X: X_core,  // slider shows core hydrogen
    Y: 1 - X_core - Z,
    age,
    dead,
  };
}

export function setRunning(on) { running = on; }
export function isRunning() { return running; }
export function setSpeed(myrPerSec) { speedMyrPerSec = Math.max(0.1, myrPerSec); }
export function getSpeed() { return speedMyrPerSec; }
export function getAge() { return age; }

export function getComposition() {
  return {
    X_core, Y_core: 1 - X_core - Z,
    X_env, Y_env: 1 - X_env - Z,
    Z,
    // Legacy single-value aliases for backward compat
    X: X_core, Y: 1 - X_core - Z,
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

export function reset() {
  age = 4.6e9;
  X_core = 0.34;
  X_env = 0.70;
  currentMass = 1.0;
  running = false;
}
