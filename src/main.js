import { initRenderer, updateStarAppearance, setSunglasses, unfreezeStar, setStarfieldSpeed, setSliceView, setCrossSectionProfiles, getCamera, getStarMesh, getCurrentScale, getCrossSectionGroup, getScaleBarInfo, setOnFrameCallback, triggerEndOfLife, getZoneStructure, getRemnantType, setSpotActivity, setGranulationScale, setLightMode, setSchwarzschildZones } from './star/renderer.js';
import { computeProfiles } from './physics/stellar.js';
import { constants } from './physics/constants.js';
import { createSliders } from './ui/sliders.js';
import { initHRDiagram, resizeHRCanvas, updateHR } from './plots/hrDiagram.js';
import { initParticleSim, resizeParticleCanvas, updateParticleTemp, updateParticleComposition, setRemnantState } from './plots/particles.js';
import { initSpeciesPlot, resizeSpeciesCanvas, drawSpecies } from './plots/species.js';
import { initEquationDisplay } from './ui/equations.js';
import { initImplementationPanel } from './ui/implementation.js';
import * as evolution from './physics/evolution.js';
import { loadTracks } from './physics/mistTracks.js';
import { computeInteriorModel } from './physics/interiorModel.js';
import { CartesianSim } from './fluid/cartesianSim.js';
import { PatchRenderer } from './interior/patchRenderer.js';
import * as THREE from 'three';
import 'katex/dist/katex.min.css';

let sliderControls;
let ageDisplay, coreTempDisplay, coreDensityDisplay, starScaleDisplay;
let lastFrameTime = 0;
let lastCompositionUpdate = 0;
const COMPOSITION_UPDATE_INTERVAL = 2000;
let lastProfiles = null; // cached for hover tooltip

// Interior cross-section state
let patchRenderer = null;       // desktop floating panel
let patchRendererMobile = null;  // mobile carousel panel
let patchSim = null;
let interiorModel = null;
let interiorActive = false;
let lastInteriorMass = null;
let currentDepthFrac = 0.85;

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
  if (!timeInitialized) {
    if (ageDisplay) ageDisplay.innerHTML = '';
    return;
  }
  const ageMyr = evolution.getAge() / 1e6;
  const ageGyr = evolution.getAge() / 1e9;
  const phaseName = evolution.getPhaseName();
  const ageStr = ageMyr < 100
    ? `Age: ${ageMyr.toFixed(2)} million years`
    : `Age: ${ageGyr.toFixed(3)} billion years`;
  ageDisplay.innerHTML = ageStr +
    (phaseName ? ` <span style="color:rgba(255,200,100,0.5);font-size:11px">&middot; ${phaseName}</span>` : '');
  syncPanelBottom();
}

const _isMobile = () => window.innerWidth < 768;
let _mobileDrawerOpen = false;

// Keep right panel positioned above playback controls on mobile
function syncPanelBottom() {
  if (!_isMobile()) return;
  const playback = document.getElementById('playback-controls');
  const panel = document.getElementById('right-panel');
  if (playback && panel) {
    panel.style.bottom = playback.offsetHeight + 'px';
  }
}

