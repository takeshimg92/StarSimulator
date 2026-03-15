import katex from 'katex';

/**
 * Renders the Theory panel: a mini-intro to stellar structure
 * with inline and display LaTeX rendered via KaTeX.
 */

const sections = [
  {
    title: 'Stellar Structure',
    body: `A star is a self-gravitating ball of plasma in which the inward pull of gravity is balanced by outward pressure. Understanding this balance — and the energy transport and generation within — is the core of stellar structure theory.

This simulator models a spherically symmetric, main-sequence star using the <b>polytropic approximation</b>. Here we summarize the key equations.`,
  },
  {
    title: 'Hydrostatic Equilibrium',
    body: `At every shell inside the star, the weight of overlying material must be supported by a pressure gradient:`,
    equation: String.raw`\frac{dP}{dr} = -\frac{G\,M(r)\,\rho(r)}{r^2}`,
    after: `This is the most fundamental equation of stellar structure. If this balance is broken, the star contracts or expands on a dynamical (free-fall) timescale.`,
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
  },
  {
    title: 'Energy Transport',
    body: `Energy flows outward either by radiation or convection. In radiative zones, the temperature gradient is set by the opacity $\\kappa$:`,
    equation: String.raw`\frac{dT}{dr} = -\frac{3\,\kappa\,\rho\,L}{64\pi\sigma\,r^2\,T^3}`,
    after: `When this gradient becomes too steep, convection takes over — this is the <b>Schwarzschild criterion</b>. Low-mass stars have convective envelopes; high-mass stars have convective cores.`,
  },
  {
    title: 'The Polytropic Approximation',
    body: `A polytrope assumes a simple power-law relation between pressure and density:`,
    equation: String.raw`P = K\,\rho^{1 + 1/n}`,
    after: `where $n$ is the <b>polytropic index</b>. For $n = 3$, this approximates a radiative star in which radiation pressure is significant. Substituting into hydrostatic equilibrium yields the <b>Lane-Emden equation</b>:`,
    equation2: String.raw`\frac{1}{\xi^2}\frac{d}{d\xi}\!\left(\xi^2 \frac{d\theta}{d\xi}\right) + \theta^n = 0`,
    after2: `Here $\\xi$ is a dimensionless radius and $\\theta$ a dimensionless density ($\\rho = \\rho_c\\,\\theta^n$). This is the equation solved by the simulator to compute the radial profiles you see in the Star tab.`,
  },
  {
    title: 'Surface Condition',
    body: `At the photosphere, the star radiates as an approximate blackbody. The total luminosity is:`,
    equation: String.raw`L = 4\pi R^2\,\sigma\,T_{\text{eff}}^4`,
    after: `This links the star's radius, effective temperature, and luminosity — the three quantities controlled by the sliders. On the main sequence, all three are determined by the star's mass.`,
  },
  {
    title: 'What is Luminosity?',
    body: `<b>Luminosity</b> is the total power radiated by the star — the energy emitted per second across all wavelengths. It is measured in watts (W), but in astrophysics we often express it in solar luminosities: $L_\\odot \\approx 3.83 \\times 10^{26}$ W.

Luminosity depends on both the star's size and its surface temperature. A star can be very luminous either because it is very hot (blue giants) or very large (red giants), or both. The <b>H-R diagram</b> in the simulator plots luminosity against surface temperature — this is the most important diagram in stellar astrophysics, as a star's position on it reveals its evolutionary state.`,
  },
  {
    title: 'Core Composition & the Maxwell-Boltzmann Distribution',
    body: `The stellar core is a hot, dense plasma of ions and electrons. At temperature $T$, each particle species of mass $m$ has a thermal speed:`,
    equation: String.raw`v_{\text{th}} = \sqrt{\frac{2\,k_B\,T}{m}}`,
    after: `Lighter particles move faster — electrons ($m_e \\approx m_p/1836$) are roughly 43 times faster than protons at the same temperature. The speed distribution follows the <b>Maxwell-Boltzmann distribution</b>; in 2D (as shown in the simulator):`,
    equation2: String.raw`f(v) = \frac{v}{\sigma^2}\,\exp\!\left(-\frac{v^2}{2\sigma^2}\right), \qquad \sigma = \frac{v_{\text{th}}}{\sqrt{2}}`,
    after2: `The particle simulation panel shows protons (H$^+$), helium nuclei ($^4$He), and electrons (e$^-$) at solar composition. The histogram tracks proton speeds against the theoretical curve.`,
  },
  {
    title: 'Stellar Evolution & Time',
    body: `Stars spend most of their lives on the <b>main sequence</b>, steadily fusing hydrogen into helium. The rate of hydrogen depletion is set by the luminosity:`,
    equation: String.raw`\frac{dX}{dt} = -\frac{L}{\eta\,c^2\,M}`,
    after: `where $X$ is the hydrogen mass fraction, $\\eta \\approx 0.007$ is the mass-energy conversion efficiency, and $M$ is the stellar mass. As $X$ decreases, the <b>mean molecular weight</b> $\\mu$ increases:`,
    equation2: String.raw`\mu = \frac{1}{2X + \tfrac{3}{4}Y + \tfrac{1}{2}Z}`,
    after2: `Higher $\\mu$ means higher core temperature at the same pressure, which increases the luminosity ($L \\propto \\mu^4$ from homology relations) and causes the star to expand ($R \\propto \\mu^2$). This is a positive feedback loop: the star brightens and swells as it ages.

When the core hydrogen is nearly exhausted ($X < 0.01$), the star leaves the main sequence. For a solar-mass star, this takes roughly 10 billion years. In the simulator, enabling "Allow passage of time" lets you watch this process unfold — the composition bar, particle species, and sliders all evolve in real time.`,
  },
  {
    title: 'Mass-Energy Equivalence',
    body: `The star also loses a tiny amount of mass as it radiates. By Einstein's relation $E = mc^2$, the mass loss rate is:`,
    equation: String.raw`\frac{dM}{dt} = -\frac{L}{c^2}`,
    after: `For the Sun, this amounts to about $4 \\times 10^9$ kg/s — negligible over a stellar lifetime, but tracked by the simulator for completeness.`,
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

    container.appendChild(sectionEl);
  }
}

export function stopEquationCycling() {
  // No-op now, kept for API compat
}
