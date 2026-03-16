import katex from 'katex';

/**
 * Renders the Theory panel: a mini-intro to stellar structure
 * with inline and display LaTeX rendered via KaTeX.
 *
 * Each section can have a `refs` array of { text, url } for references.
 */

const sections = [
  {
    title: 'Stellar Structure',
    body: `A star is a self-gravitating ball of plasma in which the inward pull of gravity is balanced by outward pressure. Understanding this balance — and the energy transport and generation within — is the core of stellar structure theory.

This simulator models a spherically symmetric, main-sequence star using the <b>polytropic approximation</b>. Here we summarize the key equations.`,
    refs: [
      { text: 'Kippenhahn, Weigert & Weiss — Stellar Structure and Evolution', url: 'https://link.springer.com/book/10.1007/978-3-642-30304-3' },
      { text: 'Wikipedia: Stellar structure', url: 'https://en.wikipedia.org/wiki/Stellar_structure' },
    ],
  },
  {
    title: 'Hydrostatic Equilibrium',
    body: `At every shell inside the star, the weight of overlying material must be supported by a pressure gradient:`,
    equation: String.raw`\frac{dP}{dr} = -\frac{G\,M(r)\,\rho(r)}{r^2}`,
    after: `This is the most fundamental equation of stellar structure. If this balance is broken, the star contracts or expands on a dynamical (free-fall) timescale.`,
    refs: [
      { text: 'Wikipedia: Hydrostatic equilibrium', url: 'https://en.wikipedia.org/wiki/Hydrostatic_equilibrium' },
      { text: 'Carroll & Ostlie, An Introduction to Modern Astrophysics, Ch. 10', url: 'https://www.cambridge.org/highereducation/books/an-introduction-to-modern-astrophysics/D0D815DA94EB8C15C4B94E1E2E0141E7' },
    ],
  },
  {
    title: 'Mass Continuity',
    body: `The mass enclosed within radius $r$ grows with the local density:`,
    equation: String.raw`\frac{dM}{dr} = 4\pi r^2 \rho(r)`,
    after: `Together with hydrostatic equilibrium, this constrains the density profile $\\rho(r)$.`,
  },
  {
    title: 'Energy Generation',
    body: `Luminosity increases outward as nuclear reactions in the core release energy at a rate $\\varepsilon$ per unit mass:`,
    equation: String.raw`\frac{dL}{dr} = 4\pi r^2 \rho(r)\,\varepsilon(r)`,
    after: `For main-sequence stars, $\\varepsilon$ comes primarily from the <b>pp chain</b> (low-mass stars) or the <b>CNO cycle</b> (high-mass stars). The transition occurs around $1.3\\,M_\\odot$.`,
    refs: [
      { text: 'Wikipedia: Stellar nucleosynthesis', url: 'https://en.wikipedia.org/wiki/Stellar_nucleosynthesis' },
    ],
  },
  {
    title: 'Energy Transport',
    body: `Energy flows outward either by radiation or convection. In radiative zones, the temperature gradient is set by the opacity $\\kappa$:`,
    equation: String.raw`\frac{dT}{dr} = -\frac{3\,\kappa\,\rho\,L}{64\pi\sigma\,r^2\,T^3}`,
    after: `When this gradient becomes too steep, convection takes over — this is the <b>Schwarzschild criterion</b>. Low-mass stars have convective envelopes; high-mass stars have convective cores.`,
    refs: [
      { text: 'Wikipedia: Schwarzschild criterion', url: 'https://en.wikipedia.org/wiki/Schwarzschild_criterion' },
      { text: 'Hansen, Kawaler & Trimble — Stellar Interiors, Ch. 5', url: 'https://link.springer.com/book/10.1007/978-1-4419-9110-2' },
    ],
  },
  {
    title: 'The Polytropic Approximation',
    body: `A polytrope assumes a simple power-law relation between pressure and density:`,
    equation: String.raw`P = K\,\rho^{1 + 1/n}`,
    after: `where $n$ is the <b>polytropic index</b>. For $n = 3$, this approximates a radiative star in which radiation pressure is significant. Substituting into hydrostatic equilibrium yields the <b>Lane-Emden equation</b>:`,
    equation2: String.raw`\frac{1}{\xi^2}\frac{d}{d\xi}\!\left(\xi^2 \frac{d\theta}{d\xi}\right) + \theta^n = 0`,
    after2: `Here $\\xi$ is a dimensionless radius and $\\theta$ a dimensionless density ($\\rho = \\rho_c\\,\\theta^n$). This is the equation solved by the simulator to compute the radial profiles you see in the Star tab.

<b>Limitation near the surface:</b> the polytrope has $\\theta \\to 0$ (and therefore $T \\to 0$) at the stellar surface. In reality, the photosphere has $T = T_{\\text{eff}}$, and the temperature profile transitions smoothly through the optically thin outer layers. The simulator blends the polytropic temperature toward $T_{\\text{eff}}$ for $r/R > 0.8$ using a smoothstep function, giving a physically reasonable profile while preserving the accurate interior solution.`,
    refs: [
      { text: 'Wikipedia: Lane-Emden equation', url: 'https://en.wikipedia.org/wiki/Lane%E2%80%93Emden_equation' },
      { text: 'Chandrasekhar — An Introduction to the Study of Stellar Structure', url: 'https://press.uchicago.edu/ucp/books/book/chicago/I/bo5966517.html' },
    ],
  },
  {
    title: 'Surface Condition',
    body: `At the photosphere, the star radiates as an approximate blackbody. The total luminosity is:`,
    equation: String.raw`L = 4\pi R^2\,\sigma\,T_{\text{eff}}^4`,
    after: `This links the star's radius, effective temperature, and luminosity — the three quantities controlled by the sliders. On the main sequence, all three are determined by the star's mass.`,
    refs: [
      { text: 'Wikipedia: Stefan-Boltzmann law', url: 'https://en.wikipedia.org/wiki/Stefan%E2%80%93Boltzmann_law' },
    ],
  },
  {
    title: 'What is Luminosity?',
    body: `<b>Luminosity</b> is the total power radiated by the star — the energy emitted per second across all wavelengths. It is measured in watts (W), but in astrophysics we often express it in solar luminosities: $L_\\odot \\approx 3.83 \\times 10^{26}$ W.

Luminosity depends on both the star's size and its surface temperature. A star can be very luminous either because it is very hot (blue giants) or very large (red giants), or both. The <b>H-R diagram</b> in the simulator plots luminosity against surface temperature — this is the most important diagram in stellar astrophysics, as a star's position on it reveals its evolutionary state.`,
    refs: [
      { text: 'Wikipedia: Hertzsprung-Russell diagram', url: 'https://en.wikipedia.org/wiki/Hertzsprung%E2%80%93Russell_diagram' },
    ],
  },
  {
    title: 'Core Composition & the Maxwell-Boltzmann Distribution',
    body: `The stellar core is a hot, dense plasma of ions and electrons. At temperature $T$, each particle species of mass $m$ has a thermal speed:`,
    equation: String.raw`v_{\text{th}} = \sqrt{\frac{2\,k_B\,T}{m}}`,
    after: `Lighter particles move faster — electrons ($m_e \\approx m_p/1836$) are roughly 43 times faster than protons at the same temperature. The speed distribution follows the <b>Maxwell-Boltzmann distribution</b>; in 2D (as shown in the simulator):`,
    equation2: String.raw`f(v) = \frac{v}{\sigma^2}\,\exp\!\left(-\frac{v^2}{2\sigma^2}\right), \qquad \sigma = \frac{v_{\text{th}}}{\sqrt{2}}`,
    after2: `The particle simulation panel shows protons (H$^+$), helium nuclei ($^4$He), and electrons (e$^-$) at solar composition. The histogram tracks proton speeds against the theoretical curve.`,
    refs: [
      { text: 'Wikipedia: Maxwell-Boltzmann distribution', url: 'https://en.wikipedia.org/wiki/Maxwell%E2%80%93Boltzmann_distribution' },
    ],
  },
  {
    title: 'Nuclear Energy Generation: PP Chain vs CNO Cycle',
    body: `Main-sequence stars fuse hydrogen into helium via two pathways. The <b>proton-proton (PP) chain</b> fuses protons directly, while the <b>CNO cycle</b> uses carbon, nitrogen, and oxygen as catalysts. Their rates have very different temperature sensitivities:`,
    equation: String.raw`\varepsilon_{\text{PP}} \propto \rho\,X^2\,T^4, \qquad \varepsilon_{\text{CNO}} \propto \rho\,X\,X_{\text{CNO}}\,T^{16}`,
    after: `The steep $T^{16}$ dependence of the CNO cycle means it dominates at high temperatures, while the gentler $T^4$ of the PP chain dominates at low temperatures. The crossover occurs at roughly $T \\approx 17$ million K.

For the Sun ($T_c \\approx 15$ MK), the PP chain produces $\\sim$98% of the energy. Stars more massive than $\\sim 1.3\\,M_\\odot$ have hotter cores where the CNO cycle dominates.`,
    equation2: String.raw`\frac{\varepsilon_{\text{CNO}}}{\varepsilon_{\text{PP}}} \sim \frac{X_{\text{CNO}}}{X}\left(\frac{T}{T_0}\right)^{12}`,
    after2: `The CNO cycle's steep temperature dependence has an important structural consequence: it concentrates energy generation in a very small central region, creating a steep temperature gradient that drives <b>convective cores</b> in massive stars. In contrast, PP-dominated low-mass stars have radiative cores and develop convection only in their cooler envelopes (see below).`,
    refs: [
      { text: 'Wikipedia: Proton-proton chain', url: 'https://en.wikipedia.org/wiki/Proton%E2%80%93proton_chain' },
      { text: 'Wikipedia: CNO cycle', url: 'https://en.wikipedia.org/wiki/CNO_cycle' },
      { text: 'Adelberger et al. (2011) — Solar fusion cross sections II', url: 'https://doi.org/10.1103/RevModPhys.83.195' },
    ],
  },
  {
    title: 'Convective vs Radiative Zones',
    body: `Energy flows outward from the core by two mechanisms. In <b>radiative zones</b>, photons carry energy by diffusing through the plasma. In <b>convective zones</b>, bulk plasma motions transport energy — hot gas rises, cools, and sinks back down.

The <b>Schwarzschild criterion</b> determines which regime operates: convection sets in when the radiative temperature gradient becomes steeper than the adiabatic gradient. For solar-type stars ($M \\lesssim 1.3\\,M_\\odot$):`,
    after: `<b>Core</b> ($r/R < 0.25$): radiative — energy generation is gentle (PP chain), gradient is stable.

<b>Radiative zone</b> ($0.25 < r/R < 0.7$): photon diffusion transports energy through a hot, relatively transparent plasma.

<b>Convective envelope</b> ($r/R > 0.7$): the plasma becomes cooler and more opaque (partially ionized hydrogen has high opacity), so the radiative gradient steepens beyond the adiabatic limit, triggering convection. The granulation visible on the star's surface is the top of these convection cells.

In the "Show Slice" view, you can see animated convection cells in the outer envelope and the three zone boundaries.`,
    refs: [
      { text: 'Wikipedia: Convection zone', url: 'https://en.wikipedia.org/wiki/Convection_zone' },
      { text: 'Christensen-Dalsgaard (2021) — Solar structure and evolution', url: 'https://doi.org/10.1007/s41116-020-00028-3' },
    ],
  },
  {
    title: 'Two-Zone Stellar Evolution',
    body: `Stars spend most of their lives on the <b>main sequence</b>, fusing hydrogen into helium. Crucially, fusion only happens in the hot, dense <b>core</b> — the outer <b>envelope</b> retains its primordial composition throughout the main sequence.

This simulator models the star as two zones:`,
    after: `<b>Core</b> ($r/R \\leq 0.25$, containing $\\sim$35% of the mass): hydrogen depletes over time at a rate set by the luminosity:`,
    equation: String.raw`\frac{dX_{\text{core}}}{dt} = -\frac{L}{\eta\,c^2\,M_{\text{core}}}`,
    after2: `<b>Envelope</b> ($r/R > 0.25$): no nuclear burning occurs, so $X_{\\text{env}} \\approx 0.70$ remains constant.

As core hydrogen depletes, the core <b>mean molecular weight</b> $\\mu_{\\text{core}}$ increases:`,
    equation2: String.raw`\mu = \frac{1}{2X + \tfrac{3}{4}Y + \tfrac{1}{2}Z}`,
    refs: [
      { text: 'Wikipedia: Main sequence — lifetime', url: 'https://en.wikipedia.org/wiki/Main_sequence#Lifetime' },
      { text: 'Salaris & Cassisi — Evolution of Stars and Stellar Populations', url: 'https://onlinelibrary.wiley.com/doi/book/10.1002/0470033452' },
    ],
  },
  {
    title: 'Luminosity & Radius Evolution',
    body: `The star's luminosity is driven by the core composition, while the radius responds to the mass-weighted effective molecular weight:`,
    equation: String.raw`L \propto \mu_{\text{core}}^{1.1}, \qquad R \propto \mu_{\text{eff}}^{0.85}`,
    after: `where $\\mu_{\\text{eff}} = f_{\\text{core}}\\,\\mu_{\\text{core}} + (1 - f_{\\text{core}})\\,\\mu_{\\text{env}}$ with $f_{\\text{core}} \\approx 0.35$.

The low luminosity exponent ($\\alpha = 1.1$) is physically motivated: only 35% of the stellar mass participates in composition changes, providing natural damping against runaway. The effective temperature follows from Stefan-Boltzmann: $T_{\\text{eff}} \\propto (L/R^2)^{1/4}$.

For a solar-mass star, the net effect is a factor $\\sim$2 increase in luminosity over the full main-sequence lifetime ($\\sim$10 Gyr), with a gentle drift <b>up and slightly left</b> on the H-R diagram — matching observations.

When core hydrogen is nearly exhausted ($X_{\\text{core}} < 0.01$), the star leaves the main sequence. Post-MS evolution is not yet implemented.`,
    refs: [
      { text: 'Wikipedia: Homology (stellar structure)', url: 'https://en.wikipedia.org/wiki/Homology_(physics)#Stellar_structure' },
    ],
  },
  {
    title: 'Mass-Energy Equivalence',
    body: `The star also loses a tiny amount of mass as it radiates. By Einstein's relation $E = mc^2$, the mass loss rate is:`,
    equation: String.raw`\frac{dM}{dt} = -\frac{L}{c^2}`,
    after: `For the Sun, this amounts to about $4 \\times 10^9$ kg/s — negligible over a stellar lifetime, but tracked by the simulator for completeness.`,
    refs: [
      { text: 'Wikipedia: Mass-energy equivalence', url: 'https://en.wikipedia.org/wiki/Mass%E2%80%93energy_equivalence' },
    ],
  },
];

