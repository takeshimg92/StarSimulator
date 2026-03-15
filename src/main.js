import { initRenderer, updateStarAppearance, setSunglasses, freezeStar, unfreezeStar, setStarfieldSpeed, setSliceView, setCrossSectionProfiles, getCamera, getStarMesh, getCurrentScale, getCrossSectionGroup } from './star/renderer.js';
import { computeProfiles, defaults } from './physics/stellar.js';
import { createSliders } from './ui/sliders.js';
import { initHRDiagram, resizeHRCanvas, updateHR, clearHRTrail } from './plots/hrDiagram.js';
import { initParticleSim, resizeParticleCanvas, updateParticleTemp, updateParticleComposition } from './plots/particles.js';
import { initSpeciesPlot, resizeSpeciesCanvas, drawSpecies, clearMuHistory } from './plots/species.js';
import { initEquationDisplay } from './ui/equations.js';
import { initImplementationPanel } from './ui/implementation.js';
import * as evolution from './physics/evolution.js';
import * as THREE from 'three';
import 'katex/dist/katex.min.css';

let sliderControls;
let ageDisplay, coreTempDisplay, coreDensityDisplay;
let lastFrameTime = 0;
let lastCompositionUpdate = 0;
const COMPOSITION_UPDATE_INTERVAL = 2000;
let lastProfiles = null; // cached for hover tooltip

let suppressHydrogenSync = false;