function onParametersChanged({ mass, radius, temperature, hydrogen }, { wobble = true } = {}) {
  // Sync hydrogen slider to evolution only if user manually changed it
  // (not when time evolution is driving the slider)
  if (hydrogen !== undefined && !suppressHydrogenSync) {
    evolution.setComposition(hydrogen);
  }

  // Mobile fast path: only update star color + size while drawer is open
  if (_isMobile() && _mobileDrawerOpen) {
    const { sigma, R_sun } = constants;
    const L = 4 * Math.PI * (radius * R_sun) ** 2 * sigma * temperature ** 4;
    updateStarAppearance(temperature, radius, L, { wobble: false });
    return;
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

  // Compute Schwarzschild zones for the 3D slice view
  try {
    const im = computeInteriorModel(mass);
    setSchwarzschildZones({
      zoneBoundaries: im.zoneBoundaries,
      coreConvective: im.coreConvective,
    });
  } catch (e) {
    // Don't let interior model errors break the main render loop
    console.warn('Interior model error for mass=' + mass, e);
  }

  updateStarAppearance(temperature, radius, profiles.L, { wobble });

  updateParticleTemp(profiles.Tc);
  updateHR(temperature, profiles.L);

  // Spot activity model: f(mass, age)
  // Mass: fully convective M dwarfs are most active, massive stars with
  // radiative envelopes have minimal spots. Solar-type stars have very
  // modest spot coverage (<1% of the surface in reality).
  let massFactor;
  if (mass < 0.35) {
    massFactor = 0.85;                                    // fully convective — very active
  } else if (mass < 0.8) {
    massFactor = 0.25 + 0.6 * (0.8 - mass) / 0.45;      // K dwarfs — moderate
  } else if (mass <= 1.3) {
    massFactor = 0.12 + 0.13 * (1.3 - mass) / 0.5;      // solar-type — subtle
  } else {
    massFactor = Math.max(0, 0.12 * (1 - (mass - 1.3))); // drops to 0 for hot stars
  }
  // Age: young stars are more active (magnetic braking spins them down)
  const ageFrac = evolution.getAge() / Math.max(1, evolution.getTrackMaxAge());
  const ageFactor = Math.max(0.15, 1.0 - 0.6 * ageFrac);
  const density = Math.max(0, Math.min(1, massFactor * ageFactor));
  // Spot size: larger relative coverage for low-mass stars, tiny for solar-type
  const sizeFactor = mass < 0.5 ? 0.8 : mass < 1.3 ? 0.2 : 0.1;
  setSpotActivity(density, sizeFactor);
  // Granulation cell size scales with pressure scale height ∝ R²/M (inverse surface gravity)
  // Sun (M=1, R=1) → scale 18; red giant (R=100, M=1) → much larger cells → lower frequency
  const surfaceGrav = mass / (radius * radius); // in solar units
  const granScale = Math.max(2, Math.min(30, 18.0 * surfaceGrav));
  setGranulationScale(granScale);

  updateParticleComposition(comp.X_core, comp.Y_core);
  drawSpecies(comp, mu, evolution.getAge() / 1e9);

  // Update scale display
  if (starScaleDisplay) {
    const L_sun = 3.828e26;
    const Lsolar = profiles.L / L_sun;
    const rStr = radius >= 10 ? `${Math.round(radius)}` : `${radius.toFixed(1)}`;
    const lStr = Lsolar >= 100 ? `${Math.round(Lsolar)}` : Lsolar >= 1 ? `${Lsolar.toFixed(1)}` : `${Lsolar.toFixed(3)}`;
    const mStr = mass >= 10 ? `${Math.round(mass)}` : `${mass.toFixed(1)}`;
    starScaleDisplay.innerHTML = `M = ${mStr} M&#9737; &middot; R = ${rStr} R&#9737; &middot; T = ${Math.round(temperature)} K &middot; L = ${lStr} L&#9737;`;
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

      // Reset panel state when switching tabs
      const rightPanel = document.getElementById('right-panel');
      rightPanel.classList.remove('expanded', 'expanded-mobile', 'minimized-mobile');
      if (tabId === 'star' || tabId === 'about') {
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
      // Show ejected envelope in composition display
      const deathComp = evolution.getComposition();
      deathComp.remnant = true;
      drawSpecies(deathComp, evolution.getMu(), evolution.getAge() / 1e9);
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
      }, { wobble: false });
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
      // auto-zoom removed — user controls zoom
      playBtn.innerHTML = '&#9654;';
      playBtn.classList.remove('playing');
      setStarfieldSpeed(0);
      sliderControls.setDisabled(false);

    } else {
      ensureInitialized();
      evolution.setRunning(true);
      // auto-zoom removed — user controls zoom
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
      // auto-zoom removed — user controls zoom
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
  }, { wobble: false });
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

    // Update composition display to show ejected envelope
    const comp = evolution.getComposition();
    comp.remnant = true;
    drawSpecies(comp, evolution.getMu(), evolution.getAge() / 1e9);
  }
}

