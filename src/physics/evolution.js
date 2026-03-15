/**
 * Time evolution of stellar composition and structure.
 *
 * Hydrogen burns to helium via fusion. The rate is set by the luminosity:
 *   dX/dt = -L / (ε_nuc × M)
 * where ε_nuc = 0.007 c² is the energy released per unit mass of H burned.
 *
 * As X decreases:
 *   - Mean molecular weight μ increases → higher T_c → higher L
 *   - Star brightens and expands (positive feedback)
 *   - Mass decreases slightly via mass-energy equivalence
 *   - When X_core ≈ 0, the star leaves the main sequence
 */

import { constants } from './constants.js';
import { luminosityFromMass, radiusFromMass, temperatureFromMass } from './scaling.js';

// State — initialized to present-day Sun (age ~4.6 Gyr)
let age = 4.6e9;       // years
let X = 0.70;          // hydrogen mass fraction (core, present-day)
let Y = 0.28;          // helium mass fraction
const Z = 0.02;        // metals (fixed)
let currentMass = 1.0; // solar masses
let running = false;
let speedMyrPerSec = 500;

/**
 * Mean molecular weight for fully ionized gas.
 */
function meanMolecularWeight() {
  return 1 / (2 * X + 0.75 * Y + 0.5 * Z);
}

/**
 * Luminosity correction factor: L ∝ μ⁴ (homology relation).
 */
function luminosityFactor() {
  const mu0 = 1 / (2 * 0.70 + 0.75 * 0.28 + 0.5 * 0.02);
  const mu = meanMolecularWeight();
  return Math.pow(mu / mu0, 4);
}

/**
 * Radius correction: R ∝ μ^2.5
 * Slightly steeper than L ∝ μ⁴ would suggest for constant T,
 * so the star drifts right (cooler) on the H-R diagram as it ages —
 * matching the observed MS evolution track.
 */
function radiusFactor() {
  const mu0 = 1 / (2 * 0.70 + 0.75 * 0.28 + 0.5 * 0.02);
  const mu = meanMolecularWeight();
  return Math.pow(mu / mu0, 2.5);
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

  // Use tracked mass (not slider mass) so evolution is self-consistent
  const L_solar = luminosityFromMass(currentMass) * luminosityFactor();
  const L = L_solar * constants.L_sun;

  // Hydrogen depletion
  const eta = 0.007;
  const M = currentMass * constants.M_sun;
  const dXdt = -L / (eta * constants.c * constants.c * M);

  const dtSeconds = dtYears * 365.25 * 24 * 3600;
  const dX = dXdt * dtSeconds;
  X = Math.max(0, X + dX);
  Y = 1 - X - Z;

  // Mass loss from radiation: dM = -L × dt / c²
  const dM = -L * dtSeconds / (constants.c * constants.c);
  currentMass = Math.max(0.05, currentMass + dM / constants.M_sun);

  const dead = X < 0.01;

  // Evolved parameters
  const baseR = radiusFromMass(currentMass);
  const baseT = temperatureFromMass(currentMass);

  return {
    mass: Math.round(currentMass * 10) / 10,
    radius: Math.round(baseR * radiusFactor() * 10) / 10,
    temperature: Math.round(baseT * temperatureFactor() / 100) * 100,
    X,
    Y,
    age,
    dead,
  };
}

export function setRunning(on) { running = on; }
export function isRunning() { return running; }
export function setSpeed(myrPerSec) { speedMyrPerSec = Math.max(0.1, myrPerSec); }
export function getSpeed() { return speedMyrPerSec; }
export function getAge() { return age; }
export function getComposition() { return { X, Y, Z }; }
export function setComposition(newX) {
  X = Math.max(0, Math.min(0.75, newX));
  Y = 1 - X - Z;
}

/**
 * Initialize evolution with the current slider mass.
 */
export function setInitialMass(mass) {
  currentMass = mass;
}

export function reset() {
  age = 4.6e9;
  X = 0.70;
  Y = 0.28;
  currentMass = 1.0;
  running = false;
}
