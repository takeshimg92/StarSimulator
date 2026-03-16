import { getStateAtAge, isLoaded as mistLoaded, getZAMSAge } from '../physics/mistTracks.js';
import { radiusFromMass, temperatureFromMass } from '../physics/scaling.js';

/**
 * Creates a single mass slider. When mass changes, the star's appearance
 * is derived from the MIST track at the current age (or ZAMS scaling relations
 * as fallback).
 */
export function createSliders(container, onChange) {
  const def = {
    id: 'mass', label: 'Mass', unit: 'M☉',
    min: 0.1, max: 50, step: 0.1, initial: 1.0,
    format: (v) => `${v} M☉`,
  };

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
    const mass = parseFloat(input.value);
    valueDisplay.textContent = def.format(mass);
    onChange(getValuesForMass(mass));
  });

  wrapper.appendChild(labelRow);
  wrapper.appendChild(input);
  container.appendChild(wrapper);

  /**
   * Derive T, R, X from MIST track at present-day age, or from scaling relations.
   */
  function getValuesForMass(mass) {
    if (mistLoaded()) {
      // Use present-day Sun age for solar mass, ZAMS for others
      const age = mass >= 0.9 && mass <= 1.1 ? 4.6e9 : getZAMSAge(mass);
      const st = getStateAtAge(mass, age);
      if (st) {
        return {
          mass,
          temperature: Math.round(st.Teff),
          radius: Math.round(st.R * 100) / 100,
          hydrogen: Math.max(0, st.Xc),
        };
      }
    }
    // Fallback: scaling relations
    return {
      mass,
      temperature: Math.round(temperatureFromMass(mass) / 100) * 100,
      radius: Math.round(radiusFromMass(mass) * 10) / 10,
      hydrogen: 0.70,
    };
  }

  function getValues() {
    return getValuesForMass(parseFloat(input.value));
  }

  function setValues(values) {
    if (values.mass !== undefined) {
      input.value = values.mass;
      valueDisplay.textContent = def.format(parseFloat(input.value));
    }
    onChange(getValues());
  }

  function setDisabled(disabled) {
    input.disabled = disabled;
    container.classList.toggle('sliders-disabled', disabled);
  }

  return { getValues, setValues, setDisabled };
}
