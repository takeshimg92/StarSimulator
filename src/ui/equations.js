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
    equation2: String.raw`\frac{dL}{dr} = 4\pi r^2 \rho(r)\,\varepsilon(r) \quad [\text{W/m}]`,
    after2: `Here $\\varepsilon$ [W/kg] is the energy generated per unit mass. For main-sequence stars, this comes from fusing hydrogen into helium — via the <b>PP chain</b> in low-mass stars or the <b>CNO cycle</b> in high-mass stars.`,
    refs: [
      { text: 'Wikipedia: Stefan-Boltzmann law', url: 'https://en.wikipedia.org/wiki/Stefan%E2%80%93Boltzmann_law' },
      { text: 'Wikipedia: Hertzsprung-Russell diagram', url: 'https://en.wikipedia.org/wiki/Hertzsprung%E2%80%93Russell_diagram' },
    ],
  },
  {
    title: 'How Energy Gets Out: Radiation vs. Convection',
    body: `Energy produced in the core must travel outward to the surface. There are two ways this happens:
<ul><li><b>Radiation:</b> photons bounce from atom to atom, slowly diffusing outward. In radiative zones, the temperature gradient is:</li></ul>`,
    equation: String.raw`\frac{dT}{dr} = -\frac{3\,\kappa\,\rho\,L}{64\pi\sigma\,r^2\,T^3} \quad [\text{K/m}]`,
    after: `where $\\kappa$ [m$^2$/kg] is the opacity — how effectively the gas blocks light.
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
    body: `Main-sequence stars fuse hydrogen into helium via two pathways. The <b>proton-proton (PP) chain</b> fuses protons directly, while the <b>CNO cycle</b> uses carbon, nitrogen, and oxygen as catalysts. Their rates have a common structure dictated by the Gamow peak — a $T^{-2/3} \\exp(-\\tau/T^{1/3})$ dependence that captures the interplay between the Maxwell-Boltzmann tail and the quantum tunnelling probability:`,
    equation: String.raw`\varepsilon_{\text{PP}} = C_{\text{PP}}\,\rho\,X^2\,T_9^{-2/3}\,\exp\!\left(\frac{-3.381}{T_9^{1/3}}\right) \quad [\text{W/kg}]`,
    after: ``,
    equation2: String.raw`\varepsilon_{\text{CNO}} = C_{\text{CNO}}\,\rho\,X\,X_{\text{CNO}}\,T_9^{-2/3}\,\exp\!\left(\frac{-15.231}{T_9^{1/3}}\right) \quad [\text{W/kg}]`,
    after2: `where $T_9 = T / 10^9$ K. The much larger Gamow energy in the CNO exponent (15.231 vs. 3.381) reflects the higher Coulomb barrier for carbon and nitrogen nuclei, making CNO extremely temperature-sensitive. Near $T \\approx 15$ MK, local power-law fits give $\\varepsilon_{\\text{PP}} \\propto T^4$ and $\\varepsilon_{\\text{CNO}} \\propto T^{16}$, but these exponents change with temperature — the full Gamow forms above are valid across the entire main-sequence mass range.
<br><br>
The crossover occurs at roughly $T \\approx 17$–$18$ MK. For the Sun ($T_c \\approx 15$ MK), the PP chain produces $\\sim$98% of the energy. Stars more massive than $\\sim 1.3\\,M_\\odot$ have hotter cores where the CNO cycle takes over, concentrating energy generation in a tiny central region and driving <b>convective cores</b>.`,
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
    title: 'Opacity: What Makes Stars Opaque',
    body: `The opacity $\\kappa$ measures how effectively stellar material blocks radiation. Three sources dominate at different temperatures:
<br><br>
<b>Kramers' opacity</b> (free-free + bound-free absorption, $T \\sim 10^5$–$10^7$ K): photons are absorbed by free electrons passing near ions, or by ionizing bound electrons. The rate drops steeply with temperature because hotter photons are harder to absorb:`,
    equation: String.raw`\kappa_K = 3.68 \times 10^{22}\;\rho\,T^{-3.5}\,(1+X)(Z+0.001) \quad [\text{cm}^2/\text{g}]`,
    after: `<b>H$^-$ opacity</b> ($T \\sim 3{,}000$–$12{,}000$ K): a neutral hydrogen atom can loosely bind a second electron, forming an H$^-$ ion. This fragile ion absorbs visible and infrared photons very efficiently. Unlike Kramers' opacity, H$^-$ <i>increases</i> with temperature (more free electrons available to form H$^-$):`,
    equation2: String.raw`\kappa_{H^-} \approx 2.5 \times 10^{-31}\;\frac{Z}{0.02}\;\rho^{1/2}\;T^{9} \quad [\text{cm}^2/\text{g}]`,
    after2: `This steep $T^9$ dependence creates an opacity bump around $10^4$ K that is the primary driver of convective envelopes in solar-type stars.
<br><br>
<b>Electron scattering</b> ($T > 10^7$ K): Thomson scattering off free electrons, independent of temperature: $\\kappa_{\\text{es}} = 0.2(1+X)$ cm$^2$/g. Dominates in hot stellar cores.`,
    refs: [
      { text: 'Wikipedia: Kramers\' opacity law', url: 'https://en.wikipedia.org/wiki/Kramers%27_opacity_law' },
      { text: 'Wikipedia: H-minus opacity', url: 'https://en.wikipedia.org/wiki/H-minus_opacity' },
    ],
  },
  {
    title: 'The Schwarzschild Criterion',
    body: `Whether energy is transported by radiation or convection depends on a single comparison. The <b>radiative temperature gradient</b> — the gradient that would exist if all energy were carried by radiation — is:`,
    equation: String.raw`\nabla_{\text{rad}} \equiv \frac{d\ln T}{d\ln P}\bigg|_{\text{rad}} = \frac{3\,\kappa\,P\,L(r)}{16\pi\,a\,c\,T^4\,G\,m(r)} \quad [\text{dimensionless}]`,
    after: `where $a = 4\\sigma/c$ is the radiation constant. Note that $\\nabla_{\\text{rad}}$ is a <i>logarithmic</i> gradient — the ratio of fractional changes in temperature and pressure — so it is dimensionless. If it exceeds the <b>adiabatic gradient</b> $\\nabla_{\\text{ad}} = 0.4$ (for an ideal gas with $\\gamma = 5/3$), radiation cannot carry the flux — convection takes over:`,
    equation2: String.raw`\nabla_{\text{rad}} > \nabla_{\text{ad}} \implies \text{convective}`,
    after2: `This criterion naturally explains the zone structure of different stars:
<ul>
<li><b>Low-mass stars</b> ($M < 1.3\\,M_\\odot$): H$^-$ opacity creates high $\\kappa$ in the cool envelope → large $\\nabla_{\\text{rad}}$ → convective envelopes.</li>
<li><b>Massive stars</b> ($M > 1.3\\,M_\\odot$): CNO cycle concentrates $L(r)$ in a tiny core → large $\\nabla_{\\text{rad}}$ near center → convective cores.</li>
<li><b>Very low-mass</b> ($M < 0.35\\,M_\\odot$): opacity is high throughout → fully convective.</li>
</ul>
In the Interior tab, the dashed boundary lines on the heatmap are computed from this criterion — they are not placed by hand.`,
    refs: [
      { text: 'Wikipedia: Schwarzschild criterion', url: 'https://en.wikipedia.org/wiki/Schwarzschild_criterion' },
    ],
  },
  {
    title: 'Convective Velocity: Mixing-Length Theory',
    body: `In convective zones, how fast does the gas flow? The standard estimate comes from <b>mixing-length theory (MLT)</b>, which models convection as blobs of gas that travel one "mixing length" $\\ell = \\alpha_{\\text{MLT}} H_P$ before dissolving:`,
    equation: String.raw`v_{\text{conv}} \approx \left(\frac{L_{\text{conv}}}{4\pi r^2 \rho}\right)^{1/3} \left(\alpha_{\text{MLT}}\,H_P\right)^{1/3} \quad [\text{m/s}]`,
    after: `where $H_P = P/(\\rho g)$ [m] is the pressure scale height and $\\alpha_{\\text{MLT}} \\approx 1.6$ is a dimensionless calibration parameter. For the solar convection zone, this gives velocities of $\\sim$100 m/s near the surface — consistent with observed granulation motions.
<br><br>
In the Interior tab, this velocity drives the speed of the animated convection cells in the 2D fluid simulation.`,
    refs: [
      { text: 'Wikipedia: Mixing length theory', url: 'https://en.wikipedia.org/wiki/Mixing_length_theory' },
    ],
  },
  {
    title: 'The Interior Convection Simulation',
    body: `The Interior panel simulates convection in a small box (a few pressure scale heights across) at a user-selected depth. This is a classic <b>Rayleigh-Bénard</b> setup: a layer of fluid heated from below and cooled from above, the simplest system that exhibits thermal convection.
<br><br>
The simulation uses the <b>Boussinesq approximation</b> — a simplification where density variations are neglected everywhere except in the buoyancy term. This is valid when density differences are small compared to the mean density (typically $\\delta\\rho/\\rho < 10\\%$), which holds within a local patch of a few scale heights. The equations are:`,
    equation: String.raw`\frac{\partial \vec{v}}{\partial t} + (\vec{v}\cdot\nabla)\vec{v} = -\frac{\nabla p}{\rho_0} + \nu\nabla^2\vec{v} + \alpha\,g\,\delta T\,\hat{r}`,
    after: `The three terms on the right represent pressure gradients (which enforce incompressibility), viscous friction (which damps small-scale motion), and <b>buoyancy</b> (the engine of convection). A temperature perturbation $\\delta T$ — measured relative to the horizontal average at each height — creates a density difference: hot fluid is lighter and rises, cool fluid is heavier and sinks.
<br><br>
Temperature evolves via advection-diffusion:`,
    equation2: String.raw`\frac{\partial T}{\partial t} + (\vec{v}\cdot\nabla)T = \kappa_{\text{th}}\nabla^2 T`,
    after2: `The first term on the right, advection, is the fluid carrying heat along with it (this is convection). The second term, diffusion, is heat spreading by conduction or radiation — this smooths out temperature perturbations. The competition between these two processes, combined with buoyancy, determines whether convection occurs:
<ul>
<li>If diffusion wins (high $\\kappa_{\\text{th}}$, as in radiative zones where photons carry heat efficiently): perturbations are smoothed out before buoyancy can act → no flow.</li>
<li>If buoyancy wins (high opacity, strong temperature gradient): perturbations grow into organized circulation cells → convection.</li>
</ul>
The single dimensionless parameter capturing this competition is the <b>Rayleigh number</b>:`,
    refs: [
      { text: 'Wikipedia: Boussinesq approximation (buoyancy)', url: 'https://en.wikipedia.org/wiki/Boussinesq_approximation_(buoyancy)' },
      { text: 'Wikipedia: Rayleigh-Bénard convection', url: 'https://en.wikipedia.org/wiki/Rayleigh%E2%80%93B%C3%A9nard_convection' },
    ],
  },
  {
    title: 'The Rayleigh Number and Convective Onset',
    body: `The Rayleigh number measures the ratio of buoyancy-driven forcing to diffusive damping:`,
    equation: String.raw`\text{Ra} = \frac{\alpha\,g\,\Delta T\,H^3}{\nu\,\kappa_{\text{th}}}`,
    after: `where $\\alpha$ is the thermal expansion coefficient, $g$ is gravity, $\\Delta T$ is the temperature drop across the box, $H$ is the box height, $\\nu$ is kinematic viscosity, and $\\kappa_{\\text{th}}$ is thermal diffusivity.
<br><br>
When $\\text{Ra}$ exceeds a critical value $\\text{Ra}_{\\text{crit}} \\approx 1708$ (for rigid boundaries), buoyancy overcomes diffusion and organized convection cells form. Below this threshold, the fluid remains still.
<br><br>
In the simulator, $\\text{Ra}$ is derived from the 1D stellar model at each depth:
<ul>
<li>$\\nabla_{\\text{rad}} / \\nabla_{\\text{ad}} < 1$ (radiative zone): Ra is subcritical → no convection</li>
<li>$\\nabla_{\\text{rad}} / \\nabla_{\\text{ad}} > 1$ (convective zone): Ra grows logarithmically → convection cells develop</li>
</ul>
The mapping uses $\\text{Ra} = 1700 + 3000\\,\\ln(1 + 2(\\nabla_{\\text{rad}}/\\nabla_{\\text{ad}} - 1))$ above the Schwarzschild boundary, giving a gradual onset that matches the physical $v \\propto \\sqrt{\\nabla_{\\text{rad}} - \\nabla_{\\text{ad}}}$ scaling from mixing-length theory.`,
    refs: [
      { text: 'Wikipedia: Rayleigh number', url: 'https://en.wikipedia.org/wiki/Rayleigh_number' },
    ],
  },
  {
    title: 'Quasi-Static Validity',
    body: `The interior structure equations assume time-independent equilibrium. This is justified because three very different timescales govern stellar evolution:
<ul>
<li><b>Dynamical</b> (free-fall): $t_{\\text{dyn}} \\sim 1/\\sqrt{G\\bar{\\rho}} \\sim 30$ minutes for the Sun. The star adjusts its hydrostatic balance this fast.</li>
<li><b>Thermal</b> (Kelvin-Helmholtz): $t_{\\text{KH}} \\sim GM^2/(RL) \\sim 10^7$ years. How long to radiate away gravitational energy.</li>
<li><b>Nuclear</b>: $t_{\\text{nuc}} \\sim Mc^2 X\\eta / L \\sim 10^{10}$ years. How long the fuel lasts.</li>
</ul>
Since $t_{\\text{dyn}} \\ll t_{\\text{KH}} \\ll t_{\\text{nuc}}$, the star is always in near-perfect mechanical and thermal equilibrium during main-sequence evolution. Composition changes (H→He) happen so slowly that the star continuously adjusts — a sequence of quasi-static equilibrium models. This is exactly how professional stellar evolution codes (MESA, for example) work.
<br><br>
The approximation breaks down only during violent events (helium flash, core collapse) or rapid post-MS phases — which are outside the scope of the Interior heatmap view.`,
    refs: [
      { text: 'Padmanabhan — Theoretical Astrophysics Vol. II, Ch. 2', url: 'https://doi.org/10.1017/CBO9780511840159' },
    ],
  },
  {
    title: 'Life on the Main Sequence',
    body: `Stars spend most of their lives on the <b>main sequence</b>, steadily fusing hydrogen into helium. The core burns fuel while the outer envelope keeps its original composition.

As core hydrogen depletes, the <b>mean molecular weight</b> $\\mu$ increases:`,
    equation: String.raw`\mu = \frac{1}{2X + \tfrac{3}{4}Y + \tfrac{1}{2}Z} \quad [\text{in units of}\; m_p]`,
    after: `where $X$, $Y$, $Z$ are the mass fractions of hydrogen, helium, and metals respectively (in astrophysics, elements heavier than helium are all called "metals"). The mean molecular weight $\\mu$ is measured in units of the proton mass $m_p$: it gives the average mass per free particle in the plasma, so the ideal gas law reads $P = \\rho k_B T / (\\mu m_p)$. Higher $\\mu$ means fewer particles per unit mass, so less pressure support — the core contracts slightly and heats up. The star slowly brightens and drifts upward on the H-R diagram:`,
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
