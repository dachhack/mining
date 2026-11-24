// Night between shifts (owner, after the playtest of PR #146: "After a shift
// is night time. Fade to b&w and then dark and show a moon phase
// animation").
//
// When a shift ends (End shift, or Rest at a camp), the game state has
// already moved on. Then the screen:
// 1. fades to black and white (DUSK_MS),
// 2. fades to dark (DARK_MS),
// 3. shows the moon, whose phase turns from last night's to tonight's, with
//    what the night brought, one sentence a line (MOON_MS turns the moon),
// 4. waits there, with "Tap to continue", until the player taps (owner, on
//    the hazards build: "Night goes too fast to read what happens").
// A tap at any point ends it. On a night it rained, rain falls across the
// sky (owner: "We need a rain scene for when it rains"). With
// prefers-reduced-motion, the dark screen, the moon and still rain show at
// once.
//
// The moon's phase comes from the shift number only, so it is the same on
// every phone: one step a shift through the 8 phases. This is the screen's
// own drawing: nothing here changes the game.

import { element } from './labDom';

/** The 8 phases of the moon, in order: the night after shift 1 has the first. */
export const MOON_PHASES = [
  'New moon',
  'Waxing crescent',
  'First quarter',
  'Waxing gibbous',
  'Full moon',
  'Waning gibbous',
  'Last quarter',
  'Waning crescent',
] as const;

/** How long each part of the night takes to come, in milliseconds; then it waits for a tap. */
const DUSK_MS = 500;
const DARK_MS = 450;
const MOON_MS = 1200;

/** The phase (0 to 7, an index into MOON_PHASES) of the night after shift `shift`. */
export function moonPhase(shift: number): number {
  return (((shift - 1) % MOON_PHASES.length) + MOON_PHASES.length) % MOON_PHASES.length;
}

/**
 * Draw the moon on `ctx`, a square canvas `size` pixels wide, at `phase`:
 * 0 is new, 2 the first quarter, 4 full, 6 the last quarter; fractions are
 * in between (the animation turns it smoothly).
 */