function initInteriorPanel() {
  const canvas = document.getElementById('interior-canvas');
  if (!canvas) return;

  patchRenderer = new PatchRenderer(canvas, 512);

  // Field toggle buttons
  const fieldButtons = document.querySelectorAll('#interior-field-toggle .field-btn');
  fieldButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      fieldButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (patchRenderer) patchRenderer.setField(btn.dataset.field);
    });
  });

  // Streamlines toggle
  const streamlinesToggle = document.getElementById('interior-streamlines-toggle');
  if (streamlinesToggle) {
    streamlinesToggle.addEventListener('change', (e) => {
      if (patchRenderer) patchRenderer.setShowStreamlines(e.target.checked);
    });
  }

  // Depth slider
  const depthSlider = document.getElementById('interior-depth-slider');
  const depthLabel = document.getElementById('interior-depth-label');
  if (depthSlider) {
    depthSlider.addEventListener('input', (e) => {
      // Slider 0-100 maps to r/R = 0.99 (surface) down to 0.05 (near center)
      const val = parseInt(e.target.value);
      currentDepthFrac = 0.99 - (val / 100) * 0.94;
      if (depthLabel) depthLabel.textContent = `r/R = ${currentDepthFrac.toFixed(2)}`;
      // Force recompute of the patch sim
      rebuildPatchSim();
    });
  }

  // --- Draggable + resizable panel ---
  const panel = document.getElementById('interior-float');
  const header = document.getElementById('interior-float-header');
  const grip = document.getElementById('interior-resize-grip');
  if (!panel || !header || !grip) return;

  let dragging = false, resizing = false;
  let dragStartX, dragStartY, panelStartX, panelStartY;
  let resizeStartX, resizeStartW;

  // Convert initial bottom/left positioning to top/left so drag is simple
  function ensureTopLeft() {
    if (panel.style.top) return; // already converted
    const rect = panel.getBoundingClientRect();
    panel.style.top = rect.top + 'px';
    panel.style.left = rect.left + 'px';
    panel.style.bottom = 'auto';
  }

  // Drag via header
  header.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.field-btn')) return; // don't drag when clicking buttons
    ensureTopLeft();
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panelStartX = panel.offsetLeft;
    panelStartY = panel.offsetTop;
    header.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  header.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    panel.style.left = (panelStartX + e.clientX - dragStartX) + 'px';
    panel.style.top = (panelStartY + e.clientY - dragStartY) + 'px';
  });

  header.addEventListener('pointerup', () => { dragging = false; });
  header.addEventListener('pointercancel', () => { dragging = false; });

  // Resize via grip (width only; height follows via aspect-ratio on canvas)
  grip.addEventListener('pointerdown', (e) => {
    ensureTopLeft();
    resizing = true;
    resizeStartX = e.clientX;
    resizeStartW = panel.offsetWidth;
    grip.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  grip.addEventListener('pointermove', (e) => {
    if (!resizing) return;
    const newW = Math.max(180, resizeStartW + e.clientX - resizeStartX);
    panel.style.width = newW + 'px';
  });

  grip.addEventListener('pointerup', () => { resizing = false; });
  grip.addEventListener('pointercancel', () => { resizing = false; });

  // --- Mobile interior panel ---
  const mobileCanvas = document.getElementById('interior-mobile-canvas');
  if (mobileCanvas) {
    patchRendererMobile = new PatchRenderer(mobileCanvas, 400);

    // Mobile field toggle
    const mobileFieldBtns = document.querySelectorAll('#interior-mobile-field-toggle .field-btn');
    mobileFieldBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        mobileFieldBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (patchRendererMobile) patchRendererMobile.setField(btn.dataset.field);
      });
    });

    // Mobile depth slider
    const mobileDepthSlider = document.getElementById('interior-mobile-depth-slider');
    const mobileDepthLabel = document.getElementById('interior-mobile-depth-label');
    if (mobileDepthSlider) {
      mobileDepthSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        currentDepthFrac = 0.99 - (val / 100) * 0.94;
        if (mobileDepthLabel) mobileDepthLabel.textContent = currentDepthFrac.toFixed(2);
        // Sync desktop slider
        const desktopSlider = document.getElementById('interior-depth-slider');
        const desktopLabel = document.getElementById('interior-depth-label');
        if (desktopSlider) desktopSlider.value = val;
        if (desktopLabel) desktopLabel.textContent = `r/R = ${currentDepthFrac.toFixed(2)}`;
        rebuildPatchSim();
      });
    }
  }
}

function setInteriorActive(active) {
  interiorActive = active;

  // Desktop: show/hide floating panel (CSS hides it on mobile via !important)
  const floatPanel = document.getElementById('interior-float');
  if (floatPanel) {
    floatPanel.style.display = active ? '' : 'none';
  }

  // Mobile: show/hide carousel panel via class
  const mobilePanel = document.getElementById('interior-mobile-panel');
  if (mobilePanel) {
    mobilePanel.classList.toggle('slice-active', active);
  }

  if (active) {
    lastInteriorMass = null;
    if (sliderControls) {
      updateInterior(sliderControls.getValues().mass);
    }
  }
}

/**
 * Compute local patch parameters at a given depth.
 *
 * The effective Rayleigh number for the 2D sim is derived from ∇_rad/∇_ad,
 * NOT from the physical Ra (which is ~10¹⁰-10¹⁵ everywhere in a star).
 *
 * Physical stellar Ra is always supercritical because viscosity is tiny.
 * What determines whether convection occurs is the Schwarzschild criterion:
 * ∇_rad > ∇_ad. The Boussinesq box model doesn't capture subadiabatic
 * stratification, so we translate the 1D physics into an effective Ra:
 *
 *   ∇_rad/∇_ad < 1 (radiative): Ra_eff < Ra_crit → stable
 *   ∇_rad/∇_ad > 1 (convective): Ra_eff > Ra_crit → convection
 *
 * The mapping provides a smooth transition at the boundary.
 */
