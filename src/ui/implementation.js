import katex from 'katex';

const sections = [
  {
    title: 'Overview',
    body: `This simulator computes stellar structure, appearance, and evolution in real time using a combination of analytical models, empirical scaling relations, and GPU-accelerated rendering. This page describes how each component works and what approximations are made.`,
  },
  {
    title: 'Stellar Structure: the Lane-Emden Equation',
    body: `The star's internal profiles (density, temperature, pressure vs. radius) are computed from the <b>Lane-Emden equation</b> for a polytropic star with index $n = 3$ (appropriate for radiative equilibrium):`,
    equation: String.raw`\frac{1}{\xi^2}\frac{d}{d\xi}\!\left(\xi^2\frac{d\theta}{d\xi}\right) + \theta^3 = 0`,
    after: `This ODE is solved numerically using a <b>4th-order Runge-Kutta</b> (RK4) integrator, from the center ($\\xi = 0$, $\\theta = 1$) outward until $\\theta$ first crosses zero at $\\xi_1 \\approx 6.897$.

The singularity at $\\xi = 0$ is handled via L'Hôpital's rule. The solution is computed once and cached, then mapped to physical units using the user's chosen mass $M$ and radius $R$:`,
    equation2: String.raw`\rho(r) = \rho_c\,\theta^3, \quad T(r) = T_c\,\theta, \quad P(r) = P_c\,\theta^4`,
    after2: `where the central values $\\rho_c$, $T_c$, $P_c$ are derived from $M$, $R$, and the ideal gas law with mean molecular weight $\\mu \\approx 0.62$.`,
  },
  {
    title: 'Main-Sequence Scaling Relations',
    body: `When "Lock to Main Sequence" is enabled, the three sliders (mass, radius, temperature) are coupled via empirical power-law fits:`,
    equation: String.raw`R \propto M^{0.57}\;(M < 1),\quad R \propto M^{0.8}\;(M \geq 1)`,
    after: `For luminosity:`,
    equation2: String.raw`L \propto M^{2.3}\;(M < 0.43),\quad L \propto M^{4}\;(0.43 \leq M < 2),\quad L \propto M^{3.5}\;(M \geq 2)`,
    after2: `Temperature is derived from the Stefan-Boltzmann law $L = 4\\pi R^2 \\sigma T_{\\text{eff}}^4$. The inverse mapping (temperature or radius to mass) uses bisection search.

These are the same relations used to draw the main-sequence band on the H-R diagram, ensuring consistency between the sliders and the diagram.`,
  },
  {
    title: 'Time Evolution',
    body: `When "Allow passage of time" is enabled, hydrogen fuses into helium at a rate set by the luminosity:`,
    equation: String.raw`\frac{dX}{dt} = -\frac{L}{\eta\,c^2\,M}, \qquad \eta = 0.007`,
    after: `As the hydrogen fraction $X$ decreases, the mean molecular weight $\\mu = 1/(2X + 0.75Y + 0.5Z)$ increases. This feeds back into the structure via <b>homology scaling relations</b>:`,
    equation2: String.raw`L \propto \mu^4, \qquad R \propto \mu^{2.5}`,
    after2: `The radius exponent (2.5) is chosen slightly steeper than what constant temperature would require ($\\mu^2$), so the star drifts rightward (cooler) on the H-R diagram as it ages — matching observed main-sequence evolution tracks.

Mass loss from radiation ($dM/dt = -L/c^2$) is also tracked, though it is negligible over stellar lifetimes.

<b>Limitation:</b> the model does not include post-main-sequence evolution (red giant branch, helium flash, etc.). When core hydrogen is exhausted ($X < 0.01$), the simulation stops.`,
  },
  {
    title: 'Blackbody Colors',
    body: `Star colors are computed from effective temperature using the <b>Tanner Helland algorithm</b>, an empirical fit to the CIE 1931 2° observer color-matching functions convolved with a Planck spectrum. Valid for 1000–40000 K.

A mild saturation boost is applied for educational visibility: 1.4$\\times$ for cool stars ($T < 6000$ K), 1.15$\\times$ for hot stars. Without this, most stars would appear nearly white — physically correct but pedagogically unhelpful.`,
  },
  {
    title: 'Particle Simulation',
    body: `The core particle box simulates ions and electrons at the core temperature $T_c$. Each particle species has a thermal speed:`,
    equation: String.raw`v_{\text{th}} = \sqrt{\frac{2\,k_B\,T_c}{m}}`,
    after: `Velocities are sampled from the 2D <b>Maxwell-Boltzmann (Rayleigh) distribution</b> using Box-Muller–generated Gaussian components. The histogram shows proton speeds only, since electrons are far too fast to fit on the same scale.

Three species are shown at solar composition: H$^+$ (protons), $^4$He, and e$^-$. Their number fractions are derived from mass fractions via $n_H \\propto X$, $n_{He} \\propto Y/4$, $n_e = n_H + 2n_{He}$.

<b>Visual scaling:</b> the mapping from physical to visual speed uses an exaggerated power law ($v_{\\text{visual}} \\propto v_{\\text{physical}}^{1.6}$) so that temperature changes produce dramatic, visible differences. Electron speeds are capped at 4$\\times$ the proton visual speed to prevent them from appearing stuck to the walls.`,
  },
  {
    title: 'H-R Diagram',
    body: `The Hertzsprung-Russell diagram plots $\\log(L/L_\\odot)$ vs. $\\log(T_{\\text{eff}})$ with temperature increasing to the left (astronomical convention).

The main-sequence band is computed by sampling the same scaling relations used by the sliders across masses 0.1–50 $M_\\odot$, ensuring perfect consistency. The band width is $\\pm 0.3$ dex in $\\log L$.

Up to 500 past positions are stored as a trail. Older points fade in opacity, and each point is colored by its blackbody temperature at the time it was recorded. This lets you see the star's full history: both time evolution and manual parameter changes.`,
  },
  {
    title: '3D Rendering',
    body: `The star is rendered as a 128$\\times$128 sphere with a custom GLSL shader. The rendering pipeline uses Three.js with post-processing:

<b>Render → Bloom → Tint (sunglasses) → Output</b>

The fragment shader computes several layers of surface detail:`,
    after: `<b>1. Limb darkening</b> — quadratic law: $I(\\mu) = 1 - u(1-\\mu) - 0.2(1-\\mu)^2$ where $\\mu = \\cos\\theta$.

<b>2. Granulation</b> — fine-scale Worley (cellular) noise simulating convection cells. Cell edges appear as dark lanes. Animated to slowly churn over time.

<b>3. Sunspots</b> — two overlapping Worley patterns at different scales, with dark umbrae (8% brightness) and brownish penumbrae. Spots drift slowly across the surface.

<b>4. Faculae</b> — bright annular regions surrounding spots, with enhanced brightness near the limb (matching observations).

<b>5. Surface displacement</b> — the vertex shader perturbs vertices along their normals using multi-octave value noise, so the star isn't a perfect sphere.

All surface features are animated via time-dependent noise offsets.`,
  },
  {
    title: 'Photon Flux',
    body: `Luminosity is visualized as a stream of tiny particles emitted radially from the star's surface. Both the <b>emission rate</b> and <b>particle speed</b> scale with luminosity:`,
    equation: String.raw`\dot{N} = 200 + 300\,\log_{10}(L/L_\odot), \qquad v_{\text{photon}} = 0.15 + 0.1\,\log_{10}(L/L_\odot)`,
    after: `Particles are rendered with additive blending at low opacity (0.12), creating a subtle, rain-like radiant emission. They are colored to match the star's current blackbody color. When the star "dies," all photons are immediately cleared.`,
  },
  {
    title: 'Smooth Transitions',
    body: `All visual parameter changes (color, size, bloom) use a <b>spring-damped</b> system rather than instant snapping:`,
    equation: String.raw`\ddot{x} = K\,(x_{\text{target}} - x) - D\,\dot{x}`,
    after: `with stiffness $K = 12$ and damping $D = 7$, giving a near-critically-damped feel. Large parameter changes also trigger a brief <b>wobble</b> (asymmetric scale oscillation with exponential decay), adding a sense of physical inertia to the star.`,
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

    container.appendChild(el);
  }
}
