// Physical constants (SI units)
// These are mutable — v0.3 will add sliders for fundamental constants

export const constants = {
  G: 6.674e-11,          // gravitational constant [m^3 kg^-1 s^-2]
  k_B: 1.381e-23,        // Boltzmann constant [J K^-1]
  sigma: 5.670e-8,       // Stefan-Boltzmann constant [W m^-2 K^-4]
  c: 2.998e8,            // speed of light [m s^-1]
  m_p: 1.673e-27,        // proton mass [kg]
  m_e: 9.109e-31,        // electron mass [kg]
  e: 1.602e-19,          // electron charge [C]
  h: 6.626e-34,          // Planck constant [J s]
  M_sun: 1.989e30,       // solar mass [kg]
  R_sun: 6.957e8,        // solar radius [m]
  L_sun: 3.828e26,       // solar luminosity [W]
  T_sun: 5778,           // solar effective temperature [K]
};

export function resetConstants() {
  Object.assign(constants, {
    G: 6.674e-11,
    k_B: 1.381e-23,
    sigma: 5.670e-8,
    c: 2.998e8,
    m_p: 1.673e-27,
    m_e: 9.109e-31,
    e: 1.602e-19,
    h: 6.626e-34,
    M_sun: 1.989e30,
    R_sun: 6.957e8,
    L_sun: 3.828e26,
    T_sun: 5778,
  });
}