function computeLocalPatchParams(model, rFrac) {
  const { G, R_sun } = constants;
  const R = model.radius * R_sun;

  const idx = Math.min(model.N - 1, Math.round(rFrac * (model.N - 1)));
  const rho = model.rho[idx];
  const T = model.T[idx];
  const P = model.P[idx];
  const m = model.mEnclosed[idx];
  const r = rFrac * R;
  const nabla_rad = model.nabla_rad[idx];
  const NABLA_AD = 0.4;

  if (rho < 1e-10 || T < 100 || r < 1e3) {
    return { Ra_eff: 0, H_P_km: 1, boxSize_km: 1, T_local: T, rho_local: rho, isConvective: false, superadiabatic: 0 };
  }

  const g = G * m / (r * r);
  const H_P = P / (rho * g);

  // Superadiabatic ratio: how far above (or below) the convective threshold
  const ratio = nabla_rad / NABLA_AD;

  // Map to effective Ra for the Boussinesq sim.
  //
  // Above the Schwarzschild boundary, convective velocity scales as
  //   v_conv ∝ √(∇_rad - ∇_ad)   (mixing-length theory)
  // Since kinetic energy ~ v² ~ Ra (in the sim), Ra should scale as
  //   Ra_eff ∝ (∇_rad - ∇_ad)  →  ∝ (ratio - 1)
  // but we use a square-root ramp near the boundary for a gradual
  // onset, transitioning to linear growth further in:
  //
  //   ratio = 0.0 → Ra_eff ≈ 0
  //   ratio = 1.0 → Ra_eff = 1700 (critical)
  //   ratio = 1.1 → Ra_eff ≈ 3400 (gentle onset, √ scaling)
  //   ratio = 2.0 → Ra_eff ≈ 7400
  //   ratio = 10  → Ra_eff ≈ 18700
  //   ratio = 100 → Ra_eff ≈ 53000
  let Ra_eff;
  if (ratio <= 1) {
    Ra_eff = ratio * 1700;
  } else {
    // Logarithmic ramp above critical — much gentler than √ or linear.
    // log(1 + x) grows very slowly, preventing the dramatic jump between
    // adjacent r/R values where ∇_rad changes by 5-10× per 0.01 in r/R.
    Ra_eff = 1700 + 3000 * Math.log(1 + (ratio - 1) * 2);
  }
  Ra_eff = Math.min(Ra_eff, 30000); // cap lower for smoother visual

  return {
    Ra_eff,
    H_P,
    H_P_km: H_P / 1000,
    g_local: g,
    T_local: T,
    rho_local: rho,
    boxSize_km: (3.5 * H_P) / 1000,
    isConvective: model.isConvective[idx],
    superadiabatic: ratio,
  };
}

let _rebuildPending = false;

async function rebuildPatchSim() {
  if (!interiorModel || !patchRenderer) return;

  const info = computeLocalPatchParams(interiorModel, currentDepthFrac);

  if (patchSim) {
    // Sim already exists — just update Ra and let the flow evolve smoothly.
    // No reinitialization, no loading screen, no disruption.
    patchSim.setRa(info.Ra_eff);
    patchRenderer.setDepthInfo({
      rFrac: currentDepthFrac,
      H_P_km: info.H_P_km,
      boxSize_km: info.boxSize_km,
      T: info.T_local,
      rho: info.rho_local,
      isConvective: info.isConvective,
      Ra: info.Ra_eff,
    });
    return;
  }

  // First creation — full init with loading indicator
  if (_rebuildPending) return;
  _rebuildPending = true;

  const loadingEl = document.getElementById('interior-loading');
  if (loadingEl) loadingEl.style.display = '';

  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  patchSim = new CartesianSim({
    Nx: 80, Ny: 80,
    Ra: info.Ra_eff,
    Pr: 0.7,
  });

  patchSim.fastForward(60, 0.008);

  const depthInfo = {
    rFrac: currentDepthFrac,
    H_P_km: info.H_P_km,
    boxSize_km: info.boxSize_km,
    T: info.T_local,
    rho: info.rho_local,
    isConvective: info.isConvective,
    Ra: info.Ra_eff,
  };
  patchRenderer.setSim(patchSim);
  patchRenderer.setDepthInfo(depthInfo);
  if (patchRendererMobile) {
    patchRendererMobile.setSim(patchSim);
    patchRendererMobile.setDepthInfo(depthInfo);
  }

  if (loadingEl) loadingEl.style.display = 'none';
  _rebuildPending = false;
}

