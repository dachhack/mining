// The start screen (issue #116): the real game, and the UI labs beside it.
//
// The page shows one screen at a time, chosen by the address's "hash" (the
// part after #), so the phone's back button and a bookmark both work:
//
//   (none)       the start screen
//   #game        the game (the phone preview, unchanged)
//   #lab1        UI lab 1; #lab1/110 opens it on seed 110
//
// Changing screens reloads the page, so each screen starts clean and none of
// them has to tidy up after itself. Later labs add a button and a hash here.

import { ENGINE_VERSION } from '../engine';
import { mountLab } from './lab/labScreen';
import { mountPreview } from './preview';
import { parseSeed } from './previewSession';

/** One button on the start screen. */
interface LaunchEntry {
  hash: string;
  title: string;
  blurb: string;
  testid: string;
}

const ENTRIES: LaunchEntry[] = [
  {
    hash: 'game',
    title: 'Game',
    blurb: 'The current preview: shifts, AP, hazards, camps.',
    testid: 'launch-game',
  },
  {
    hash: 'lab1',
    title: 'Lab 1',
    blurb: 'Plain blocks. Tap to mine, height shadows, no turns.',
    testid: 'launch-lab1',
  },
];

/** Go to the screen for `hash` ('' is the start screen). */
function go(hash: string): void {
  window.location.hash = hash;
}

/** Make an element with a class and, optionally, its text. */
function element<K extends keyof HTMLElementTagNameMap>(
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

function mountStart(root: HTMLElement): void {
  const page = element('main', 'launch');
  page.dataset['testid'] = 'launcher';
  const hero = element('header', 'launch-hero');
  hero.append(
    element('h1', 'launch-title', 'Mining Game'),
    element('p', 'launch-sub', `Pick a version to try · Engine v${ENGINE_VERSION}`),
  );
  const list = element('nav', 'launch-list');
  for (const entry of ENTRIES) {
    const button = element('button', 'launch-card');
    button.type = 'button';
    button.dataset['testid'] = entry.testid;
    button.append(
      element('span', 'launch-card-title', entry.title),
      element('span', 'launch-card-blurb', entry.blurb),
      element('span', 'launch-card-arrow', '›'),
    );
    button.addEventListener('click', () => go(entry.hash));
    list.append(button);
  }
  page.append(hero, list);
  root.replaceChildren(page);
}

function mountGame(root: HTMLElement): void {
  const bar = element('nav', 'launch-back-bar');
  const back = element('button', 'launch-back', '‹ Start screen');
  back.type = 'button';
  back.dataset['testid'] = 'back-to-start';
  back.addEventListener('click', () => go(''));
  bar.append(back);
  const game = element('div', 'launch-game');
  root.replaceChildren(bar, game);
  mountPreview(game);
}

/** Show the screen the address names. */
function show(root: HTMLElement): void {
  const hash = window.location.hash.replace(/^#/, '');
  const [name, seedText] = hash.split('/');
  document.body.dataset['screen'] = name || 'start';
  if (name === 'game') {
    mountGame(root);
  } else if (name === 'lab1') {
    const seed = seedText === undefined ? null : parseSeed(seedText);
    mountLab(root, seed, () => go(''));
  } else {
    mountStart(root);
  }
}

/** Show the screen for the address now, and again (after a reload) whenever it changes. */
export function mountLauncher(root: HTMLElement): void {
  show(root);
  window.addEventListener('hashchange', () => {
    window.location.reload();
  });
}
