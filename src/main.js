import { initRenderer, updateStarAppearance, setSunglasses, freezeStar, unfreezeStar, setStarfieldSpeed, setSliceView, setCrossSectionProfiles, getCamera, getStarMesh, getCurrentScale, getCrossSectionGroup, getScaleBarInfo, setAutoZoom, setOnFrameCallback, triggerEndOfLife, getZoneStructure, getRemnantType } from './star/renderer.js';
import { computeProfiles, defaults } from './physics/stellar.js';
import { createSliders } from './ui/sliders.js';
import { initHRDiagram, resizeHRCanvas, updateHR, clearHRTrail } from './plots/hrDiagram.js';
import { initParticleSim, resizeParticleCanvas, updateParticleTemp, updateParticleComposition, setRemnantState } from './plots/particles.js';
import { initSpeciesPlot, resizeSpeciesCanvas, drawSpecies, clearMuHistory } from './plots/species.js';
import { initEquationDisplay } from './ui/equations.js';
import { initImplementationPanel } from './ui/implementation.js';
import * as evolution from './physics/evolution.js';
import { loadTracks } from './physics/mistTracks.js';
import * as THREE from 'three';
import 'katex/dist/katex.min.css';

let sliderControls;
let ageDisplay, coreTempDisplay, coreDensityDisplay, starScaleDisplay;
let lastFrameTime = 0;
let lastCompositionUpdate = 0;
const COMPOSITION_UPDATE_INTERVAL = 2000;
let lastProfiles = null; // cached for hover tooltip

let suppressHydrogenSync = false;

function updateScaleBar() {
  const info = getScaleBarInfo();
  if (!info) return;
  const line = document.getElementById('scale-bar-line');
  const label = document.getElementById('scale-bar-label');
  if (line && label) {
    line.style.width = `${Math.round(info.suggestedWidth)}px`;
    label.textContent = info.suggestedLabel;
  }
}

function updateAgeDisplay() {
  const ageMyr = evolution.getAge() / 1e6;
  const ageGyr = evolution.getAge() / 1e9;
  const phaseName = evolution.getPhaseName();
  const ageStr = ageMyr < 100
    ? `Age: ${ageMyr.toFixed(2)} million years`
    : `Age: ${ageGyr.toFixed(3)} billion years`;
  ageDisplay.innerHTML = ageStr +
    (phaseName ? ` <span style="color:rgba(255,200,100,0.5);font-size:11px">&middot; ${phaseName}</span>` : '');
}

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
  const comp = evolution.getComposition();
  setCrossSectionProfiles(profiles, mass, {
    heCoreM: comp.heCoreM || 0,
    phase: evolution.getPhase(),
    Xc: comp.X_core,
    Yc: comp.Y_core,
  });
  evolution.setLuminosity(profiles.L);
  updateStarAppearance(temperature, radius, profiles.L);
  updateParticleTemp(profiles.Tc);
  updateHR(temperature, profiles.L);

  updateParticleComposition(comp.X_core, comp.Y_core);
  drawSpecies(comp, mu, evolution.getAge() / 1e9);

  // Update scale display
  if (starScaleDisplay) {
    const L_sun = 3.828e26;
    const Lsolar = profiles.L / L_sun;
    const rStr = radius >= 10 ? `${Math.round(radius)}` : `${radius.toFixed(1)}`;
    const lStr = Lsolar >= 100 ? `${Math.round(Lsolar)}` : Lsolar >= 1 ? `${Lsolar.toFixed(1)}` : `${Lsolar.toFixed(3)}`;
    starScaleDisplay.innerHTML = `R = ${rStr} R&#9737; &middot; T = ${Math.round(temperature)} K &middot; L = ${lStr} L&#9737;`;
  }

  // Update scale bar
  updateScaleBar();

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

let timeInitialized = false;
let lastInitMass = null;
let scrubbing = false; // true while user is dragging the time scrubber