function _dead() { /*
  const gravity = new Float64Array(Nr);
  const dr = (rOuter - rInner) / Nr;
  for (let i = 0; i < Nr; i++) {
    const rPhys = (rInner + (i + 0.5) * dr) * R;
    gravity[i] = rPhys > 0 ? G * mEncInterp[i] / (rPhys * rPhys) : 0;
  }
  // Normalize so peak = 10 (sim units)
  let gMax = 0;
  for (let i = 0; i < Nr; i++) if (gravity[i] > gMax) gMax = gravity[i];
  if (gMax > 0) for (let i = 0; i < Nr; i++) gravity[i] *= 10 / gMax;

  // --- Thermal diffusivity: κ_th(r) = 16σT³ / (3κρ²cₚ) ---
  //
  // Computed directly from the 1D model's physical quantities.
  // Where opacity κ is low (radiative zone): κ_th is high → heat
  // diffuses efficiently → no convection.
  // Where opacity κ is high (convective zone): κ_th is low → heat
  // is trapped → convection develops naturally.
  //
  const { sigma: sig, k_B, m_p } = constants;
  const kappaInterp = interpToSimGrid(model.rFrac, model.kappa, Nr, rInner, rOuter);
  const rhoInterp = interpToSimGrid(model.rFrac, model.rho, Nr, rInner, rOuter);
  const TInterp = interpToSimGrid(model.rFrac, model.T, Nr, rInner, rOuter);

  const thermalDiffPhys = new Float64Array(Nr);
  const cp = 5 * k_B / (2 * model.mu * m_p); // cₚ for ideal monatomic gas

  for (let i = 0; i < Nr; i++) {
    const T3 = TInterp[i] * TInterp[i] * TInterp[i];
    const denom = 3 * kappaInterp[i] * rhoInterp[i] * rhoInterp[i] * cp;
    thermalDiffPhys[i] = denom > 0 ? (16 * sig * T3) / denom : 1e-10;
  }

  // Normalize to sim units: scale so the profile spans a usable range.
  // The ratio between max (radiative) and min (convective) κ_th is
  // preserved — this IS the physics that determines whether convection
  // develops or not.
  let kthMax = 0, kthMin = Infinity;
  for (let i = 0; i < Nr; i++) {
    if (thermalDiffPhys[i] > kthMax) kthMax = thermalDiffPhys[i];
    if (thermalDiffPhys[i] > 0 && thermalDiffPhys[i] < kthMin) kthMin = thermalDiffPhys[i];
  }
  // Scale so max κ_th = 1.0 (sim units)
  const thermalDiff = new Float64Array(Nr);
  const kthScale = kthMax > 0 ? 1.0 / kthMax : 1;
  for (let i = 0; i < Nr; i++) {
    thermalDiff[i] = Math.max(1e-6, thermalDiffPhys[i] * kthScale);
  }

  // --- Viscosity: uniform ---
  const viscosity = new Float64Array(Nr).fill(0.005);

  // --- Temperature profile: conduction equilibrium ---
  // Solve d/dr(r · κ_th(r) · dT/dr) = 0 with T(rInner)=1, T(rOuter)=0.
  // This is the temperature profile that the radiative zone naturally
  // maintains. Perturbations from this profile drive buoyancy.
  // In convective zones (low κ_th), perturbations persist and grow.
  // In radiative zones (high κ_th), perturbations are quickly diffused back.
  //
  // Integration: dT/dr = C / (r · κ_th(r))
  //   T(r) = 1 - (integral from rInner to r) / (integral from rInner to rOuter)
  const integral = new Float64Array(Nr);
  integral[0] = 0;
  for (let i = 1; i < Nr; i++) {
    const r = rInner + (i - 0.5) * dr;
    const kth = thermalDiff[i - 1] || 0.01;
    integral[i] = integral[i - 1] + dr / (r * kth);
  }
  const totalIntegral = integral[Nr - 1] || 1;
  const T_profile = new Float64Array(Nr);
  for (let i = 0; i < Nr; i++) {
    T_profile[i] = 1.0 - integral[i] / totalIntegral;
  }

  // --- MLT velocity seed ---
  const v_raw = interpToSimGrid(model.rFrac, model.v_conv, Nr, rInner, rOuter);
  let vMax = 0;
  for (let i = 0; i < Nr; i++) if (v_raw[i] > vMax) vMax = v_raw[i];
  const v_conv_seed = new Float64Array(Nr);
  if (vMax > 0) for (let i = 0; i < Nr; i++) v_conv_seed[i] = v_raw[i] / vMax;

*/ }

