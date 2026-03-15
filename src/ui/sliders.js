import { radiusFromMass, temperatureFromMass, massFromTemperature } from '../physics/scaling.js';

/**
 * Creates slider controls with main-sequence coupling toggle.
 *
 * When "Lock to Main Sequence" is on (default):
 *   Mass drives T and R. T infers mass and drives R. R infers mass and drives T.
 * When off:
 *   All sliders are independent.
 */
export function createSliders(container, onChange) {
  const sliderDefs = [
    {
      id: 'temperature', label: 'Temperature', unit: 'K',
      min: 2500, max: 40000, step: 100, initial: 5778,
      format: (v) => `${v} K`,
    },
    {
      id: 'mass', label: 'Mass', unit: 'M☉',
      min: 0.1, max: 50, step: 0.1, initial: 1.0,
      format: (v) => `${v} M☉`,
    },
    {
      id: 'radius', label: 'Radius', unit: 'R☉',
      min: 0.1, max: 20, step: 0.1, initial: 1.0,
      format: (v) => `${v} R☉`,
    },
  ];

  const inputs = {};
  let msLocked = true;

  // Toggle
  const toggleWrapper = document.createElement('div');
  toggleWrapper.className = 'ms-toggle';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'ms-lock';
  checkbox.checked = true;

  const toggleLabel = document.createElement('label');
  toggleLabel.htmlFor = 'ms-lock';
  toggleLabel.textContent = 'Lock to Main Sequence';

  checkbox.addEventListener('change', () => {
    msLocked = checkbox.checked;
    // When re-locking, snap to MS from current mass
    if (msLocked) {
      const mass = parseFloat(inputs.mass.input.value);
      setSilent('temperature', Math.round(temperatureFromMass(mass) / 100) * 100);
      setSilent('radius', Math.round(radiusFromMass(mass) * 10) / 10);
      onChange(getValues());
    }
  });

  toggleWrapper.appendChild(checkbox);
  toggleWrapper.appendChild(toggleLabel);
  container.appendChild(toggleWrapper);

  // Sliders
  for (const def of sliderDefs) {
    const wrapper = document.createElement('div');
    wrapper.className = 'slider-group';

    const labelRow = document.createElement('div');
    labelRow.className = 'slider-label-row';

    const label = document.createElement('label');
    label.htmlFor = def.id;
    label.textContent = def.label;

    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'slider-value';
    valueDisplay.textContent = def.format(def.initial);

    labelRow.appendChild(label);
    labelRow.appendChild(valueDisplay);

    const input = document.createElement('input');
    input.type = 'range';
    input.id = def.id;
    input.min = def.min;
    input.max = def.max;
    input.step = def.step;
    input.value = def.initial;

    input.addEventListener('input', () => {
      onSliderInput(def.id);
    });

    wrapper.appendChild(labelRow);
    wrapper.appendChild(input);
    container.appendChild(wrapper);

    inputs[def.id] = { input, valueDisplay, def };
  }

  let updating = false;

  function setSilent(id, value) {
    const clamped = Math.min(inputs[id].def.max, Math.max(inputs[id].def.min, value));
    const stepped = Math.round(clamped / inputs[id].def.step) * inputs[id].def.step;
    inputs[id].input.value = stepped;
    inputs[id].valueDisplay.textContent = inputs[id].def.format(
      parseFloat(inputs[id].input.value)
    );
  }

  function onSliderInput(changedId) {
    if (updating) return;
    updating = true;

    const val = parseFloat(inputs[changedId].input.value);
    inputs[changedId].valueDisplay.textContent = inputs[changedId].def.format(val);

    if (msLocked) {
      if (changedId === 'mass') {
        setSilent('temperature', Math.round(temperatureFromMass(val) / 100) * 100);
        setSilent('radius', Math.round(radiusFromMass(val) * 10) / 10);
      } else if (changedId === 'temperature') {
        const inferredMass = massFromTemperature(val);
        setSilent('mass', Math.round(inferredMass * 10) / 10);
        setSilent('radius', Math.round(radiusFromMass(inferredMass) * 10) / 10);
      } else if (changedId === 'radius') {
        // Radius changed → infer mass from radius, then update T
        const inferredMass = massFromRadius(val);
        setSilent('mass', Math.round(inferredMass * 10) / 10);
        setSilent('temperature', Math.round(temperatureFromMass(inferredMass) / 100) * 100);
      }
    }

    updating = false;
    onChange(getValues());
  }

  function getValues() {
    return {
      temperature: parseFloat(inputs.temperature.input.value),
      mass: parseFloat(inputs.mass.input.value),
      radius: parseFloat(inputs.radius.input.value),
    };
  }

  function setValues(values) {
    for (const [key, val] of Object.entries(values)) {
      if (inputs[key]) {
        inputs[key].input.value = val;
        inputs[key].valueDisplay.textContent = inputs[key].def.format(val);
      }
    }
    onChange(getValues());
  }

  return { getValues, setValues };
}

// Need to import this — adding inline to avoid circular dependency issues
function massFromRadius(targetR) {
  // Inverse of radiusFromMass via bisection
  let lo = 0.1, hi = 50;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const r = mid <= 1 ? Math.pow(mid, 0.57) : Math.pow(mid, 0.8);
    if (r < targetR) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