// Log-scale speed slider: slider position 0–1000 maps to 0.1–1000 Myr/s
// position = 0 → 0.1 Myr/s, position = 500 → 10 Myr/s, position = 1000 → 1000 Myr/s
const SPEED_LOG_MIN = Math.log10(0.1); // -1
const SPEED_LOG_MAX = Math.log10(1000); // 3
function sliderToSpeed(pos) {
  const frac = pos / 1000;
  return Math.pow(10, SPEED_LOG_MIN + frac * (SPEED_LOG_MAX - SPEED_LOG_MIN));
}
function speedToSlider(speed) {
  const logS = Math.log10(Math.max(0.1, speed));
  return Math.round(((logS - SPEED_LOG_MIN) / (SPEED_LOG_MAX - SPEED_LOG_MIN)) * 1000);
}
function formatSpeed(myrPerSec) {
  if (myrPerSec >= 1000) return `${(myrPerSec / 1000).toFixed(1)} Gyr/s`;
  if (myrPerSec >= 10) return `${Math.round(myrPerSec)} Myr/s`;
  if (myrPerSec >= 1) return `${myrPerSec.toFixed(1)} Myr/s`;
  return `${(myrPerSec * 1000).toFixed(0)} kyr/s`;
}

function initTimeControls() {
  const playBtn = document.getElementById('play-pause-btn');
  const speedSlider = document.getElementById('time-speed');
  const speedValue = document.getElementById('speed-value');
  const scrubber = document.getElementById('time-scrubber');
  const scrubberLabel = document.getElementById('scrubber-label');

  function ensureInitialized() {
    const mass = sliderControls.getValues().mass;
    if (!timeInitialized || mass !== lastInitMass) {
      evolution.initFromTrack(mass);
      lastInitMass = mass;
      timeInitialized = true;

      const lifetimeMyr = 12000 * Math.pow(mass, -2.5);
      const adaptiveSpeed = Math.max(0.1, Math.min(1000, lifetimeMyr / 60));
      speedSlider.value = speedToSlider(adaptiveSpeed);
      speedValue.textContent = formatSpeed(adaptiveSpeed);
      evolution.setSpeed(adaptiveSpeed);
    }
  }

  function updateScrubberPosition() {
    const minAge = evolution.getTrackMinAge();
    const maxAge = evolution.getTrackMaxAge();
    const age = evolution.getAge();
    const frac = Math.max(0, Math.min(1, (age - minAge) / (maxAge - minAge)));
    scrubber.value = Math.round(frac * 1000);

    const ageMyr = age / 1e6;
    const ageGyr = age / 1e9;
    scrubberLabel.textContent = ageMyr < 100
      ? `${ageMyr.toFixed(1)} Myr`
      : `${ageGyr.toFixed(2)} Gyr`;
  }

  function scrubToValue() {
    ensureInitialized();
    const frac = parseFloat(scrubber.value) / 1000;
    const minAge = evolution.getTrackMinAge();
    const maxAge = evolution.getTrackMaxAge();
    const newAge = minAge + frac * (maxAge - minAge);
    evolution.setAge(newAge);

    // Update the star at this age
    const result = evolution.lookupCurrentState();

    if (result && result.dead) {
      // Reached end of track — trigger death
      const mass = result.mass;
      let fate;
      if (mass >= 25) {
        fate = 'Core collapse → supernova → black hole';
        setRemnantState('blackhole');
      } else if (mass >= 8) {
        fate = 'Core collapse → supernova → neutron star';
        setRemnantState('neutronstar');
      } else {
        fate = 'Envelope ejected → planetary nebula → white dwarf';
        setRemnantState('whitedwarf');
      }
      triggerEndOfLife(mass);
      updateAgeDisplay();
      const ageMyr = result.age / 1e6;
      const ageGyr = result.age / 1e9;
      const ageStr = ageMyr < 100
        ? `Age: ${ageMyr.toFixed(2)} million years`
        : `Age: ${ageGyr.toFixed(3)} billion years`;
      ageDisplay.innerHTML = ageStr +
        `<br><span style="font-size:11px;color:rgba(255,200,100,0.5)">${fate}</span>`;
      updateScrubberPosition();
      return;
    }

    // Not dead — unfreeze if coming back from a dead state
    unfreezeStar();
    setRemnantState(null);

    if (result) {
      suppressHydrogenSync = true;
      onParametersChanged({
        mass: result.mass,
        temperature: result.temperature,
        radius: result.radius,
        hydrogen: result.X,
      });
      suppressHydrogenSync = false;
      drawSpecies(evolution.getComposition(), evolution.getMu(), evolution.getAge() / 1e9);
    }
    updateAgeDisplay();
    updateScrubberPosition();
  }

  // Play/pause button
  playBtn.addEventListener('click', () => {
    if (evolution.isRunning()) {
      evolution.setRunning(false);
      setAutoZoom(false);
      playBtn.innerHTML = '&#9654;';
      playBtn.classList.remove('playing');
      setStarfieldSpeed(0);
      sliderControls.setDisabled(false);

    } else {
      ensureInitialized();
      evolution.setRunning(true);
      setAutoZoom(true);
      playBtn.innerHTML = '&#9646;&#9646;';
      playBtn.classList.add('playing');
      sliderControls.setDisabled(true);

      setStarfieldSpeed(0.0001 * evolution.getSpeed());
      updateScrubberPosition();
    }
  });

  // Time scrubber — drag to any point in the star's life
  scrubber.addEventListener('input', () => {
    scrubbing = true;
    // Pause while scrubbing
    if (evolution.isRunning()) {
      evolution.setRunning(false);
      setAutoZoom(false);
      playBtn.innerHTML = '&#9654;';
      playBtn.classList.remove('playing');
      setStarfieldSpeed(0);
      sliderControls.setDisabled(false);

    }
    scrubToValue();
  });

  scrubber.addEventListener('change', () => {
    scrubbing = false;
  });

  // Speed slider (logarithmic)
  speedSlider.addEventListener('input', () => {
    const speed = sliderToSpeed(parseFloat(speedSlider.value));
    evolution.setSpeed(speed);
    speedValue.textContent = formatSpeed(speed);
    setStarfieldSpeed(0.0001 * speed);
  });

  // Slow-motion toggle
  document.getElementById('slowmo-toggle').addEventListener('change', (e) => {
    evolution.setSlowMotion(e.target.checked);
  });

  // Expose updateScrubberPosition for the time loop
  window._updateScrubber = updateScrubberPosition;
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

  updateAgeDisplay();
  const phaseStr = result.phaseName || '';
  const ageMyr = result.age / 1e6;
  const ageGyr = result.age / 1e9;
  const ageStr = ageMyr < 100
    ? `Age: ${ageMyr.toFixed(2)} million years`
    : `Age: ${ageGyr.toFixed(3)} billion years`;

  // Drive the star appearance directly from the MIST result
  // (don't go through the slider — it only has mass now)
  suppressHydrogenSync = true;
  onParametersChanged({
    mass: result.mass,
    temperature: result.temperature,
    radius: result.radius,
    hydrogen: result.X,
  });
  suppressHydrogenSync = false;

  // Throttle particle composition updates
  if (now - lastCompositionUpdate > COMPOSITION_UPDATE_INTERVAL) {
    const comp = evolution.getComposition();
    updateParticleComposition(comp.X_core, comp.Y_core);
    lastCompositionUpdate = now;
  }

  drawSpecies(evolution.getComposition(), evolution.getMu(), evolution.getAge() / 1e9);

  // Sync scrubber position during playback
  if (window._updateScrubber && !scrubbing) window._updateScrubber();

  // Refresh hover tooltip with updated profiles (mouse may be stationary)
  refreshTooltip();

  if (result.dead) {
    evolution.setRunning(false);
    setAutoZoom(false);
    document.getElementById('play-pause-btn').innerHTML = '&#9654;';
    document.getElementById('play-pause-btn').classList.remove('playing');
    setStarfieldSpeed(0);
    sliderControls.setDisabled(false);

    // Fate depends on mass
    const mass = result.mass;
    let fate;
    if (mass < 8) {
      fate = 'Envelope ejected → planetary nebula → white dwarf';
    } else if (mass < 25) {
      fate = 'Core collapse → supernova → neutron star';
    } else {
      fate = 'Core collapse → supernova → black hole';
    }

    ageDisplay.innerHTML = ageStr +
      `<br><span style="font-size:11px;color:rgba(255,200,100,0.5)">${phaseStr} &middot; ${fate}</span>`;

    // Trigger end-of-life visual effect
    triggerEndOfLife(mass);

    // Set particle sim to remnant state
    if (mass >= 25) {
      setRemnantState('blackhole');
    } else if (mass >= 8) {
      setRemnantState('neutronstar');
    } else {
      setRemnantState('whitedwarf');
    }
  }
}