function updateInterior(mass) {
  if (!patchRenderer && !patchRendererMobile) return;
  if (!interiorActive) return;

  // Recompute interior model if mass changed
  if (mass !== lastInteriorMass) {
    lastInteriorMass = mass;
    interiorModel = computeInteriorModel(mass);

    // Sync Schwarzschild zones to 3D slice view
    setSchwarzschildZones({
      zoneBoundaries: interiorModel.zoneBoundaries,
      coreConvective: interiorModel.coreConvective,
    });

    patchRenderer.setModel(interiorModel);
    if (patchRendererMobile) patchRendererMobile.setModel(interiorModel);

    // Auto-set depth to the most interesting convective region
    const zb = interiorModel.zoneBoundaries;
    if (interiorModel.coreConvective && zb.length > 0) {
      // Massive star: convective core — default to mid-core
      currentDepthFrac = zb[0] * 0.5;
    } else if (zb.length > 0) {
      // Solar-type: convective envelope — default to just inside the boundary
      currentDepthFrac = Math.min(0.98, zb[zb.length - 1] + 0.02);
    } else {
      currentDepthFrac = 0.85;
    }

    // Sync the slider UI
    // Sync both desktop and mobile sliders
    const sliderVal = Math.round((0.99 - currentDepthFrac) / 0.94 * 100);
    for (const id of ['interior-depth-slider', 'interior-mobile-depth-slider']) {
      const el = document.getElementById(id);
      if (el) el.value = sliderVal;
    }
    for (const [id, fmt] of [['interior-depth-label', `r/R = ${currentDepthFrac.toFixed(2)}`],
                              ['interior-mobile-depth-label', currentDepthFrac.toFixed(2)]]) {
      const el = document.getElementById(id);
      if (el) el.textContent = fmt;
    }

    patchSim = null; // force full rebuild for new star
    rebuildPatchSim();
  }

  // Step the simulation
  if (patchSim) {
    patchSim.step(0.002);
  }

  // Render both desktop and mobile
  patchRenderer.render();
  if (patchRendererMobile) patchRendererMobile.render();
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

  // Interior cross-section panel
  initInteriorPanel();

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
    setInteriorActive(e.target.checked);
  });

  // Reset button — force true reload (bypass mobile bfcache)
  document.getElementById('reset-btn').addEventListener('click', () => {
    window.location.href = window.location.pathname + '?t=' + Date.now();
  });

  // Initial render
  onParametersChanged(sliderControls.getValues());
  updateAgeDisplay();
  syncPanelBottom();
  // Re-sync after layout settles (mobile reload may have delayed paint)
  setTimeout(syncPanelBottom, 100);
  setTimeout(syncPanelBottom, 500);

  // Tooltips
  initTooltips();
  initStarHover(viewport);

  // Update scale bar every frame (responds to manual zoom too)
  setOnFrameCallback(updateScaleBar);

  // Start time evolution loop
  lastFrameTime = performance.now();
  requestAnimationFrame(timeEvolutionLoop);

  // Interior heatmap render loop (runs when interior tab is active)
  function interiorRenderLoop() {
    requestAnimationFrame(interiorRenderLoop);
    if (sliderControls && interiorActive) {
      updateInterior(sliderControls.getValues().mass);
    }
  }
  requestAnimationFrame(interiorRenderLoop);

  // Resize handling — canvas resize functions skip when tab is hidden (0×0),
  // so a deferred resize is triggered when switching back to the star tab.
  let resizePending = false;
  window.addEventListener('resize', () => {
    syncPanelBottom();
    resizeHRCanvas();
    resizeParticleCanvas();
    resizeSpeciesCanvas();
    // If any canvas couldn't resize (hidden tab), mark pending
    const starTab = document.querySelector('.nav-link[data-tab="star"]');
    if (starTab && !starTab.classList.contains('active')) {
      resizePending = true;
    } else {
      onParametersChanged(sliderControls.getValues());
    }
  });

  // Patch tab handler to flush pending resize
  const origTabHandler = document.querySelector('.nav-link[data-tab="star"]');
  if (origTabHandler) {
    origTabHandler.addEventListener('click', () => {
      if (resizePending) {
        resizePending = false;
        // Small delay so the tab content is visible before measuring
        requestAnimationFrame(() => {
          resizeHRCanvas();
          resizeParticleCanvas();
          resizeSpeciesCanvas();
          onParametersChanged(sliderControls.getValues());
        });
      }
    });
  }

  // --- Mobile-specific setup ---
  initMobile(sliderControls);
}

