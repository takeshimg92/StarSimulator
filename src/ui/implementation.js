import katex from 'katex';

const sections = [
  {
    title: 'Overview',
    body: `This simulator computes stellar structure, appearance, and evolution in real time using a combination of analytical models, empirical scaling relations, and GPU-accelerated rendering. This page describes how each component works and what approximations are made.`,
  },
  {
    title: 'Evolutionary Tracks: MIST',
    body: `When time evolution is enabled, the star's global parameters ($L$, $T_{\\text{eff}}$, $R$, composition, evolutionary phase) are read from pre-computed <b>MIST</b> (MESA Isochrones and Stellar Tracks) evolutionary tracks at solar metallicity. This is the backbone of the simulator — it provides physically accurate evolution from birth to death for any star mass.

The simulator ships with 65 tracks spanning 0.1–300 $M_\\odot$, each containing $\\sim$300 data points from the pre-main sequence through the thermally-pulsing AGB or Wolf-Rayet phase. At runtime, the two tracks bracketing the user's chosen mass are interpolated at the current stellar age using binary search + linear interpolation.
<ul>
<li><b>Data source:</b> MIST v1.2 (Choi et al. 2016, Dotter 2016), computed with MESA r7503. Solar metallicity $[\\text{Fe/H}] = 0.00$, non-rotating ($v/v_{\\text{crit}} = 0$), Asplund et al. (2009) protosolar composition ($Y = 0.27$, $Z = 0.014$).</li>
<li><b>Columns used:</b> age, $\\log L$, $\\log T_{\\text{eff}}$, $\\log R$, $\\log T_c$, $\\log \\rho_c$, He core mass, center $X$ (H), center $Y$ (He), surface $X$, and evolutionary phase.</li>
<li><b>Phase codes:</b> $-1$ = pre-MS, $0$ = main sequence, $2$ = subgiant/RGB, $3$ = core He burning (horizontal branch), $4$ = early AGB, $5$ = TP-AGB, $6$ = post-AGB, $9$ = Wolf-Rayet.</li>
<li><b>Data volume:</b> 1.3 MB JSON ($\\sim$280 KB gzipped), loaded asynchronously at startup. An analytical two-zone model serves as a fallback if tracks have not yet loaded.</li>
<li><b>Limitation:</b> MIST tracks end at the TP-AGB or WR phase. The final remnant (white dwarf, neutron star, or black hole) is not modeled by MIST — the simulator infers the expected fate from the initial mass and triggers an end-of-life animation.</li>
</ul>`,
  },
  {
    title: 'Composition Tracking',
    body: `The star's composition is tracked separately for core and envelope. During hydrogen burning, the core depletes H and accumulates He. During helium burning (phase 3 and beyond), He is fused into C and O — tracked as increasing <b>metals fraction</b>:`,
    equation: String.raw`Z_{\text{core}} = 1 - X_{\text{core}} - Y_{\text{core}}`,
    after: `This ensures the core composition always sums to unity. The envelope retains its initial metallicity ($Z_{\\text{env}} = 0.02$) throughout the star's life.

The mean molecular weight $\\mu_{\\text{core}}$ is computed from the actual track composition (including the dynamic $Z_{\\text{core}}$), not from a fixed metallicity. This matters during He burning, where $\\mu$ rises significantly as metals accumulate.
<br>
When the star reaches end-of-life, the composition display shows "Ejected" for the envelope — reflecting that the envelope has been expelled as a planetary nebula or supernova remnant.`,
  },
  {
    title: 'Internal Structure: the Lane-Emden Equation',
    body: `The star's internal profiles (density, temperature, pressure vs. radius) are computed from the <b>Lane-Emden equation</b> for a polytropic star with index $n = 3$ (appropriate for radiative equilibrium):`,
    equation: String.raw`\frac{1}{\xi^2}\frac{d}{d\xi}\!\left(\xi^2\frac{d\theta}{d\xi}\right) + \theta^3 = 0`,
    after: `This ODE is solved numerically using a <b>4th-order Runge-Kutta</b> (RK4) integrator, from the center ($\\xi = 0$, $\\theta = 1$) outward until $\\theta$ first crosses zero at $\\xi_1 \\approx 6.897$.

The singularity at $\\xi = 0$ is handled via L'Hôpital's rule. The solution is computed once and cached, then mapped to physical units using the user's chosen mass $M$ and radius $R$:`,
    equation2: String.raw`\rho(r) = \rho_c\,\theta^3, \quad T(r) = T_c\,\theta, \quad P(r) = P_c\,\theta^4`,
    after2: `where the central values $\\rho_c$, $T_c$, $P_c$ are derived from $M$, $R$, and the ideal gas law with mean molecular weight $\\mu \\approx 0.62$.
<br>
<ul>
<li><b>Photosphere blending:</b> the $n=3$ polytrope has $\\theta \\to 0$ at the surface, giving $T \\to 0$ — unphysical, since the real photosphere has $T = T_{\\text{eff}}$. For $r/R > 0.8$, the temperature profile is smoothstep-blended toward $T_{\\text{eff}}$: $T(r) = T_{\\text{poly}}(r) \\cdot (1-s) + T_{\\text{eff}} \\cdot s$, where $s$ is a cubic smoothstep of $(r/R - 0.8)/0.2$. This preserves the accurate interior profile while avoiding the unphysical surface discontinuity.</li>
<li><b>Caveat: why $n = 3$ everywhere?</b> Real stars are not single polytropes. Radiative zones (stellar cores of solar-type stars, envelopes of massive stars) are well approximated by $n = 3$. Convective zones (envelopes of solar-type stars, cores of massive stars, fully convective M dwarfs) are closer to $n = 3/2$ (adiabatic ideal gas). A composite model with different $n$ in different zones would be more accurate, but the visual difference in the profiles is subtle. We use $n = 3$ throughout as a reasonable single approximation — the global parameters ($L$, $T_{\\text{eff}}$, $R$) are driven by MIST tracks regardless, so the polytropic solution only shapes the interior profiles shown in the slice view.</li>
</ul>`,
  },
  {
    title: 'Main-Sequence Scaling Relations',
    body: `The mass slider drives radius, temperature, and luminosity via empirical power-law fits for main-sequence stars:`,
    equation: String.raw`R \propto M^{0.57}\;(M < 1),\quad R \propto M^{0.8}\;(M \geq 1)`,
    after: `For luminosity:`,
    equation2: String.raw`L \propto M^{2.3}\;(M < 0.43),\quad L \propto M^{4}\;(0.43 \leq M < 2),\quad L \propto M^{3.5}\;(M \geq 2)`,
    after2: `Temperature is derived from the Stefan-Boltzmann law $L = 4\\pi R^2 \\sigma T_{\\text{eff}}^4$. The inverse mapping (temperature or radius to mass) uses bisection search.

These are the same relations used to draw the main-sequence band on the H-R diagram, ensuring consistency between the sliders and the diagram.`,
  },
  {
    title: 'Two-Zone Analytical Model',
    body: `As a fallback (before MIST tracks load), the star is split into two composition zones: a <b>core</b> ($r/R \\leq 0.25$, mass fraction $f_{\\text{core}} = 0.35$) and an <b>envelope</b> ($r/R > 0.25$).

Only the core burns hydrogen:`,
    equation: String.raw`\frac{dX_{\text{core}}}{dt} = -\frac{L}{\eta\,c^2\,M_{\text{core}}}, \qquad M_{\text{core}} = f_{\text{core}} \cdot M`,
    after: `The envelope retains its primordial composition ($X_{\\text{env}} = 0.70$). The temperature profile uses a <b>sigmoid blend</b> at the core-envelope boundary: $\\mu(r) = w(r)\\,\\mu_{\\text{core}} + (1-w(r))\\,\\mu_{\\text{env}}$ where $w(r) = 1/(1 + e^{(r/R - q)/\\delta})$ with $\\delta = 0.05$.

Luminosity and radius scale with composition:`,
    equation2: String.raw`L \propto \mu_{\text{core}}^{1.1}, \qquad R \propto \mu_{\text{eff}}^{0.85}, \qquad \mu_{\text{eff}} = f_{\text{core}}\,\mu_{\text{core}} + (1-f_{\text{core}})\,\mu_{\text{env}}`,
    after2: `<b>Calibration:</b> at ZAMS ($X_{\\text{core}} = 0.70$), $L \\approx 0.7\\,L_\\odot$. At the present day ($X_{\\text{core}} \\approx 0.34$), $L \\approx 1.0\\,L_\\odot$. At TAMS ($X_{\\text{core}} \\approx 0.05$), $L \\approx 2.0\\,L_\\odot$.

When MIST tracks are loaded, the time evolution system takes over from this analytical model and drives the star through its full evolutionary track.`,
  },
  {
    title: 'PP Chain vs CNO Cycle',
    body: `The tooltip shows the energy generation breakdown when hovering over the core in slice view. The fraction is computed from the ratio of temperature-dependent rates:`,
    equation: String.raw`\frac{\varepsilon_{\text{CNO}}}{\varepsilon_{\text{PP}}} = 0.02 \times \left(\frac{T_6}{15}\right)^{13}`,
    after: `where $T_6$ is the temperature in millions of K. This parameterization is calibrated to give PP $\\approx$ 98% at solar core conditions ($T_c = 15$ MK) and crossover around 23 MK, matching detailed nuclear reaction network calculations.

The exponent 13 encodes the difference in temperature sensitivity between the CNO cycle ($T^{16}$) and PP chain ($T^4$), plus corrections for the composition-dependent prefactors.`,
  },
  {
    title: '3D Rendering',
    body: `The star is rendered as a 128$\\times$128 sphere with a custom GLSL shader. The rendering pipeline uses Three.js with post-processing:

<b>Render → Bloom → Tint (sunglasses) → Output</b>

The fragment shader computes several layers of surface detail:`,
    after: `<ul>
<li><b>Limb darkening</b> — quadratic law: $I(\\mu) = 1 - u(1-\\mu) - 0.2(1-\\mu)^2$ where $\\mu = \\cos\\theta$.</li>
<li><b>Granulation</b> — fine-scale Worley (cellular) noise simulating convection cells. Cell edges appear as dark lanes. Animated to slowly churn over time.</li>
<li><b>Sunspots</b> — two overlapping Worley patterns whose scale and threshold are driven by \`uSpotDensity\` and \`uSpotSize\` uniforms (see "Starspot Activity Model" below). Dark umbrae (8% brightness) with brownish penumbrae drift slowly across the surface.</li>
<li><b>Faculae</b> — bright annular regions surrounding spots, with enhanced brightness near the limb (matching observations).</li>
<li><b>Surface displacement</b> — the vertex shader perturbs vertices along their normals using multi-octave value noise, so the star isn't a perfect sphere.</li>
</ul>
All surface features are animated via time-dependent noise offsets.

<b>Smooth transitions:</b> all visual parameter changes (color, size, bloom) use a spring-damped system ($\\ddot{x} = K(x_{\\text{target}} - x) - D\\dot{x}$, with $K=12$, $D=7$) rather than instant snapping. Large manual parameter changes trigger a brief asymmetric wobble; this wobble is suppressed during time evolution and scrubbing for a smooth cinematic feel.`,
  },
  {
    title: 'Starspot Activity Model',
    body: `Starspot coverage varies dramatically across spectral types. The simulator drives two shader uniforms — <b>uSpotDensity</b> (how many Worley cells become spots) and <b>uSpotSize</b> (Worley cell scale) — as functions of stellar mass and age.
<br><br>
<b>Mass dependence</b> (convection zone structure):`,
    after: `<ul>
<li>$M < 0.35\\,M_\\odot$ (fully convective M dwarfs): high coverage — turbulent dynamo throughout the star.</li>
<li>$0.35$–$0.8\\,M_\\odot$ (K dwarfs): moderate — deep convective envelopes with strong tachocline shear.</li>
<li>$0.8$–$1.3\\,M_\\odot$ (solar-type, G/F): subtle ($\\sim$1% coverage) — thin convective envelope, moderate dynamo.</li>
<li>$> 1.3\\,M_\\odot$ (A/B/O stars): minimal to none — radiative envelopes lack the convective motions needed to sustain a dynamo.</li>
</ul>
<b>Age dependence:</b> young stars rotate faster and are more magnetically active. As they age, magnetic braking via stellar winds transfers angular momentum outward, spinning the star down. The activity factor decreases as $1 - 0.6 \\times (\\text{age}/\\text{max age})$, never reaching zero (even old stars retain residual cycles).
<br><br>
In the shader, the density uniform controls Worley noise smoothstep thresholds (lower threshold = more cells pass as spots), while the size uniform controls the Worley cell scale (larger cells = bigger spots for low-mass stars).`,
    refs: [
      { text: 'Berdyugina (2005) — Starspots: a key to the stellar dynamo', url: 'https://doi.org/10.12942/lrsp-2005-8' },
    ],
  },
  {
    title: 'Blackbody Colors',
    body: `Star colors are computed from effective temperature using the <b>Tanner Helland algorithm</b>, an empirical fit to the CIE 1931 2° observer color-matching functions convolved with a Planck spectrum. Valid for 1000–40000 K.

A mild saturation boost is applied for educational visibility: 1.4$\\times$ for cool stars ($T < 6000$ K), 1.15$\\times$ for hot stars. Without this, most stars would appear nearly white — physically correct but pedagogically unhelpful.`,
  },
  {
    title: 'Real Starfield: Yale Bright Star Catalog',
    body: `The background starfield uses real stellar positions from the <b>Yale Bright Star Catalog</b> (BSC5), containing 9,096 stars with visual magnitude $\\lesssim 8$.

Each star's right ascension and declination are converted to a unit vector on the celestial sphere and placed at $r = 900$ (well beyond the maximum camera distance of 600). The <b>B-V color index</b> is mapped to RGB via a piecewise approximation of the spectral sequence:`,
    after: `<ul>
<li>O/B stars ($B\\!-\\!V < 0$): blue-white.</li>
<li>A/F stars ($0 < B\\!-\\!V < 0.4$): white to yellow-white.</li>
<li>G stars ($0.4 < B\\!-\\!V < 0.8$): yellow (the Sun has $B\\!-\\!V \\approx 0.65$).</li>
<li>K stars ($0.8 < B\\!-\\!V < 1.4$): orange.</li>
<li>M stars ($B\\!-\\!V > 1.4$): red.</li>
</ul>
Brightness scales with apparent magnitude: brighter stars have higher RGB values. A random fallback starfield (4,000 points) is used if the catalog fails to load.`,
    refs: [
      { text: 'Hoffleit & Jaschek — Bright Star Catalogue, 5th ed.', url: 'https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html' },
    ],
  },
  {
    title: 'Slice View & Cross-Section',
    body: `The "Show Slice" toggle uses a custom GLSL uniform to discard fragments where $z_{\\text{world}} > 0$, cutting away the front hemisphere. A flat 512$\\times$512 canvas texture at $z = 0$ renders the interior cross-section:
<ul>
<li><b>Radial temperature gradient:</b> 80 concentric annuli are drawn, each colored by mapping the Lane-Emden temperature profile through the blackbody-to-RGB function. This produces a smooth gradient from white-yellow at the center ($\\sim$15 MK) to deep orange-red at the surface.</li>
<li><b>Zone boundaries:</b> a solid ring at $r/R = 0.25$ marks the core boundary; a dashed ring at $r/R = 0.70$ marks the onset of convection.</li>
<li><b>Convection cells:</b> 14 radial plume/lane pairs are animated in the $r/R > 0.70$ annular region. Bright wedges (rising hot plasma) alternate with dark wedges (sinking cooled plasma), with sinusoidal pulsation for visual variety. Alternating cells rotate in opposite directions.</li>
</ul>
The canvas texture is re-drawn every frame when slice view is active, and uploaded to the GPU via \`CanvasTexture\`.`,
  },{
    title: 'Particle Simulation',
    body: `The core particle box simulates ions at the core temperature $T_c$. Each particle species has a thermal speed:`,
    equation: String.raw`v_{\text{th}} = \sqrt{\frac{2\,k_B\,T_c}{m}}`,
    after: `Velocities are sampled from the 2D <b>Maxwell-Boltzmann (Rayleigh) distribution</b> using Box-Muller–generated Gaussian components. The histogram shows proton speeds only, since helium nuclei are much slower and electrons are far too fast to fit on the same scale.

Two species are shown: H$^+$ (protons) and $^4$He. Their number fractions are derived from mass fractions via $n_H \\propto X$, $n_{He} \\propto Y/4$, and update dynamically as the star evolves.

<b>Visual scaling:</b> the mapping from physical to visual speed uses an exaggerated power law ($v_{\\text{visual}} \\propto v_{\\text{physical}}^{1.6}$) so that temperature changes produce dramatic, visible differences.`,
  },
  {
    title: 'H-R Diagram',
    body: `The Hertzsprung-Russell diagram plots $\\log(L/L_\\odot)$ vs. $\\log(T_{\\text{eff}})$ with temperature increasing to the left (astronomical convention).

The main-sequence band is computed by sampling the same scaling relations used by the sliders across masses 0.1–50 $M_\\odot$, ensuring perfect consistency. The band width is $\\pm 0.3$ dex in $\\log L$.

Up to 500 past positions are stored as a trail. Older points fade in opacity, and each point is colored by its blackbody temperature at the time it was recorded.

<b>Axis auto-zoom:</b> when the trail accumulates 3+ points, the plot axes smoothly zoom in to keep all data visible with margin. This is essential for seeing subtle main-sequence evolution (the Sun brightens by only $\\sim$2$\\times$ over 10 Gyr — invisible on the default $10^{-3}$–$10^{6}$ scale). The bounds interpolate at 8% per frame for a smooth animated feel. Resetting the star restores the full default range.`,
  },
  {
    title: 'Photon Flux',
    body: `Luminosity is visualized as a stream of tiny particles emitted radially from the star's surface. Both the <b>emission rate</b> and <b>particle speed</b> scale with luminosity:`,
    equation: String.raw`\dot{N} = 200 + 300\,\log_{10}(L/L_\odot), \qquad v_{\text{photon}} = 0.15 + 0.1\,\log_{10}(L/L_\odot)`,
    after: `Particles are rendered with additive blending at low opacity (0.12), creating a subtle, rain-like radiant emission. They are colored to match the star's current blackbody color. When the star "dies," all photons are immediately cleared.`,
  },
  {
    title: 'Planetary Nebulae & Supernova Remnants',
    body: `When a star dies, an expanding particle shell visualizes the ejected material. The system uses 1,200 particles spawned at the star's surface at the moment of death.

<b>Planetary nebulae</b> ($M < 8\\,M_\\odot$): 720 particles drift outward slowly with drag deceleration (factor 0.992/frame), settling into a permanent shell. Colors are sampled from three emission lines:`,
    after: `<ul>
<li><b>O III</b> (green-blue, 40%): $\\lambda = 495.9, 500.7$ nm — the dominant optical emission.</li>
<li><b>H-alpha</b> (red/pink, 30%): $\\lambda = 656.3$ nm — recombining hydrogen.</li>
<li><b>N II</b> (red-orange, 30%): $\\lambda = 654.8, 658.4$ nm — nitrogen forbidden lines.</li>
</ul>
<b>Supernova remnants</b> ($M \\geq 8\\,M_\\odot$): all 1,200 particles with faster initial velocities (Crab-like blast wave). Colors are hotter: blues, purples, and fiery reds. Both types persist indefinitely and are cleared when the user scrubs backward in time.`,
    refs: [
      { text: 'Wikipedia: Planetary nebula', url: 'https://en.wikipedia.org/wiki/Planetary_nebula' },
      { text: 'Wikipedia: Supernova remnant', url: 'https://en.wikipedia.org/wiki/Supernova_remnant' },
    ],
  },
  {
    title: 'End-of-Life Animation',
    body: `When the MIST track ends, the star's fate is determined by its mass:

<b>$M < 8\\,M_\\odot$</b> → white dwarf: gentle 5-second shrink from AGB radius to $0.04\\times$ scale, with the color transitioning to blue-white ($T_{\\text{eff}} \\sim 10{,}000$–$30{,}000$ K).

<b>$8 \\leq M < 25\\,M_\\odot$</b> → neutron star: 6-second supernova — phase 1 is an intense white flash (brightness 6$\\times$, 2000 photons/frame), phase 2 is rapid collapse to $0.03\\times$ scale, phase 3 is a lingering fade.

<b>$M \\geq 25\\,M_\\odot$</b> → black hole: same supernova flash, then collapse to $0.15\\times$ scale. A post-processing <b>gravitational lensing shader</b> activates, bending background light around the event horizon with a thin photon ring at $1.5\\,r_{\\text{EH}}$.

The particle simulation panel also transitions to a remnant state: C/O lattice for white dwarfs, degenerate neutrons for neutron stars, or an empty box labeled "Singularity" for black holes.`,
  },
  {
    title: 'Camera & Controls',
    body: `The 3D viewport uses <b>TrackballControls</b> (quaternion-based), allowing free camera rotation in all directions without the polar-angle lock inherent to spherical-coordinate orbit controls.

Zoom range is 1.5–600 (in scene units), with the starfield sphere at $r = 900$ ensuring background stars remain visible at maximum zoom-out. The camera far plane is set to 2,000.

<b>Implementation detail:</b> inactive photon and nebula particles are placed at $z = 99{,}999$ (far beyond the camera far plane) rather than at a finite offscreen distance, preventing them from accumulating into a visible artifact when the camera is freely rotated.`,
  },
];

