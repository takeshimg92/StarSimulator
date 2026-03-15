/**
 * Draws T(r) and ρ(r) profiles on a Canvas 2D context.
 * Handles high-DPI displays by scaling the canvas backing store.
 */

let canvas, ctx, dpr;

export function initProfilePlot(canvasElement) {
  canvas = canvasElement;
  ctx = canvas.getContext('2d');
  dpr = window.devicePixelRatio || 1;
}

/**
 * Set canvas resolution to match CSS size × devicePixelRatio.
 */
export function resizeProfileCanvas() {
  if (!canvas) return;
  const container = canvas.parentElement;
  const w = container.clientWidth;
  const h = container.clientHeight;
  dpr = window.devicePixelRatio || 1;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/**
 * Redraw the profile plot.
 * @param {{ r: number[], T: number[], rho: number[] }} profiles
 */
export function drawProfiles(profiles) {
  if (!ctx) return;

  // Use CSS dimensions for layout (ctx is already scaled by dpr)
  const container = canvas.parentElement;
  const w = container.clientWidth;
  const h = container.clientHeight;
  const pad = { top: 30, right: 20, bottom: 35, left: 45 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  // Clear — fully transparent so the starfield/glow shows through
  ctx.clearRect(0, 0, w, h);

  const maxT = Math.max(...profiles.T);
  const maxRho = Math.max(...profiles.rho);
  const n = profiles.r.length;

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();
  }

  function drawCurve(values, maxVal, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = pad.left + (profiles.r[i] * plotW);
      const y = pad.top + plotH - (values[i] / maxVal) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Temperature (orange-yellow)
  drawCurve(profiles.T, maxT, '#ffaa44');

  // Density (cyan)
  drawCurve(profiles.rho, maxRho, '#44ccff');

  // Labels
  ctx.font = '12px monospace';
  ctx.fillStyle = '#ffaa44';
  ctx.fillText('T(r)', pad.left + 5, pad.top + 15);
  ctx.fillStyle = '#44ccff';
  ctx.fillText('ρ(r)', pad.left + 50, pad.top + 15);

  // Axis labels
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '11px monospace';
  ctx.fillText('0', pad.left - 5, pad.top + plotH + 15);
  ctx.fillText('r/R', pad.left + plotW / 2 - 10, pad.top + plotH + 28);
  ctx.fillText('1', pad.left + plotW - 5, pad.top + plotH + 15);

  // Title
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '12px monospace';
  ctx.fillText('Radial Profiles (normalized)', pad.left, pad.top - 10);

  // Value annotations
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '10px monospace';
  ctx.fillText(`T_c = ${(maxT / 1e6).toFixed(1)} MK`, pad.left + plotW - 95, pad.top + 15);
  ctx.fillText(`ρ_c = ${maxRho.toExponential(1)} kg/m³`, pad.left + plotW - 130, pad.top + 30);
}