async function init() {
  // Load MIST tracks in background (non-blocking — app works without them)
  loadTracks().then(() => {
    console.log('MIST tracks loaded');
    // Brief flash on the age display to confirm
    if (ageDisplay) {
      const prev = ageDisplay.innerHTML;
      ageDisplay.innerHTML = prev + ' <span style="color:rgba(100,255,100,0.5);font-size:10px">&#x2713; Evolution tracks loaded</span>';
      setTimeout(() => { ageDisplay.innerHTML = prev; }, 3000);
    }
  }).catch(err => {
    console.warn('MIST tracks not available, using analytical model:', err);
  });

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
  starScaleDisplay = document.getElementById('star-scale');
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
    setRemnantState(null);
    setStarfieldSpeed(0);
    sliderControls.setDisabled(false);
    sliderControls.setValues(defaults);
    updateAgeDisplay();
    document.getElementById('play-pause-btn').innerHTML = '&#9654;';
    document.getElementById('play-pause-btn').classList.remove('playing');
    timeInitialized = false;
    lastInitMass = null;
    document.getElementById('time-scrubber').value = 0;
    document.getElementById('scrubber-label').textContent = '';
    drawSpecies(evolution.getComposition(), evolution.getMu(), evolution.getAge() / 1e9);
  });

  // Initial render
  onParametersChanged(sliderControls.getValues());
  updateAgeDisplay();

  // Tooltips
  initTooltips();
  initStarHover(viewport);

  // Update scale bar every frame (responds to manual zoom too)
  setOnFrameCallback(updateScaleBar);

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
  const comp = evolution.getComposition();
  const evoState = {
    heCoreM: comp.heCoreM || 0,
    phase: evolution.getPhase(),
    Xc: comp.X_core,
    Yc: comp.Y_core,
  };
  const zone = getZoneStructure(mass, evoState);

  if (rFrac <= zone.coreR) {
    // Check if core is convective
    if (zone.coreConvective && zone.convInner === 0) return 'Convective core';
    return 'Core (radiative)';
  }

  // Check for shell burning region
  for (const shell of zone.shells || []) {
    if (Math.abs(rFrac - shell.rFrac) < shell.width * 2) {
      return shell.color === 'H' ? 'H-shell burning' : 'He-shell burning';
    }
  }

  // Convective or radiative?
  if (zone.coreConvective) {
    if (rFrac <= zone.convOuter) return 'Convective core';
    return 'Radiative envelope';
  } else {
    if (rFrac >= zone.convInner && rFrac <= zone.convOuter) return 'Convective envelope';
    if (rFrac < zone.convInner) return 'Radiative zone';
    return 'Envelope';
  }
}

function formatTooltip(rFrac, profiles, sliderTemp, mass) {
  // Remnant states: no meaningful interior physics
  const rt = getRemnantType();
  if (rt === 'blackhole') return 'Black hole &middot; singularity<br>T = ? &middot; &rho; = ?';
  if (rt === 'neutronstar') return 'Neutron star &middot; degenerate matter<br>T = ? &middot; &rho; &sim; 10<sup>17</sup> kg/m&sup3;';
  if (rt === 'whitedwarf') return 'White dwarf &middot; electron-degenerate<br>T = ? &middot; &rho; &sim; 10<sup>9</sup> kg/m&sup3;';

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
