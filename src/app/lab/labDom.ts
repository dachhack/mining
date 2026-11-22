// UI labs (issues #116 and #118): the page parts Lab 1 and Lab 2 share: the
// title bar, the resource counter, the key of block kinds, and small helpers.

import { blockDefByCode } from '../../data';
import { LAB_LOOK } from './labLook';
import type { LabWorld } from './labWorld';
import { resourceEntries } from './resources';
import { textureFor } from './textures';

/** Make an element with a class and, optionally, its text (as text, never as markup). */
export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.className = className;
  if (text !== undefined) {
    made.textContent = text;
  }
  return made;
}

/** Make a button (`type="button"`, so it never submits anything). */
export function button(className: string, text: string): HTMLButtonElement {
  const made = element('button', className, text);
  made.type = 'button';
  return made;
}

/** A small canvas showing block `code`'s texture: the icon of a counter entry or a key entry. */
export function blockIcon(code: number, className: string): HTMLCanvasElement {
  const icon = element('canvas', className);
  const texture = textureFor(code, 0, 0);
  icon.width = LAB_LOOK.texturePx;
  icon.height = LAB_LOOK.texturePx;
  const ctx = icon.getContext('2d');
  if (ctx !== null && texture !== null) {
    ctx.drawImage(texture, 0, 0);
  }
  return icon;
}

/** The title bar: a back button, the lab's title and subtitle, the seed, and a "New world" button. */
export interface LabTopBar {
  bar: HTMLElement;
  seedText: HTMLElement;
  newWorld: HTMLButtonElement;
}

export function labTopBar(title: string, subtitle: string, onBack: () => void): LabTopBar {
  const bar = element('header', 'lab-top');
  const back = button('lab-back', '‹');
  back.setAttribute('aria-label', 'Back to the start screen');
  back.addEventListener('click', onBack);
  // Two short lines, each cut off with "…" rather than wrapped, so the bar is
  // always one row high (owner, question 137): the title, then the subtitle
  // and the seed.
  const titleBox = element('div', 'lab-title-box');
  const seedText = element('span', 'lab-seed');
  seedText.dataset['testid'] = 'lab-seed';
  const subline = element('p', 'lab-subline');
  subline.append(element('span', 'lab-subtitle', subtitle), ' · ', seedText);
  titleBox.append(element('h1', 'lab-title', title), subline);
  const newWorld = button('lab-new', 'New world');
  bar.append(back, titleBox, newWorld);
  return { bar, seedText, newWorld };
}

/** An empty resource counter: one row of chips at a fixed height. */
export function labCounter(): HTMLElement {
  const counter = element('section', 'lab-counter');
  counter.dataset['testid'] = 'lab-counter';
  counter.setAttribute('aria-label', 'Resources collected');
  return counter;
}

/** Fill the counter: "Dug" first, then one chip per resource collected. */
export function showCounter(counter: HTMLElement, world: LabWorld): void {
  const dug = element('div', 'lab-chip lab-chip-dug');
  dug.dataset['testid'] = 'lab-dug';
  dug.dataset['count'] = String(world.mined);
  dug.append(
    element('span', 'lab-chip-glyph', '⛏'),
    element('span', 'lab-chip-count', String(world.mined)),
    element('span', 'lab-chip-name', 'Dug'),
  );
  const chips: HTMLElement[] = [dug];
  for (const entry of resourceEntries(world.counts)) {
    const chip = element('div', 'lab-chip');
    chip.dataset['testid'] = `lab-res-${entry.item}`;
    chip.dataset['count'] = String(entry.count);
    chip.title = entry.name;
    chip.append(
      blockIcon(entry.iconBlock, 'lab-chip-icon'),
      element('span', 'lab-chip-count', String(entry.count)),
      element('span', 'lab-chip-name', entry.name),
    );
    chips.push(chip);
  }
  counter.replaceChildren(...chips);
}

/** An empty key of block kinds: one row at a fixed height. */
export function labKey(): HTMLElement {
  const key = element('section', 'lab-key');
  key.setAttribute('aria-label', 'Blocks on the map');
  return key;
}

/** Fill the key: each block kind in `codes` once, in code order, with its name. */
export function showKey(key: HTMLElement, codes: Iterable<number>): void {
  const sorted = [...new Set(codes)].sort((a, b) => a - b);
  key.replaceChildren(
    ...sorted.map((code) => {
      const entry = element('span', 'lab-key-entry');
      entry.append(
        blockIcon(code, 'lab-key-icon'),
        element('span', 'lab-key-name', blockDefByCode(code).name),
      );
      return entry;
    }),
  );
}

/** The display name of an item (from the data), for a "+1 Coal" label. */
export function resourceName(item: string): string {
  return resourceEntries(new Map([[item, 1]]))[0]?.name ?? item;
}

/** The "+1 Stone  +1 Coal" label for what a mine gave. */
export function gainLabel(yields: { item: string; count: number }[]): string {
  return yields.map((stack) => `+${stack.count} ${resourceName(stack.item)}`).join('  ');
}
