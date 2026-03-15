import { initRenderer, updateStarAppearance, setSpotsVisible, setSunglasses, stopPhotons } from './star/renderer.js';
import { computeProfiles, defaults } from './physics/stellar.js';
import { createSliders } from './ui/sliders.js';
import { initHRDiagram, resizeHRCanvas, updateHR, clearHRTrail } from './plots/hrDiagram.js';
import { initParticleSim, resizeParticleCanvas, updateParticleTemp, updateParticleComposition } from './plots/particles.js';
import { initSpeciesPlot, resizeSpeciesCanvas, drawSpecies } from './plots/species.js';
import { initEquationDisplay } from './ui/equations.js';
import { initImplementationPanel } from './ui/implementation.js';
import * as evolution from './physics/evolution.js';
import 'katex/dist/katex.min.css';

let sliderControls;
let ageDisplay, coreTempDisplay, coreDensityDisplay;
let lastFrameTime = 0;
let lastCompositionUpdate = 0;
const COMPOSITION_UPDATE_INTERVAL = 2000;

let suppressHydrogenSync = false;

function onParametersChanged({ mass, radius, temperature, hydrogen }) {
  // Sync hydrogen slider to evolution only if user manually changed it
  // (not when time evolution is driving the slider)
  if (hydrogen !== undefined && !suppressHydrogenSync) {
    evolution.setComposition(hydrogen);
    updateParticleComposition(hydrogen, 1 - hydrogen - 0.02);
  }

  const profiles = computeProfiles(mass, radius, temperature);
  updateStarAppearance(temperature, radius, profiles.L);
  updateParticleTemp(profiles.Tc);
  updateHR(temperature, profiles.L);
  drawSpecies(evolution.getComposition());

  // Update core info display
  if (coreTempDisplay) {
    const TcMK = (profiles.Tc / 1e6).toFixed(1);
    coreTempDisplay.textContent = `Core temperature: ${TcMK} million K`;
  }
  if (coreDensityDisplay) {
    const rho = profiles.rhoc;
    const exp = Math.floor(Math.log10(rho));
    const mantissa = (rho / Math.pow(10, exp)).toFixed(1);
    coreDensityDisplay.innerHTML = `Core density: ${mantissa} &times; 10<sup>${exp}</sup> kg/m&sup3;`;
  }
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

      // Collapse expanded panel when switching to non-expandable tabs
      const rightPanel = document.getElementById('right-panel');
      if (tabId === 'star' || tabId === 'about') {
        rightPanel.classList.remove('expanded');
        document.querySelectorAll('.expand-btn').forEach(b => {
          b.textContent = '\u26F6';
          b.title = 'Expand';
        });
      }

      if (tabId === 'star') {
        resizeHRCanvas();
        resizeParticleCanvas();
        resizeSpeciesCanvas();
        onParametersChanged(sliderControls.getValues());
      }
    });
  });
}

function initExpandButtons() {
  const rightPanel = document.getElementById('right-panel');
  document.querySelectorAll('.expand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const isExpanded = rightPanel.classList.toggle('expanded');
      btn.textContent = isExpanded ? '\u2716' : '\u26F6'; // ✖ or ⛶
      btn.title = isExpanded ? 'Collapse' : 'Expand';
    });
  });
}

function initTimeControls() {
  const timeToggle = document.getElementById('time-toggle');
  const speedSlider = document.getElementById('time-speed');
  const speedValue = document.getElementById('speed-value');
  const speedGroup = document.getElementById('speed-slider-group');

  timeToggle.addEventListener('change', () => {
    if (timeToggle.checked) {
      const mass = sliderControls.getValues().mass;
      evolution.setInitialMass(mass);

      // Adaptive speed: aim for ~30 seconds of wall time to deplete hydrogen.
      // MS lifetime ≈ 10 Gyr × (M/M☉)^(-2.5) roughly.
      // Speed = lifetime / 30s, in Myr/s.
      const lifetimeMyr = 10000 * Math.pow(mass, -2.5);
      const adaptiveSpeed = Math.max(1, Math.min(5000, Math.round(lifetimeMyr / 30)));
      speedSlider.value = adaptiveSpeed;
      speedValue.textContent = `${adaptiveSpeed} Myr/s`;
      evolution.setSpeed(adaptiveSpeed);
    }
    evolution.setRunning(timeToggle.checked);
    sliderControls.setDisabled(timeToggle.checked);
    speedGroup.style.display = timeToggle.checked ? 'block' : 'none';
  });

  speedSlider.addEventListener('input', () => {
    const val = parseFloat(speedSlider.value);
    evolution.setSpeed(val);
    speedValue.textContent = `${val} Myr/s`;
  });
}

