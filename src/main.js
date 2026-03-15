import { initRenderer, updateStarAppearance, setSpotsVisible, setSunglasses } from './star/renderer.js';
import { computeProfiles, defaults } from './physics/stellar.js';
import { createSliders } from './ui/sliders.js';
import { initProfilePlot, resizeProfileCanvas, drawProfiles } from './plots/profiles.js';
import { initEquationDisplay } from './ui/equations.js';
import 'katex/dist/katex.min.css';

let sliderControls;

function onParametersChanged({ mass, radius, temperature }) {
  const profiles = computeProfiles(mass, radius, temperature);
  updateStarAppearance(temperature, radius, profiles.L);
  drawProfiles(profiles);
}

function initTabs() {
  const links = document.querySelectorAll('.nav-link');
  const contents = document.querySelectorAll('.tab-content');

  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = link.dataset.tab;
      links.forEach(l => l.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      link.classList.add('active');
      document.getElementById(`tab-${tabId}`).classList.add('active');

      if (tabId === 'star') {
        resizeProfileCanvas();
        onParametersChanged(sliderControls.getValues());
      }
    });
  });
}

function init() {
  const viewport = document.getElementById('viewport');
  initRenderer(viewport);

  const sliderPanel = document.getElementById('sliders');
  sliderControls = createSliders(sliderPanel, onParametersChanged);

  // Profile plot with HiDPI support
  const profileCanvas = document.getElementById('profile-canvas');
  initProfilePlot(profileCanvas);
  resizeProfileCanvas();

  // Equation display (now in Theory tab)
  const eqPanel = document.getElementById('equation-panel');
  initEquationDisplay(eqPanel);

  // Tabs
  initTabs();

  // Display toggles
  document.getElementById('spots-toggle').addEventListener('change', (e) => {
    setSpotsVisible(e.target.checked);
  });
  document.getElementById('sunglasses-toggle').addEventListener('change', (e) => {
    setSunglasses(e.target.checked);
  });

  // Reset button
  document.getElementById('reset-btn').addEventListener('click', () => {
    sliderControls.setValues(defaults);
  });

  // Initial render
  onParametersChanged(sliderControls.getValues());

  // Resize handling
  window.addEventListener('resize', () => {
    resizeProfileCanvas();
    onParametersChanged(sliderControls.getValues());
  });
}

document.addEventListener('DOMContentLoaded', init);