function renderInlineLatex(text) {
  return text.replace(/\$([^$]+)\$/g, (_, latex) => {
    return katex.renderToString(latex, { throwOnError: false });
  });
}

export function initImplementationPanel(container) {
  container.innerHTML = '';

  for (const section of sections) {
    const el = document.createElement('div');
    el.className = 'theory-section';

    const title = document.createElement('h3');
    title.textContent = section.title;
    el.appendChild(title);

    if (section.body) {
      const p = document.createElement('p');
      p.innerHTML = renderInlineLatex(section.body);
      el.appendChild(p);
    }

    if (section.equation) {
      const eq = document.createElement('div');
      eq.className = 'theory-equation';
      katex.render(section.equation, eq, { displayMode: true, throwOnError: false });
      el.appendChild(eq);
    }

    if (section.after) {
      const p = document.createElement('p');
      p.innerHTML = renderInlineLatex(section.after);
      el.appendChild(p);
    }

    if (section.equation2) {
      const eq = document.createElement('div');
      eq.className = 'theory-equation';
      katex.render(section.equation2, eq, { displayMode: true, throwOnError: false });
      el.appendChild(eq);
    }

    if (section.after2) {
      const p = document.createElement('p');
      p.innerHTML = renderInlineLatex(section.after2);
      el.appendChild(p);
    }

    // References
    if (section.refs && section.refs.length > 0) {
      const refsEl = document.createElement('div');
      refsEl.className = 'theory-refs';
      for (const ref of section.refs) {
        const a = document.createElement('a');
        a.href = ref.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = ref.text;
        refsEl.appendChild(a);
      }
      el.appendChild(refsEl);
    }

    container.appendChild(el);
  }
}
