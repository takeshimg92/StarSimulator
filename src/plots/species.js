/**
 * Species population bar chart showing mass fractions X (H), Y (He), Z (metals).
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
 * Draw the species population chart.
 * @param {{ X: number, Y: number, Z: number }} composition
 */
export function drawSpecies(composition) {
  if (!ctx) return;

  const container = canvas.parentElement;
  const w = container.clientWidth;
  const h = container.clientHeight;

  ctx.clearRect(0, 0, w, h);

  const pad = { top: 28, bottom: 16, left: 16, right: 16 };
  const barAreaW = w - pad.left - pad.right;
  const barAreaH = h - pad.top - pad.bottom;

  const species = [
    { label: 'H', value: composition.X, color: 'rgba(100, 180, 255, 0.8)' },
    { label: 'He', value: composition.Y, color: 'rgba(255, 200, 80, 0.8)' },
    { label: 'Z', value: composition.Z, color: 'rgba(180, 130, 255, 0.8)' },
  ];

  // Stacked horizontal bar
  const barH = Math.min(24, barAreaH * 0.3);
  const barY = pad.top + 4;
  let xOffset = pad.left;

  for (const s of species) {
    const segW = s.value * barAreaW;
    if (segW < 1) continue;
    ctx.fillStyle = s.color;
    ctx.fillRect(xOffset, barY, segW, barH);
    xOffset += segW;
  }

  // Border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad.left, barY, barAreaW, barH);

  // Labels below bar
  const labelY = barY + barH + 18;
  ctx.font = '11px Inter, monospace';

  let lx = pad.left;
  for (const s of species) {
    // Dot
    ctx.fillStyle = s.color;
    ctx.fillRect(lx, labelY - 8, 10, 10);

    // Text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    const pct = (s.value * 100).toFixed(1);
    const text = `${s.label} ${pct}%`;
    ctx.fillText(text, lx + 14, labelY);
    lx += ctx.measureText(text).width + 28;
  }

}
