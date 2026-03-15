/**
 * Species composition display: separate Core and Envelope bars.
 */

let canvas, ctx, dpr;

export function initSpeciesPlot(canvasElement) {
  canvas = canvasElement;
  ctx = canvas.getContext('2d');
  dpr = window.devicePixelRatio || 1;
  resizeSpeciesCanvas();
}

export function resizeSpeciesCanvas() {
  if (!canvas) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/**
 * Draw two composition bars (Core / Envelope) + μ values.
 * @param {{ X_core: number, Y_core: number, X_env: number, Y_env: number, Z: number }} composition
 * @param {{ mu_core: number, mu_env: number, mu_eff: number }} mu
 * @param {number} ageGyr
 */
export function drawSpecies(composition, mu, ageGyr) {
  if (!ctx) return;

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;

  ctx.clearRect(0, 0, w, h);

  const pad = { top: 6, bottom: 8, left: 16, right: 16 };
  const barAreaW = w - pad.left - pad.right;

  const colors = {
    H: 'rgba(100, 180, 255, 0.8)',
    He: 'rgba(255, 200, 80, 0.8)',
    Z: 'rgba(180, 130, 255, 0.8)',
  };

  function drawBar(label, X, Y, Z_val, yPos) {
    const barH = 14;
    const species = [
      { label: 'H', value: X, color: colors.H },
      { label: 'He', value: Y, color: colors.He },
      { label: 'Z', value: Z_val, color: colors.Z },
    ];

    // Label
    ctx.font = '9px Inter, monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillText(label, pad.left, yPos - 3);

    // Bar
    let xOffset = pad.left;
    for (const s of species) {
      const segW = s.value * barAreaW;
      if (segW < 1) continue;
      ctx.fillStyle = s.color;
      ctx.fillRect(xOffset, yPos, segW, barH);
      xOffset += segW;
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, yPos, barAreaW, barH);

    return yPos + barH;
  }

  // Core bar
  let y = pad.top;
  const coreBottom = drawBar('Core', composition.X_core, composition.Y_core, composition.Z, y + 12);

  // Envelope bar
  y = coreBottom + 12;
  const envBottom = drawBar('Envelope', composition.X_env, composition.Y_env, composition.Z, y + 12);

  // Legend
  y = envBottom + 16;
  ctx.font = '10px Inter, monospace';
  let lx = pad.left;
  for (const [label, color] of [['H', colors.H], ['He', colors.He], ['Z', colors.Z]]) {
    ctx.fillStyle = color;
    ctx.fillRect(lx, y - 7, 8, 8);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    let pct;
    if (label === 'H') pct = (composition.X_core * 100).toFixed(1);
    else if (label === 'He') pct = (composition.Y_core * 100).toFixed(1);
    else pct = (composition.Z * 100).toFixed(1);
    const text = `${label} ${pct}%`;
    ctx.fillText(text, lx + 11, y);
    lx += ctx.measureText(text).width + 20;
  }

  // μ values
  if (mu) {
    y += 18;
    ctx.font = '10px Inter, monospace';
    ctx.fillStyle = 'rgba(255, 180, 100, 0.6)';
    ctx.fillText(`μ_core = ${mu.mu_core.toFixed(3)}`, pad.left, y);
    ctx.fillText(`μ_env = ${mu.mu_env.toFixed(3)}`, pad.left + barAreaW * 0.4, y);
    y += 14;
    ctx.fillText(`μ_eff = ${mu.mu_eff.toFixed(3)}`, pad.left, y);
  }
}

export function clearMuHistory() {
  // No-op, kept for API compat
}