export function drawMoon(ctx: CanvasRenderingContext2D, size: number, phase: number): void {
  // The disc, small enough that its glow (out to 1.6 r) fades out inside the canvas.
  const r = size * 0.3;
  const cx = size / 2;
  const cy = size / 2;
  const lit = '#f3ecd2';
  const dark = '#26293a';
  ctx.clearRect(0, 0, size, size);
  // A soft glow, stronger the fuller the moon.
  // The phase as an angle round the cycle, from 0 up to (not including) a full turn.
  const turn = Math.PI * 2;
  const angle = ((((phase / MOON_PHASES.length) * turn) % turn) + turn) % turn;
  const fullness = (1 - Math.cos(angle)) / 2;
  const glow = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.6);
  glow.addColorStop(0, `rgba(243, 236, 210, ${0.08 + 0.22 * fullness})`);
  glow.addColorStop(1, 'rgba(243, 236, 210, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  // The dark disc.
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // The lit half: the right side while waxing, the left while waning.
  const waxing = angle <= Math.PI;
  ctx.fillStyle = lit;
  ctx.beginPath();
  if (waxing) ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2);
  else ctx.arc(cx, cy, r, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.fill();
  // The terminator: an ellipse that eats into the lit half (a crescent) or
  // adds to it (gibbous). Its width is r * |cos(angle)|.
  const width = Math.abs(Math.cos(angle)) * r;
  const crescent = Math.cos(angle) > 0;
  ctx.fillStyle = crescent ? dark : lit;
  ctx.beginPath();
  ctx.ellipse(cx, cy, width, r, 0, 0, Math.PI * 2);
  ctx.fill();
  // A faint rim, so the new moon still shows.
  ctx.strokeStyle = 'rgba(243, 236, 210, 0.35)';
  ctx.lineWidth = Math.max(1, size * 0.006);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

/** A night being shown: `skip` ends it at once. */
export interface Night {
  skip: () => void;
}

export interface NightOptions {
  /** The shift that just ended. */
  shift: number;
  /** What the night brought ("Shift 3 over: paid 1 wood. It rained 🌧."), or ''. */
  summary: string;
  /** True if it rained this night: rain falls across the sky. */
  rain: boolean;
  /** The page behind the night: greyed, then covered; it takes no input meanwhile. */
  page: HTMLElement;
  /** Show the still version (prefers-reduced-motion). */
  reducedMotion: boolean;
  /** Called once, when the night is over (or skipped). */
  onDone: () => void;
}

/**
 * Show the night over `host` (see the top of this file). The overlay covers
 * the whole screen and takes every tap, so nothing behind it can be done
 * until it is over; a tap skips it.
 */
export function showNight(host: HTMLElement, options: NightOptions): Night {
  const phase = moonPhase(options.shift);
  const overlay = element('div', 'lab2-night');
  overlay.dataset['testid'] = 'lab2-night';
  overlay.dataset['phase'] = String(phase);
  overlay.dataset['night'] = String(options.shift);
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-label', `Night ${options.shift}: ${MOON_PHASES[phase] ?? ''}`);
  const sky = element('div', 'lab2-night-sky');
  const canvas = element('canvas', 'lab2-night-moon');
  canvas.dataset['testid'] = 'lab2-night-moon';
  const scale = window.devicePixelRatio || 1;
  const cssSize = 160;
  canvas.width = Math.round(cssSize * scale);
  canvas.height = Math.round(cssSize * scale);
  const title = element(
    'p',
    'lab2-night-title',
    options.rain ? `Night ${options.shift} · Rain 🌧` : `Night ${options.shift}`,
  );
  const phaseName = element('p', 'lab2-night-phase', MOON_PHASES[phase] ?? '');
  phaseName.dataset['testid'] = 'lab2-night-phase';
  // What the night brought, one sentence a line, so it can be read.
  const summary = element('div', 'lab2-night-summary');
  summary.dataset['testid'] = 'lab2-night-summary';
  for (const sentence of sentencesOf(options.summary)) {
    summary.append(element('p', 'lab2-night-line', sentence));
  }
  const tapOn = element('p', 'lab2-night-continue', 'Tap to continue');
  tapOn.dataset['testid'] = 'lab2-night-continue';
  sky.append(title, canvas, phaseName, summary, tapOn);
  if (options.rain) {
    // Rain: streaks falling over the whole sky, behind the words.
    const rain = element('div', 'lab2-night-rain');
    rain.dataset['testid'] = 'lab2-night-rain';
    overlay.dataset['rain'] = 'true';
    overlay.append(rain);
  }
  overlay.append(sky);
  host.append(overlay);

  const ctx = canvas.getContext('2d');
  const paint = (p: number): void => {
    if (ctx !== null) drawMoon(ctx, canvas.width, p);
  };
  // The page behind takes no input (keyboard included) while it is night.
  options.page.inert = true;

  const timers: number[] = [];
  let frame = 0;
  let done = false;
  const at = (ms: number, f: () => void): void => {
    timers.push(window.setTimeout(f, ms));
  };
  const finish = (): void => {
    if (done) return;
    done = true;
    for (const t of timers) window.clearTimeout(t);
    window.cancelAnimationFrame(frame);
    overlay.remove();
    options.page.classList.remove('lab2-dusk');
    options.page.inert = false;
    options.onDone();
  };
  // Skip on the click, at the end of the tap: skipping on pointerdown would
  // let the tap's end land on the map behind, and act there.
  overlay.addEventListener('click', (event) => {
    event.preventDefault();
    finish();
  });

  if (options.reducedMotion) {
    overlay.classList.add('lab2-night-still', 'lab2-night-dark', 'lab2-night-moonup');
    paint(phase);
    return { skip: finish };
  }

  // 1. Dusk: the page fades to black and white (a CSS transition on its filter).
  overlay.style.setProperty('--night-fade', `${DARK_MS}ms`);
  options.page.style.setProperty('--dusk-fade', `${DUSK_MS}ms`);
  options.page.classList.add('lab2-dusk');
  // 2. Dark.
  at(DUSK_MS, () => overlay.classList.add('lab2-night-dark'));
  // 3. The moon: its phase turns from last night's to tonight's.
  at(DUSK_MS + DARK_MS, () => {
    overlay.classList.add('lab2-night-moonup');
    const start = performance.now();
    const turn = MOON_MS * 0.6;
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / turn);
      const eased = 1 - (1 - t) * (1 - t);
      paint(phase - 1 + eased);
      if (t < 1 && !done) frame = window.requestAnimationFrame(step);
    };
    paint(phase - 1);
    frame = window.requestAnimationFrame(step);
  });
  // 4. It waits for a tap: "Tap to continue" shows once the moon has turned.
  at(DUSK_MS + DARK_MS + MOON_MS, () => overlay.classList.add('lab2-night-wait'));
  return { skip: finish };
}

/** `text` cut into its sentences: after each '.', '!' or '?' that a space follows. */
export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((t) => t.trim())
    .filter((t) => t !== '');
}
