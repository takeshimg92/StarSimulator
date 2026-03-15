import { initRenderer, updateStarAppearance, setSpotsVisible, setSunglasses } from './star/renderer.js';
import { computeProfiles, defaults } from './physics/stellar.js';
import { createSliders } from './ui/sliders.js';
import { initProfilePlot, drawProfiles } from './plots/profiles.js';
import { initEquationDisplay } from './ui/equations.js';
import 'katex/dist/katex.min.css';

// --- State ---
let sliderControls;

function onParametersChanged({ mass, radius, temperature }) {
  const profiles = computeProfiles(mass, radius, temperature);
  updateStarAppearance(temperature, radius, profiles.L);
  drawProfiles(profiles);
}

// --- Init ---
function init() {
  // 3D star viewport
  const viewport = document.getElementById('viewport');
  initRenderer(viewport);

  // Sliders
  const sliderPanel = document.getElementById('sliders');
  sliderControls = createSliders(sliderPanel, onParametersChanged);

  // Profile plot — set canvas resolution to match CSS size
  const profileCanvas = document.getElementById('profile-canvas');
  const profileContainer = document.getElementById('profile-panel');
  profileCanvas.width = profileContainer.clientWidth;
  profileCanvas.height = profileContainer.clientHeight;
  initProfilePlot(profileCanvas);

  // Equation display
  const eqPanel = document.getElementById('equation-panel');
  initEquationDisplay(eqPanel);

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

  // Initial render with default values
  onParametersChanged(sliderControls.getValues());

  // Resize profile canvas on window resize
  window.addEventListener('resize', () => {
    profileCanvas.width = profileContainer.clientWidth;
    profileCanvas.height = profileContainer.clientHeight;
    onParametersChanged(sliderControls.getValues());
  });
}

document.addEventListener('DOMContentLoaded', init);
