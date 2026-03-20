import katex from 'katex';

/**
 * Renders the Theory panel: a mini-intro to stellar structure
 * with inline and display LaTeX rendered via KaTeX.
 *
 * Each section can have a `refs` array of { text, url } for references.
 */

const sections = [
  {
    title: 'A Quick Glossary',
    body: `Before diving in, here are a few terms that come up frequently:
<ul>
<li><b>Luminosity ($L$)</b> — the total power (energy per second) radiated by a star, measured in watts. We often express it relative to the Sun: $L_\\odot \\approx 3.83 \\times 10^{26}$ W.</li>
<li><b>Effective temperature ($T_{\\text{eff}}$)</b> — the surface temperature that a perfect blackbody of the same size would need to produce the star's luminosity.</li>
<li><b>Radius ($R$)</b> — the star's photospheric radius, where light escapes. Measured in solar radii: $R_\\odot \\approx 6.96 \\times 10^8$ m.</li>
<li><b>Metallicity ($Z$)</b> — the fraction of the star's mass in elements heavier than helium ("metals" in astronomy — everything from carbon to iron and beyond).</li>
<li><b>Main sequence</b> — the long, stable phase of a star's life when it fuses hydrogen into helium in its core. Our Sun is currently on the main sequence.</li>
<li><b>H-R diagram</b> — a plot of luminosity vs. surface temperature (temperature increasing to the left). A star's position on this diagram reveals its evolutionary state.</li>
</ul>`,
  },
  {
    title: 'What Holds a Star Together?',
    body: `A star is a giant ball of hot gas (mostly hydrogen and helium) held together by its own gravity. Every layer of the star is being pulled inward by the weight of everything above it. So why doesn't it collapse?

The answer is <b>pressure</b>. The gas is so hot that its outward pressure exactly balances the inward pull of gravity at every point. This balance is called <b>hydrostatic equilibrium</b>, and it is the most fundamental equation of stellar structure:`,
    equation: String.raw`\frac{dP}{dr} = -\frac{G\,M(r)\,\rho(r)}{r^2}`,
    after: `This says: the deeper you go, the higher the pressure must be to support the increasing weight above. If this balance is ever broken, the star contracts or expands — sometimes catastrophically.`,
    refs: [
      { text: 'Wikipedia: Hydrostatic equilibrium', url: 'https://en.wikipedia.org/wiki/Hydrostatic_equilibrium' },
    ],
  },
  {
    title: 'How Mass is Distributed',
    body: `The mass enclosed within radius $r$ grows with the local density:`,
    equation: String.raw`\frac{dM}{dr} = 4\pi r^2 \rho(r)`,
    after: `Together with hydrostatic equilibrium, this constrains how dense the star is at each depth. Most of the mass is concentrated in the core.`,
  },
  {
    title: 'Luminosity and the Surface',
    body: `A star shines because nuclear reactions in its core release energy. This energy works its way outward and is eventually radiated from the surface. The total power output is the <b>luminosity</b>, connected to the star's size and surface temperature by the Stefan-Boltzmann law:`,
    equation: String.raw`L = 4\pi R^2\,\sigma\,T_{\text{eff}}^4`,
    after: `A star can be very luminous either because it is very hot (blue giants), very large (red giants), or both. The <b>H-R diagram</b> in the simulator plots luminosity against surface temperature — this is the single most important diagram in stellar astrophysics, as a star's position on it reveals its evolutionary state.

Luminosity increases outward from the core as nuclear reactions add energy:`,
    equation2: String.raw`\frac{dL}{dr} = 4\pi r^2 \rho(r)\,\varepsilon(r)`,
    after2: `Here $\\varepsilon$ is the energy generated per unit mass. For main-sequence stars, this comes from fusing hydrogen into helium — via the <b>PP chain</b> in low-mass stars or the <b>CNO cycle</b> in high-mass stars.`,
    refs: [
      { text: 'Wikipedia: Stefan-Boltzmann law', url: 'https://en.wikipedia.org/wiki/Stefan%E2%80%93Boltzmann_law' },
      { text: 'Wikipedia: Hertzsprung-Russell diagram', url: 'https://en.wikipedia.org/wiki/Hertzsprung%E2%80%93Russell_diagram' },
    ],
  },
  {
    title: 'How Energy Gets Out: Radiation vs. Convection',
    body: `Energy produced in the core must travel outward to the surface. There are two ways this happens:
<ul><li><b>Radiation:</b> photons bounce from atom to atom, slowly diffusing outward. In radiative zones, the temperature gradient is:</li></ul>`,
    equation: String.raw`\frac{dT}{dr} = -\frac{3\,\kappa\,\rho\,L}{64\pi\sigma\,r^2\,T^3}`,
    after: `where $\\kappa$ is the opacity — how effectively the gas blocks light.
<ul><li><b>Convection:</b> when the temperature gradient becomes too steep (the <b>Schwarzschild criterion</b>), radiation can't carry the energy fast enough. Instead, hot gas rises and cool gas sinks — like a boiling pot of water. The granulation pattern visible on the star's surface is the top of these convection cells.</li></ul>

For Sun-like stars: the core is radiative, and the outer ~30% is convective. For massive stars ($M > 1.3\\,M_\\odot$), it's the reverse: the core is convective and the envelope is radiative.
<br><br>
In the simulator, you can toggle the slice view to show the convective and radiative zones. The temperature gradient is much steeper in the convective zone, which is why it looks so different from the smooth radiative interior.`,
    refs: [
      { text: 'Wikipedia: Convection zone', url: 'https://en.wikipedia.org/wiki/Convection_zone' },
      { text: 'Wikipedia: Schwarzschild criterion', url: 'https://en.wikipedia.org/wiki/Schwarzschild_criterion' },
    ],
  },
  {
    title: 'The Polytropic Approximation',
    body: `To compute the internal structure without solving the full set of equations, we use a simplification: assume pressure and density follow a power law:`,
    equation: String.raw`P = K\,\rho^{1 + 1/n}`,
    after: `where $n$ is the <b>polytropic index</b>. For $n = 3$, this approximates a star where radiation pressure is significant. Substituting into hydrostatic equilibrium gives the <b>Lane-Emden equation</b>:`,
    equation2: String.raw`\frac{1}{\xi^2}\frac{d}{d\xi}\!\left(\xi^2 \frac{d\theta}{d\xi}\right) + \theta^n = 0`,
    after2: `Here $\\xi$ is a dimensionless radius and $\\theta$ a dimensionless density ($\\rho = \\rho_c\\,\\theta^n$). This is the equation solved by the simulator to compute the density and temperature profiles shown in the slice view.`,
    refs: [
      { text: 'Wikipedia: Lane-Emden equation', url: 'https://en.wikipedia.org/wiki/Lane%E2%80%93Emden_equation' },
      { text: 'Chandrasekhar — An Introduction to the Study of Stellar Structure', url: 'https://press.uchicago.edu/ucp/books/book/chicago/I/bo5966517.html' },
    ],
  },
  {
    title: 'Particles in the Core',
    body: `The stellar core is a hot, dense soup of ions and electrons. At temperature $T$, each particle of mass $m$ moves with a typical thermal speed:`,
    equation: String.raw`v_{\text{th}} = \sqrt{\frac{2\,k_B\,T}{m}}`,
    after: `Lighter particles move faster — at the same temperature, electrons are roughly 43 times faster than protons. The speeds follow the <b>Maxwell-Boltzmann distribution</b>; in 2D (as shown in the simulator):`,
    equation2: String.raw`f(v) = \frac{v}{\sigma^2}\,\exp\!\left(-\frac{v^2}{2\sigma^2}\right), \qquad \sigma = \frac{v_{\text{th}}}{\sqrt{2}}`,
    after2: `The particle simulation panel shows protons (H$^+$) and helium nuclei ($^4$He) at the current core composition. As the star evolves, you can see helium accumulate as hydrogen is consumed. The histogram tracks proton speeds against the theoretical curve.`,
    refs: [
      { text: 'Wikipedia: Maxwell-Boltzmann distribution', url: 'https://en.wikipedia.org/wiki/Maxwell%E2%80%93Boltzmann_distribution' },
    ],
  },
  {
    title: 'Nuclear Fusion: PP Chain vs. CNO Cycle',
    body: `Main-sequence stars fuse hydrogen into helium via two pathways. The <b>proton-proton (PP) chain</b> fuses protons directly, while the <b>CNO cycle</b> uses carbon, nitrogen, and oxygen as catalysts. Their rates depend very differently on temperature:`,
    equation: String.raw`\varepsilon_{\text{PP}} \propto \rho\,X^2\,T^4, \qquad \varepsilon_{\text{CNO}} \propto \rho\,X\,X_{\text{CNO}}\,T^{16}`,
    after: `where $X$ is the hydrogen mass fraction and $X_{CNO}$ is the mass fraction of CNO elements. The CNO cycle's steep $T^{16}$ dependence means it completely dominates at high temperatures, while the gentler PP chain wins at lower temperatures. The crossover occurs at roughly $T \\approx 17$ million K.

For the Sun ($T_c \\approx 15$ MK), the PP chain produces $\\sim$98% of the energy. Stars more massive than $\\sim 1.3\\,M_\\odot$ have hotter cores where the CNO cycle takes over.

The CNO cycle's extreme temperature sensitivity concentrates energy generation in a tiny central region, creating a steep temperature gradient that drives <b>convective cores</b> in massive stars.`,
    refs: [
      { text: 'Wikipedia: Proton-proton chain', url: 'https://en.wikipedia.org/wiki/Proton%E2%80%93proton_chain' },
      { text: 'Wikipedia: CNO cycle', url: 'https://en.wikipedia.org/wiki/CNO_cycle' },
    ],
  },
  {
    title: 'The Gamow Peak: Why Fusion Happens at All',
    body: `Here's a puzzle: two protons need $\\sim$1 MeV of energy to overcome their electrical repulsion (the <b>Coulomb barrier</b>), but the average particle energy at 15 million K is only $\\sim$1 keV — a thousand times too small. Yet fusion happens. The secret is <b>quantum tunneling</b>.

The probability of tunneling through the barrier falls off exponentially:`,
    equation: String.raw`P_{\text{tunnel}} \propto \exp\!\left(-\sqrt{\frac{E_G}{E}}\right), \qquad E_G = 2\mu c^2\,(\pi\,\alpha\,Z_1\,Z_2)^2`,
    after: `where $E_G$ is the <b>Gamow energy</b> ($\\sim$490 keV for proton-proton fusion), $\\alpha \\approx 1/137$ is the fine-structure constant, and $Z_1, Z_2$ are the nuclear charges.

The fusion rate depends on two competing factors: the Maxwell-Boltzmann distribution (more particles at lower energies) and tunneling probability (higher at higher energies). Their product peaks at the <b>Gamow peak</b>:`,
    equation2: String.raw`E_0 = \left(\frac{E_G\,(k_B T)^2}{4}\right)^{1/3}`,
    after2: `For the Sun, $E_0 \\approx 6$ keV — well above the average thermal energy but far below the Coulomb barrier. Only particles in a narrow energy window around this peak contribute to fusion. This is why stellar fusion rates are so sensitive to temperature: even a small increase dramatically widens the window.`,
    refs: [
      { text: 'Wikipedia: Gamow peak', url: 'https://en.wikipedia.org/wiki/Gamow_peak' },
      { text: 'Clayton — Principles of Stellar Evolution and Nucleosynthesis, Ch. 4', url: 'https://press.uchicago.edu/ucp/books/book/chicago/P/bo5961494.html' },
    ],
  },
  {
    title: 'Ionization: the Saha Equation',
    body: `In the hot interior of a star, atoms are stripped of their electrons by collisions. How ionized is the gas at a given temperature and density? The answer is the <b>Saha equation</b>:`,
    equation: String.raw`\frac{n_{i+1}\,n_e}{n_i} = \frac{2}{\Lambda^3}\,\frac{g_{i+1}}{g_i}\,\exp\!\left(-\frac{\chi_i}{k_B T}\right)`,
    after: `Here $n_i$ and $n_{i+1}$ are the number densities in consecutive ionization states, $\\chi_i$ is the energy needed to remove the next electron, and $\\Lambda$ is a quantum-mechanical length scale.

For hydrogen ($\\chi = 13.6$ eV), the core is fully ionized. But in the outer envelope ($T \\sim 5000$–$10{,}000$ K), hydrogen transitions from neutral to ionized — and this has major consequences:`,
    after2: `<ul>
<li><b>Opacity:</b> partially ionized hydrogen absorbs radiation very effectively (via H$^-$ ions), making it hard for photons to escape.</li>
<li><b>Convection:</b> this high opacity steepens the temperature gradient, triggering convection — which is why Sun-like stars have boiling outer layers.</li>
</ul>
The ionization energy of hydrogen ultimately determines why stars below $\\sim$1.3 $M_\\odot$ have convective envelopes and more massive stars do not.`,
    refs: [
      { text: 'Wikipedia: Saha ionization equation', url: 'https://en.wikipedia.org/wiki/Saha_ionization_equation' },
    ],
  },
  {
    title: 'Life on the Main Sequence',
    body: `Stars spend most of their lives on the <b>main sequence</b>, steadily fusing hydrogen into helium. The core burns fuel while the outer envelope keeps its original composition.

As core hydrogen depletes, the <b>mean molecular weight</b> $\\mu$ increases:`,
    equation: String.raw`\mu = \frac{1}{2X + \tfrac{3}{4}Y + \tfrac{1}{2}Z}`,
    after: `where $X$ is the hydrogen mass fraction, $Y$ is the helium mass fraction, and $Z$ is the 'metal' mass fraction (in astrophysics, elements heavier than helium are all called metals). Higher $\\mu$ means the gas needs less pressure support per particle, so the core contracts slightly and heats up. The star slowly brightens and drifts upward on the H-R diagram:`,
    equation2: String.raw`L \propto \mu_{\text{core}}^{1.1}, \qquad R \propto \mu_{\text{eff}}^{0.85}`,
    after2: `For a solar-mass star, this means a factor of $\\sim$2 increase in luminosity over $\\sim$10 billion years. Our Sun is about halfway through this journey.

The star also loses a tiny amount of mass as it radiates ($dM/dt = -L/c^2$ via Einstein's $E = mc^2$), but this is negligible over a stellar lifetime.`,
    refs: [
      { text: 'Wikipedia: Main sequence — lifetime', url: 'https://en.wikipedia.org/wiki/Main_sequence#Lifetime' },
    ],
  },
  {
    title: 'After the Main Sequence: the Subgiant Phase',
    body: `When the core hydrogen is exhausted, fusion stops in the center. The inert helium core contracts under gravity, releasing gravitational energy and heating the surrounding layers.

Hydrogen fusion continues in a thin <b>shell</b> around the core. The shell actually burns hotter than the original core, because it is compressed against the contracting helium core.`,
    after: `The structure now follows the <b>mirror principle</b>: when the core contracts, the envelope expands. The star moves rightward on the H-R diagram as $T_{\\text{eff}}$ drops while luminosity stays roughly constant. This is the <b>subgiant branch</b>.`,
    refs: [
      { text: 'Wikipedia: Subgiant', url: 'https://en.wikipedia.org/wiki/Subgiant' },
    ],
  },
  {
    title: 'The Red Giant Branch',
    body: `As the helium core grows and contracts further, the envelope expands dramatically. The star ascends the <b>red giant branch</b>: luminosity increases by a factor of $\\sim$1000–3000 while the surface cools to $\\sim$4000 K. The radius swells to $\\sim$100–200 $R_\\odot$.`,
    equation: String.raw`L_{\text{RGB}} \approx 2300\,L_\odot\,\left(\frac{M_c}{0.45\,M_\odot}\right)^6`,
    after: `This steep dependence on core mass $M_c$ is remarkable: the luminosity depends almost entirely on the helium core mass, not on the total stellar mass.

The deep convective envelope reaches inward during <b>first dredge-up</b>, mixing processed material to the surface — an observationally confirmed prediction.`,
    refs: [
      { text: 'Wikipedia: Red giant branch', url: 'https://en.wikipedia.org/wiki/Red-giant_branch' },
    ],
  },
  {
    title: 'Degeneracy & the Helium Flash',
    body: `As the helium core contracts without fusion, its density reaches $\\sim 10^6$ g/cm$^3$. At this point, a quantum effect takes over: the <b>Pauli exclusion principle</b> prevents electrons from being squeezed any closer, providing a new source of pressure called <b>degeneracy pressure</b>:`,
    equation: String.raw`P_{\text{deg}} = K_1\left(\frac{\rho}{\mu_e}\right)^{5/3}`,
    after: `Unlike thermal pressure, degeneracy pressure doesn't depend on temperature. This means the core can heat up without expanding — there is no safety valve. When the core reaches $T_c \\approx 10^8$ K, helium fusion ignites via the <b>triple-alpha process</b>:`,
    equation2: String.raw`3\,{}^4\text{He} \;\longrightarrow\; {}^{12}\text{C} + \gamma \qquad (Q = 7.275\;\text{MeV})`,
    after2: `Because the degenerate core can't expand to cool itself, the reaction runs away — the <b>helium flash</b>. In seconds, the core luminosity spikes to $\\sim 10^{11}\\,L_\\odot$ (rivaling an entire galaxy). But all the energy goes into lifting the degeneracy; the surface luminosity actually <i>drops</i>.

After the flash, the star settles into stable helium burning on the <b>horizontal branch</b>.`,
    refs: [
      { text: 'Wikipedia: Helium flash', url: 'https://en.wikipedia.org/wiki/Helium_flash' },
      { text: 'Wikipedia: Triple-alpha process', url: 'https://en.wikipedia.org/wiki/Triple-alpha_process' },
    ],
  },
  {
    title: 'The Sun\'s Future',
    body: `Our Sun is currently about 4.6 billion years into its main-sequence lifetime. Here's what lies ahead:

<b>Now → 10 Gyr:</b> remaining main-sequence life. Luminosity increases by another factor of $\\sim$2, eventually making Earth too hot for liquid water ($\\sim$1–2 Gyr from now).

<b>10 → 11 Gyr:</b> subgiant phase. Core hydrogen exhausted, envelope begins expanding.

<b>11 → 12 Gyr:</b> red giant branch. Radius grows to $\\sim$150 $R_\\odot$ (engulfing Mercury and Venus; Earth's fate is uncertain). Luminosity peaks at $\\sim$2300 $L_\\odot$.

<b>12 Gyr:</b> helium flash. Core helium ignites; star contracts to $\\sim$10 $R_\\odot$ on the horizontal branch.

<b>12 → 12.1 Gyr:</b> core helium burning (red clump). Stable but brief.

<b>12.1+ Gyr:</b> asymptotic giant branch, thermal pulses, planetary nebula ejection, and finally a $\\sim$0.55 $M_\\odot$ white dwarf — the Sun's final state for the rest of eternity.`,
    refs: [
      { text: 'Schröder & Connon Smith (2008) — Distant future of the Sun and Earth revisited', url: 'https://doi.org/10.1111/j.1365-2966.2008.12957.x' },
      { text: 'Wikipedia: Future of the Sun', url: 'https://en.wikipedia.org/wiki/Sun#After_core_hydrogen_exhaustion' },
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