function initMobile(sliderControls) {
  // Drawer toggle
  const drawer = document.getElementById('mobile-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  const drawerToggle = document.getElementById('drawer-toggle');
  const drawerClose = document.getElementById('drawer-close');

  function openDrawer() {
    drawer.classList.add('open');
    backdrop.classList.add('visible');
    _mobileDrawerOpen = true;
    setLightMode(true);
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    backdrop.classList.remove('visible');
    _mobileDrawerOpen = false;
    setLightMode(false);
    // Flush deferred updates now that drawer is closed
    onParametersChanged(sliderControls.getValues(), { wobble: false });
  }

  if (drawerToggle) drawerToggle.addEventListener('click', openDrawer);
  if (drawerClose) drawerClose.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);

  // Create mobile sliders (duplicate of desktop sliders for the drawer)
  const mobileSliderPanel = document.getElementById('mobile-sliders');
  if (mobileSliderPanel) {
    const mobileSliderControls = createSliders(mobileSliderPanel, (values) => {
      // Sync desktop sliders when mobile changes
      sliderControls.setValues(values);
      onParametersChanged(values);
    });

    // Sync mobile sliders when desktop values change (e.g. reset)
    const origSetValues = sliderControls.setValues.bind(sliderControls);
    sliderControls.setValues = (vals) => {
      origSetValues(vals);
      mobileSliderControls.setValues(vals);
    };

    // Mobile reset button (in drawer)
    const mobileReset = document.getElementById('mobile-reset-btn');
    if (mobileReset) {
      mobileReset.addEventListener('click', () => {
        document.getElementById('reset-btn').click();
        closeDrawer();
      });
    }
  }

  // Mobile reset button (in playback row)
  const mobileResetPlayback = document.getElementById('mobile-reset');
  if (mobileResetPlayback) {
    mobileResetPlayback.addEventListener('click', () => {
      document.getElementById('reset-btn').click();
    });
  }

  // Sunglasses and Slice floating buttons (viewport icons)
  const sunglassesBtn = document.getElementById('mobile-sunglasses-btn');
  const sliceBtn = document.getElementById('mobile-slice-btn');
  const desktopSunglasses = document.getElementById('sunglasses-toggle');
  const desktopSlice = document.getElementById('slice-toggle');

  if (sunglassesBtn && desktopSunglasses) {
    sunglassesBtn.addEventListener('click', () => {
      desktopSunglasses.checked = !desktopSunglasses.checked;
      desktopSunglasses.dispatchEvent(new Event('change'));
      sunglassesBtn.classList.toggle('active', desktopSunglasses.checked);
    });
  }

  if (sliceBtn && desktopSlice) {
    sliceBtn.addEventListener('click', () => {
      desktopSlice.checked = !desktopSlice.checked;
      desktopSlice.dispatchEvent(new Event('change'));
      sliceBtn.classList.toggle('active', desktopSlice.checked);
    });
  }

  // Sync mobile slow-motion toggle
  const mobileSlowmo = document.getElementById('mobile-slowmo-toggle');
  const desktopSlowmo = document.getElementById('slowmo-toggle');
  if (mobileSlowmo && desktopSlowmo) {
    mobileSlowmo.addEventListener('change', () => {
      desktopSlowmo.checked = mobileSlowmo.checked;
      desktopSlowmo.dispatchEvent(new Event('change'));
    });
    desktopSlowmo.addEventListener('change', () => {
      mobileSlowmo.checked = desktopSlowmo.checked;
    });
  }

  // Drag handle to expand/collapse bottom panel
  // Drag handle: three states — minimized / default / expanded
  // Three-state bottom panel: minimized / default / expanded
  const rightPanel = document.getElementById('right-panel');
  const viewport = document.getElementById('viewport');
  if (rightPanel) {
    let startY = 0;
    let panelState = 'default';

    function setPanelState(state) {
      panelState = state;
      rightPanel.classList.remove('minimized-mobile', 'expanded-mobile');
      if (state === 'minimized') rightPanel.classList.add('minimized-mobile');
      if (state === 'expanded') rightPanel.classList.add('expanded-mobile');
      // Resize canvases after transition completes
      setTimeout(() => {
        resizeHRCanvas();
        resizeParticleCanvas();
        resizeSpeciesCanvas();
        if (state !== 'minimized') {
          onParametersChanged(sliderControls.getValues(), { wobble: false });
        }
      }, 320); // slightly after the 0.3s CSS transition
    }

    function isStarTab() {
      const active = document.querySelector('.nav-link.active');
      return active && active.dataset.tab === 'star';
    }

    // Vertical swipe handler — attach to any element
    let startX = 0;
    function addPanelSwipe(el) {
      el.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        startX = e.touches[0].clientX;
        if (e.target) e.target._touchStartX = startX;
      }, { passive: true });

      el.addEventListener('touchend', (e) => {
        if (!isStarTab()) return;
        const endY = e.changedTouches[0].clientY;
        const endX = e.changedTouches[0].clientX;
        const dy = startY - endY; // positive = swiped up
        const dx = Math.abs(endX - startX);
        if (Math.abs(dy) < 30 || dx > Math.abs(dy)) return;
        if (dy > 30) {
          if (panelState === 'minimized') setPanelState('default');
          else if (panelState === 'default') setPanelState('expanded');
        } else if (dy < -30) {
          if (panelState === 'expanded') setPanelState('default');
          else if (panelState === 'default') setPanelState('minimized');
        }
      }, { passive: true });
    }

    // Swipe on the right panel and playback controls
    addPanelSwipe(rightPanel);
    const playbackEl = document.getElementById('playback-controls');
    if (playbackEl) addPanelSwipe(playbackEl);

    // Tap/swipe on the drag handle — non-passive to guarantee capture
    const dragHandle = document.getElementById('mobile-drag-handle');
    if (dragHandle) {
      let handleStartY = 0;
      dragHandle.addEventListener('touchstart', (e) => {
        handleStartY = e.touches[0].clientY;
        e.stopPropagation(); // prevent TrackballControls from stealing
      }, { passive: true });
      dragHandle.addEventListener('touchend', (e) => {
        if (!isStarTab()) return;
        const dy = handleStartY - e.changedTouches[0].clientY;
        if (Math.abs(dy) < 15) {
          // Tap — cycle state
          if (panelState === 'minimized') setPanelState('default');
          else if (panelState === 'default') setPanelState('expanded');
          else setPanelState('minimized');
        } else if (dy > 15) {
          if (panelState === 'minimized') setPanelState('default');
          else if (panelState === 'default') setPanelState('expanded');
        } else {
          if (panelState === 'expanded') setPanelState('default');
          else if (panelState === 'default') setPanelState('minimized');
        }
      }, { passive: true });
    }

    // Tap on viewport collapses expanded panel to default
    if (viewport) {
      viewport.addEventListener('click', () => {
        if (isStarTab() && panelState === 'expanded') {
          setPanelState('default');
        }
      });
    }
  }

  // Carousel dot tracking via IntersectionObserver
  const tabStar = document.getElementById('tab-star');
  const dots = document.querySelectorAll('#carousel-dots .dot');
  const panels = tabStar ? tabStar.querySelectorAll('.mini-panel') : [];

  if (tabStar && panels.length >= 3 && dots.length >= 3) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
          const idx = Array.from(panels).indexOf(entry.target);
          dots.forEach((d, i) => d.classList.toggle('active', i === idx));

          // Trigger canvas resize + redraw when panel becomes visible
          requestAnimationFrame(() => {
            resizeHRCanvas();
            resizeParticleCanvas();
            resizeSpeciesCanvas();
            onParametersChanged(sliderControls.getValues(), { wobble: false });
          });
        }
      });
    }, {
      root: tabStar,
      threshold: 0.5,
    });

    panels.forEach(p => observer.observe(p));

    // Initial render of first visible panel after layout settles
    setTimeout(() => {
      resizeHRCanvas();
      resizeParticleCanvas();
      resizeSpeciesCanvas();
      onParametersChanged(sliderControls.getValues(), { wobble: false });
    }, 100);
  }
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

  // Mobile: single tap shows tooltip, tap elsewhere hides it
  let tapTimeout = null;
  viewport.addEventListener('touchend', (e) => {
    // Ignore multi-touch (pinch zoom) and drags
    if (e.changedTouches.length !== 1) return;

    const touch = e.changedTouches[0];
    const rect = viewport.getBoundingClientRect();
    hoverMouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
    hoverMouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
    lastMouseClientX = touch.clientX;
    lastMouseClientY = touch.clientY;
    hoverActive = true;
    refreshTooltip();

    // Auto-hide after 3 seconds
    clearTimeout(tapTimeout);
    tapTimeout = setTimeout(() => {
      hoverActive = false;
      hoverTooltip.style.display = 'none';
    }, 3000);
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
