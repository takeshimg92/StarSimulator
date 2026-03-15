# Star Simulator — Backlog & Assumptions

## Current physics assumptions / simplifications

### Stellar structure
- **Polytropic model only (n=3)**: we solve the Lane-Emden equation for a single polytropic index. Real stars have n that varies with radius (convective zones are n≈1.5, radiative zones are n≈3). Future: composite polytropes or integrate the full stellar structure equations.
- **No equation of state**: we use ideal gas P = ρkT/μm_p everywhere. Ignores radiation pressure (important for M > 10 M☉), degeneracy pressure (important for low-mass cores and white dwarfs), and pair production.
- **Fixed mean molecular weight (μ = 0.62)**: assumes fully ionized solar composition. Should vary with composition and ionization state.

### Composition
- **Fixed solar composition (X=0.70, Y=0.28, Z=0.02)**: composition does not evolve. In reality, hydrogen burns to helium over time, changing the core composition and shifting the star on the H-R diagram.
- **No metals in particle sim**: we only show H⁺, ⁴He, e⁻. CNO elements are present at Z≈0.02 but too rare to visualize meaningfully.
- **Electron count assumes full ionization**: n_e = n_H + 2n_He. Partial ionization (relevant for T < 10⁴ K) not considered.

### Energy & transport
- **No nuclear energy generation**: we compute luminosity from Stefan-Boltzmann at the surface, not from integrating ε(r) through the core. PP/CNO rates not yet implemented.
- **No opacity model**: Kramers' opacity, electron scattering, and molecular opacities are not included. We don't distinguish radiative vs convective zones.
- **No convection**: the Schwarzschild criterion is not checked. Low-mass star envelopes and high-mass star cores should be convective.

### Time evolution
- **No time dependence**: the star is in static equilibrium. There is no hydrogen burning, no composition evolution, no aging. The user adjusts parameters instantaneously.
- **Perturbations are cosmetic**: the wobble on parameter change is visual only. No hydrodynamic perturbation propagation yet.

### Particle simulation
- **2D not 3D**: particles move in a 2D box, not a 3D volume. The MB distribution shown is the 2D Rayleigh distribution, not the 3D Maxwell speed distribution.
- **No inter-particle collisions**: particles only bounce off walls. Real plasma has Coulomb collisions, Debye shielding, etc.
- **Visual speed scaling is exaggerated**: we use power-law exponent 1.6 instead of 0.5 (physical √T) so that temperature changes look dramatic.
- **Electron speeds capped visually**: real electrons at 15 MK move ~43× faster than protons. We show this but the visual speed scaling compresses it somewhat.

### Main-sequence scaling relations
- **Empirical fits, not physical models**: R(M), L(M), T(M) use simple power-law fits. These break down at very low mass (< 0.1 M☉) and very high mass (> 50 M☉).
- **No off-MS detection**: if the user unlocks from the MS and sets unphysical combinations, we don't warn about gravitational collapse, degeneracy, etc.

---

## Version roadmap

### v0.2 (current) — remaining items
- [ ] Saha ionization panel (Div 4): H neutral/ionized fraction vs T
- [ ] Click-to-perturb: raycast on star → 1D radial perturbation wave

### v0.3 — Time evolution & deep physics
- [ ] **Passage of time**: add a time axis. Hydrogen burns to helium at a rate set by the luminosity. Core composition X(t), Y(t) evolve. The star drifts on the H-R diagram.
- [ ] H-R diagram panel: log(L) vs log(T_eff), main sequence band, current position marker, trail
- [ ] PP chain / CNO cycle energy generation rates; Gamow peak visualization
- [ ] Kramers' opacity; convective vs radiative zone indicators on profile plot
- [ ] Fundamental constant sliders (e, m_p, c) — perturb physics itself
- [ ] Composition-dependent particle sim: species fractions update as H → He over time
- [ ] Age display and "fast forward" / "rewind" controls

### v0.4 — Polish & death
- [ ] "You killed your star!" detection (degenerate matter, Chandrasekhar limit, gravitational collapse)
- [ ] LLM-based narration panel
- [ ] Deploy as static site (Vercel / GitHub Pages)
- [ ] 3D Maxwell speed distribution option in particle sim
- [ ] Inter-particle Coulomb collisions (approximate)

### Testing
- [ ] **Unit tests for physics modules**: validate Lane-Emden solver (known ξ₁ for n=3 ≈ 6.897), blackbody RGB against tabulated values, scaling relations (L, R, T at key masses), evolution hydrogen depletion rate (Sun should deplete ~0.13 over 40 Gyr), Maxwell-Boltzmann speed distribution statistics
- [ ] Test framework setup (vitest or similar, compatible with Vite)
