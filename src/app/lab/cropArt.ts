// Grains and vegetables on the map and in the counter (owner, after the
// 0.19.0 build): a sown square shows rows of sprouts; a ripe one shows its
// crop. The seed and crop icons are drawn here too. This is the screen's own
// drawing: nothing here changes the game.

import type { SquareBox } from './labDraw';

/** Each crop's colours: its leaves, and the part harvested. */
export const CROP_PAINT: Record<string, { leaf: string; part: string; partDark: string }> = {
  wheat: { leaf: '#b9a14a', part: '#e8c75a', partDark: '#a88a2e' },
  corn: { leaf: '#4f9a3a', part: '#f2cf3c', partDark: '#b88f1c' },
  carrot: { leaf: '#5aa83f', part: '#ee8a2b', partDark: '#b45f17' },
  potato: { leaf: '#3f8a3a', part: '#c9a46b', partDark: '#8a6a3e' },
};

/** Tilled soil: a few darker furrows across the square. */
function furrows(ctx: CanvasRenderingContext2D, box: SquareBox): void {
  const s = box.inner;
  // Darker, turned earth, so a field stands out from plain dirt.
  ctx.fillStyle = 'rgba(70, 40, 18, 0.45)';
  ctx.fillRect(box.left, box.top, s, s);
  ctx.strokeStyle = 'rgba(60, 35, 15, 0.45)';
  ctx.lineWidth = Math.max(1, s * 0.05);
  for (const row of [0.3, 0.55, 0.8]) {
    ctx.beginPath();
    ctx.moveTo(box.left + s * 0.1, box.top + s * row);
    ctx.lineTo(box.left + s * 0.9, box.top + s * row);
    ctx.stroke();
  }
}

/** A crop on its square: sprouts while it grows, the crop itself once `ripe`. */
export function drawCrop(
  ctx: CanvasRenderingContext2D,
  box: SquareBox,
  crop: string,
  ripe: boolean,
): void {
  const s = box.inner;
  const p = CROP_PAINT[crop] ?? { leaf: '#4f9a3a', part: '#e8c75a', partDark: '#a88a2e' };
  ctx.save();
  furrows(ctx, box);
  const spots: [number, number][] = [];
  for (const row of [0.3, 0.55, 0.8]) {
    for (const col of [0.25, 0.5, 0.75]) spots.push([col, row]);
  }
  ctx.lineCap = 'round';
  for (const [cx, cy] of spots) {
    const x = box.left + s * cx;
    const y = box.top + s * cy;
    if (!ripe) {
      // A sprout: two small leaves.
      ctx.strokeStyle = '#6fbf4a';
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - s * 0.05, y - s * 0.07);
      ctx.moveTo(x, y);
      ctx.lineTo(x + s * 0.05, y - s * 0.07);
      ctx.stroke();
      continue;
    }
    if (crop === 'wheat' || crop === 'corn') {
      // A stalk with a head (wheat) or a cob (corn).
      ctx.strokeStyle = p.leaf;
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - s * 0.2);
      ctx.stroke();
      ctx.fillStyle = p.part;
      ctx.strokeStyle = p.partDark;
      ctx.lineWidth = Math.max(1, s * 0.02);
      ctx.beginPath();
      if (crop === 'wheat') ctx.ellipse(x, y - s * 0.2, s * 0.05, s * 0.1, 0, 0, Math.PI * 2);
      else ctx.ellipse(x + s * 0.05, y - s * 0.12, s * 0.05, s * 0.1, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      // Leafy tops; a carrot's orange shoulder, or a potato's pale flower.
      ctx.fillStyle = p.leaf;
      ctx.beginPath();
      ctx.arc(x, y - s * 0.06, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = crop === 'carrot' ? p.part : '#e9e2f5';
      ctx.beginPath();
      ctx.arc(x, y + (crop === 'carrot' ? s * 0.04 : -s * 0.08), s * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** An icon for a seed packet (`crop` names what it grows) or for a crop itself. */
export function drawCropIcon(
  ctx: CanvasRenderingContext2D,
  s: number,
  crop: string,
  seed: boolean,
): void {
  const p = CROP_PAINT[crop] ?? { leaf: '#4f9a3a', part: '#e8c75a', partDark: '#a88a2e' };
  ctx.fillStyle = '#2a2420';
  ctx.fillRect(0, 0, s, s);
  ctx.save();
  if (seed) {
    // A paper packet with the crop's colour on its front.
    ctx.fillStyle = '#d9c7a0';
    ctx.fillRect(s * 0.22, s * 0.16, s * 0.56, s * 0.68);
    ctx.fillStyle = p.part;
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.52, s * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.leaf;
    ctx.fillRect(s * 0.22, s * 0.16, s * 0.56, s * 0.1);
    ctx.restore();
    return;
  }
  ctx.fillStyle = p.part;
  ctx.strokeStyle = p.partDark;
  ctx.lineWidth = s * 0.04;
  ctx.beginPath();
  if (crop === 'carrot') {
    ctx.moveTo(s * 0.35, s * 0.3);
    ctx.lineTo(s * 0.65, s * 0.3);
    ctx.lineTo(s * 0.5, s * 0.88);
    ctx.closePath();
  } else if (crop === 'potato') {
    ctx.ellipse(s * 0.5, s * 0.55, s * 0.28, s * 0.2, 0.3, 0, Math.PI * 2);
  } else if (crop === 'corn') {
    ctx.ellipse(s * 0.5, s * 0.55, s * 0.14, s * 0.3, 0, 0, Math.PI * 2);
  } else {
    // Wheat: a bundle of ears.
    for (const dx of [-0.12, 0, 0.12]) {
      ctx.ellipse(s * (0.5 + dx), s * 0.35, s * 0.05, s * 0.14, dx * 2, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  ctx.stroke();
  // Green tops.
  ctx.strokeStyle = p.leaf;
  ctx.lineWidth = s * 0.06;
  ctx.beginPath();
  if (crop === 'wheat') {
    ctx.moveTo(s * 0.5, s * 0.45);
    ctx.lineTo(s * 0.5, s * 0.88);
  } else {
    ctx.moveTo(s * 0.5, s * 0.28);
    ctx.lineTo(s * 0.42, s * 0.14);
    ctx.moveTo(s * 0.5, s * 0.28);
    ctx.lineTo(s * 0.58, s * 0.14);
  }
  ctx.stroke();
  ctx.restore();
}