/**
 * Render inline LaTeX ($...$) within a text string.
 */
function renderInlineLatex(text) {
  return text.replace(/\$([^$]+)\$/g, (_, latex) => {
    return katex.renderToString(latex, { throwOnError: false });
  });
}

export function initEquationDisplay(container) {
  container.innerHTML = '';

  for (const section of sections) {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'theory-section';

    const titleEl = document.createElement('h3');
    titleEl.textContent = section.title;
    sectionEl.appendChild(titleEl);

    const bodyEl = document.createElement('p');
    bodyEl.innerHTML = renderInlineLatex(section.body);
    sectionEl.appendChild(bodyEl);

    if (section.equation) {
      const eqEl = document.createElement('div');
      eqEl.className = 'theory-equation';
      katex.render(section.equation, eqEl, { displayMode: true, throwOnError: false });
      sectionEl.appendChild(eqEl);
    }

    if (section.after) {
      const afterEl = document.createElement('p');
      afterEl.innerHTML = renderInlineLatex(section.after);
      sectionEl.appendChild(afterEl);
    }

    if (section.equation2) {
      const eqEl2 = document.createElement('div');
      eqEl2.className = 'theory-equation';
      katex.render(section.equation2, eqEl2, { displayMode: true, throwOnError: false });
      sectionEl.appendChild(eqEl2);
    }

    if (section.after2) {
      const after2El = document.createElement('p');
      after2El.innerHTML = renderInlineLatex(section.after2);
      sectionEl.appendChild(after2El);
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
      sectionEl.appendChild(refsEl);
    }

    container.appendChild(sectionEl);
  }
}

export function stopEquationCycling() {
  // No-op now, kept for API compat
}