function onParametersChanged({ mass, radius, temperature, hydrogen }) {
  // Sync hydrogen slider to evolution only if user manually changed it
  // (not when time evolution is driving the slider)
  if (hydrogen !== undefined && !suppressHydrogenSync) {
    evolution.setComposition(hydrogen);
  }

  const mu = evolution.getMu();
  const q = evolution.getCoreRadius();
  const profiles = computeProfiles(mass, radius, temperature, { mu_core: mu.mu_core, mu_env: mu.mu_env, q });
  lastProfiles = profiles;
  setCrossSectionProfiles(profiles, mass);
  evolution.setLuminosity(profiles.L);
  updateStarAppearance(temperature, radius, profiles.L);
  updateParticleTemp(profiles.Tc);
  updateHR(temperature, profiles.L);

  const comp = evolution.getComposition();
  updateParticleComposition(comp.X_core, comp.Y_core);
  drawSpecies(comp, mu, evolution.getAge() / 1e9);

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
      setStarfieldSpeed(0.0001 * adaptiveSpeed);
    } else {
      setStarfieldSpeed(0);
    }
    evolution.setRunning(timeToggle.checked);
    sliderControls.setDisabled(timeToggle.checked);
    speedGroup.style.display = timeToggle.checked ? 'block' : 'none';
  });

  speedSlider.addEventListener('input', () => {
    const val = parseFloat(speedSlider.value);
    evolution.setSpeed(val);
    speedValue.textContent = `${val} Myr/s`;
    // Starfield rotates opposite to star, faster with time speed
    setStarfieldSpeed(0.0001 * val);
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
    const comp = evolution.getComposition();
    updateParticleComposition(comp.X_core, comp.Y_core);
    lastCompositionUpdate = now;
  }

  drawSpecies(evolution.getComposition(), evolution.getMu(), evolution.getAge() / 1e9);

  // Refresh hover tooltip with updated profiles (mouse may be stationary)
  refreshTooltip();

  if (result.dead) {
    evolution.setRunning(false);
    document.getElementById('time-toggle').checked = false;
    document.getElementById('speed-slider-group').style.display = 'none';
    setStarfieldSpeed(0);
    ageDisplay.innerHTML = `Age: ${ageGyr.toFixed(3)} billion years — Hydrogen exhausted!<br><span style="font-size:11px;color:rgba(255,200,100,0.5)">Post-main-sequence evolution not yet implemented</span>`;

    // Freeze the star in its last state
    freezeStar();
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
  document.getElementById('sunglasses-toggle').addEventListener('change', (e) => {
    setSunglasses(e.target.checked);
  });
  document.getElementById('slice-toggle').addEventListener('change', (e) => {
    setSliceView(e.target.checked);
  });

  // Reset button
  document.getElementById('reset-btn').addEventListener('click', () => {
    evolution.reset();
    clearHRTrail();
    clearMuHistory();
    unfreezeStar();
    setStarfieldSpeed(0);
    sliderControls.setDisabled(false);
    sliderControls.setValues(defaults);
    ageDisplay.textContent = 'Age: 4.600 billion years';
    document.getElementById('time-toggle').checked = false;
    document.getElementById('speed-slider-group').style.display = 'none';
    drawSpecies(evolution.getComposition(), evolution.getMu(), evolution.getAge() / 1e9);
  });

  // Initial render
  onParametersChanged(sliderControls.getValues());

  // Tooltips
  initTooltips();
  initStarHover(viewport);

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

// Hover tooltip state — shared so the time loop can refresh it
let hoverRaycaster, hoverMouse, hoverTooltip;
let hoverActive = false;    // true while mouse is over the viewport
let lastMouseClientX = 0, lastMouseClientY = 0;

/**
 * PP chain vs CNO cycle energy generation fraction.
 * PP ∝ T^4, CNO ∝ T^16 → ratio CNO/PP ∝ T^12.
 * Calibrated so PP ≈ 98% at T_c = 15 MK (solar), crossover at ~23 MK.
 */
function computePPvsCNO(T_kelvin) {
  const T6 = T_kelvin / 1e6;
  // ratio CNO/PP: 0.02 at 15 MK, ~1 at 23 MK, dominates above
  const ratio = 0.02 * Math.pow(T6 / 15, 13);
  const pp = 100 / (1 + ratio);
  return { pp, cno: 100 - pp };
}

/**
 * Zone label for a given r/R fraction.
 * Structure depends on mass: low-mass stars have convective envelopes,
 * massive stars (M > 1.3 M☉) have convective cores.
 */
function getZoneLabel(rFrac, mass) {
  const q = evolution.getCoreRadius();
  if (mass >= 1.3) {
    // Massive star: convective core, radiative envelope
    const convOuter = Math.min(0.5, 0.2 + 0.1 * (mass - 1.3));
    if (rFrac <= convOuter) return 'Convective core';
    return 'Radiative envelope';
  }
  // Solar-type: radiative core, radiative mid-zone, convective envelope
  const envConvR = Math.max(0.4, 0.7 - 0.2 * (1.0 - mass));
  if (rFrac <= q) return 'Core (radiative)';
  if (rFrac <= envConvR) return 'Radiative zone';
  return 'Convective envelope';
}

function formatTooltip(rFrac, profiles, sliderTemp, mass) {
  const zone = getZoneLabel(rFrac, mass);

  const idx = Math.min(
    profiles.r.length - 1,
    Math.max(0, Math.round(rFrac * (profiles.r.length - 1)))
  );

  const T = profiles.T[idx];
  const rho = Math.max(profiles.rho[idx], 1e-6); // floor at photosphere-ish

  const TStr = T >= 1e6
    ? `${(T / 1e6).toFixed(1)} MK`
    : T >= 1e4
      ? `${(T / 1e3).toFixed(1)} kK`
      : `${Math.round(T)} K`;

  const rhoExp = Math.floor(Math.log10(Math.max(rho, 1e-30)));
  const rhoMant = (rho / Math.pow(10, rhoExp)).toFixed(1);

  let html = `r/R = ${rFrac.toFixed(2)} &middot; ${zone}<br>T = ${TStr}<br>&rho; = ${rhoMant} &times; 10<sup>${rhoExp}</sup> kg/m&sup3;`;

  // Show PP/CNO fractions in the core where fusion happens
  const q = evolution.getCoreRadius();
  if (rFrac <= q && T > 1e6) {
    const { pp, cno } = computePPvsCNO(T);
    html += `<br>PP: ${pp.toFixed(0)}% &middot; CNO: ${cno.toFixed(0)}%`;
  }

  return html;
}

function refreshTooltip() {
  if (!hoverActive || !lastProfiles) return;

  const cam = getCamera();
  const star = getStarMesh();
  const crossSection = getCrossSectionGroup();
  if (!cam || !star) { hoverTooltip.style.display = 'none'; return; }

  hoverRaycaster.setFromCamera(hoverMouse, cam);
  const scale = getCurrentScale();
  const vals = sliderControls.getValues();
  const sliderTemp = vals.temperature;
  const mass = vals.mass;

  // In slice mode, try the cross-section disc first
  if (crossSection && crossSection.visible) {
    const csHits = hoverRaycaster.intersectObject(crossSection, true);
    if (csHits.length > 0) {
      const rFrac = Math.min(csHits[0].point.length() / scale, 1.0);
      hoverTooltip.innerHTML = formatTooltip(rFrac, lastProfiles, sliderTemp, mass);
      hoverTooltip.style.display = 'block';
      hoverTooltip.style.left = (lastMouseClientX + 16) + 'px';
      hoverTooltip.style.top = (lastMouseClientY - 10) + 'px';
      return;
    }
  }

  const intersects = hoverRaycaster.intersectObject(star);
  if (intersects.length > 0) {
    hoverTooltip.innerHTML = formatTooltip(1.0, lastProfiles, sliderTemp, mass);
    hoverTooltip.style.display = 'block';
    hoverTooltip.style.left = (lastMouseClientX + 16) + 'px';
    hoverTooltip.style.top = (lastMouseClientY - 10) + 'px';
  } else {
    hoverTooltip.style.display = 'none';
  }
}

function initStarHover(viewport) {
  hoverRaycaster = new THREE.Raycaster();
  hoverMouse = new THREE.Vector2();
  hoverTooltip = document.getElementById('star-tooltip');

  viewport.addEventListener('mousemove', (e) => {
    const rect = viewport.getBoundingClientRect();
    hoverMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    hoverMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    lastMouseClientX = e.clientX;
    lastMouseClientY = e.clientY;
    hoverActive = true;
    refreshTooltip();
  });

  viewport.addEventListener('mouseleave', () => {
    hoverActive = false;
    hoverTooltip.style.display = 'none';
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
