import katex from 'katex';

const equations = [
  {
    name: 'Hydrostatic Equilibrium',
    latex: String.raw`\frac{dP}{dr} = -\frac{G\,M(r)\,\rho(r)}{r^2}`,
  },
  {
    name: 'Mass Continuity',
    latex: String.raw`\frac{dM}{dr} = 4\pi r^2 \rho(r)`,
  },
  {
    name: 'Luminosity Gradient',
    latex: String.raw`\frac{dL}{dr} = 4\pi r^2 \rho(r)\,\varepsilon(r)`,
  },
  {
    name: 'Radiative Temperature Gradient',
    latex: String.raw`\frac{dT}{dr} = -\frac{3\kappa\,\rho\,L}{64\pi\sigma\,r^2\,T^3}`,
  },
  {
    name: 'Stefan-Boltzmann Law',
    latex: String.raw`L = 4\pi R^2 \sigma T_{\text{eff}}^4`,
  },
  {
    name: 'Lane-Emden Equation',
    latex: String.raw`\frac{1}{\xi^2}\frac{d}{d\xi}\left(\xi^2 \frac{d\theta}{d\xi}\right) + \theta^n = 0`,
  },
];

let currentIndex = 0;
let intervalId = null;

/**
 * Initialize the equation display panel.
 * @param {HTMLElement} container
 */
export function initEquationDisplay(container) {
  const nameEl = document.createElement('div');
  nameEl.className = 'equation-name';
  const mathEl = document.createElement('div');
  mathEl.className = 'equation-math';

  container.appendChild(nameEl);
  container.appendChild(mathEl);

  function render(index) {
    const eq = equations[index];
    nameEl.textContent = eq.name;
    katex.render(eq.latex, mathEl, { displayMode: true, throwOnError: false });
  }

  render(0);

  intervalId = setInterval(() => {
    currentIndex = (currentIndex + 1) % equations.length;
    render(currentIndex);
  }, 5000);
}

export function stopEquationCycling() {
  if (intervalId) clearInterval(intervalId);
}