function timeEvolutionLoop(now) {
  requestAnimationFrame(timeEvolutionLoop);

  if (!evolution.isRunning()) {
    lastFrameTime = now;
    return;
  }

  const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  const mass = sliderControls.getValues().mass;
  const result = evolution.step(dt, mass);
  if (!result) return;

  const ageGyr = result.age / 1e9;
  ageDisplay.textContent = `Age: ${ageGyr.toFixed(3)} billion years`;

  // Suppress hydrogen sync so the rounded slider value doesn't reset evolution state
  suppressHydrogenSync = true;
  sliderControls.setValues({
    temperature: Math.round(result.temperature / 100) * 100,
    radius: Math.round(result.radius * 10) / 10,
    mass: result.mass,
    hydrogen: Math.round(result.X * 100) / 100,
  });
  suppressHydrogenSync = false;

  // Throttle particle composition updates
  if (now - lastCompositionUpdate > COMPOSITION_UPDATE_INTERVAL) {
    updateParticleComposition(result.X, result.Y);
    lastCompositionUpdate = now;
  }

  drawSpecies(evolution.getComposition());

  if (result.dead) {
    evolution.setRunning(false);
    document.getElementById('time-toggle').checked = false;
    document.getElementById('speed-slider-group').style.display = 'none';
    ageDisplay.textContent = `Age: ${ageGyr.toFixed(3)} billion years — Hydrogen exhausted!`;

    stopPhotons();
    sliderControls.setValues({
      temperature: 25000,
      radius: 0.1,
      mass: result.mass,
    });
  }
}

function init() {
  const viewport = document.getElementById('viewport');
  initRenderer(viewport);

  const sliderPanel = document.getElementById('sliders');
  sliderControls = createSliders(sliderPanel, onParametersChanged);

  // H-R diagram
  const hrCanvas = document.getElementById('hr-canvas');
  initHRDiagram(hrCanvas);
  resizeHRCanvas();

  // Particle simulation
  const particleCanvas = document.getElementById('particle-canvas');
  initParticleSim(particleCanvas);

  // Species plot
  const speciesCanvas = document.getElementById('species-canvas');
  initSpeciesPlot(speciesCanvas);

  // Equation display + implementation
  const eqPanel = document.getElementById('equation-panel');
  initEquationDisplay(eqPanel);
  const implPanel = document.getElementById('implementation-panel');
  initImplementationPanel(implPanel);

  // Tabs + expand buttons
  initTabs();
  initExpandButtons();

  // Time controls
  initTimeControls();
  ageDisplay = document.getElementById('age-display');
  coreTempDisplay = document.getElementById('core-temp');
  coreDensityDisplay = document.getElementById('core-density');

  // Display toggles
  document.getElementById('spots-toggle').addEventListener('change', (e) => {
    setSpotsVisible(e.target.checked);
  });
  document.getElementById('sunglasses-toggle').addEventListener('change', (e) => {
    setSunglasses(e.target.checked);
  });

  // Reset button
  document.getElementById('reset-btn').addEventListener('click', () => {
    evolution.reset();
    clearHRTrail();
    sliderControls.setDisabled(false);
    sliderControls.setValues(defaults);
    ageDisplay.textContent = 'Age: 4.600 billion years';
    document.getElementById('time-toggle').checked = false;
    document.getElementById('speed-slider-group').style.display = 'none';
    drawSpecies(evolution.getComposition());
  });

  // Initial render
  onParametersChanged(sliderControls.getValues());
  drawSpecies(evolution.getComposition());

  // Tooltips
  initTooltips();

  // Start time evolution loop
  lastFrameTime = performance.now();
  requestAnimationFrame(timeEvolutionLoop);

  // Resize handling
  window.addEventListener('resize', () => {
    resizeHRCanvas();
    resizeParticleCanvas();
    resizeSpeciesCanvas();
    onParametersChanged(sliderControls.getValues());
  });
}

function initTooltips() {
  let popup = null;

  document.addEventListener('mouseenter', (e) => {
    const icon = e.target.closest('.help-icon');
    if (!icon) return;
    const text = icon.getAttribute('data-tooltip');
    if (!text) return;

    popup = document.createElement('div');
    popup.className = 'tooltip-popup';
    popup.textContent = text;
    document.body.appendChild(popup);

    const rect = icon.getBoundingClientRect();
    const popupW = 220;

    if (rect.right + popupW + 10 > window.innerWidth) {
      popup.style.left = (rect.left - popupW - 8) + 'px';
    } else {
      popup.style.left = (rect.right + 8) + 'px';
    }
    popup.style.top = rect.top + 'px';
  }, true);

  document.addEventListener('mouseleave', (e) => {
    if (e.target.closest('.help-icon') && popup) {
      popup.remove();
      popup = null;
    }
  }, true);
}

document.addEventListener('DOMContentLoaded', init);
