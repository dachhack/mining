// The screens (issue #116; Lab 2 becomes the game, plan B1).
//
// The page shows one screen at a time, chosen by the address's "hash" (the
// part after #), so the phone's back button and a bookmark both work:
//
//   (none), #play  the game: Lab 2's screen, saved every shift and carried
//                  on when the app opens again; #play/110 starts a new run on seed 110
//   #versions      the other versions, kept until the old ones are removed (plan C1)
//   #game          the old game (the phone preview, unchanged)
//   #lab1          UI lab 1; #lab1/110 opens it on seed 110
//   #lab2          UI lab 2, the game's screen as a sandbox: nothing saved; #lab2/110 on seed 110
//
// Changing screens reloads the page, so each screen starts clean and none of
// them has to tidy up after itself. Later labs add a button and a hash here.

import { ENGINE_VERSION } from '../engine';
import { mountCampLab } from './lab/campScreen';
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
    hash: 'play',
    title: 'The game',
    blurb: 'Camps, fog and shifts: your saved run.',
    testid: 'launch-play',
  },
  {
    hash: 'game',
    title: 'Old game',
    blurb: 'The old preview: AP, hazards, the old camps. Kept until the new game is settled.',
    testid: 'launch-game',
  },
  {
    hash: 'lab1',
    title: 'Lab 1',
    blurb: 'Plain blocks. Tap to mine, height shadows, no turns.',
    testid: 'launch-lab1',
  },
  {
    hash: 'lab2',
    title: 'Lab 2',
    blurb: 'The game’s screen as a sandbox: a fresh world each time, nothing saved.',
    testid: 'launch-lab2',
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
    element('h1', 'launch-title', 'Other versions'),
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
  const back = element('button', 'launch-back', '‹ Other versions');
  back.type = 'button';
  back.dataset['testid'] = 'back-to-start';
  back.addEventListener('click', () => go('versions'));
  bar.append(back);
  const game = element('div', 'launch-game');
  root.replaceChildren(bar, game);
  mountPreview(game);
}

/** Show the screen the address names. */
function show(root: HTMLElement): void {
  const hash = window.location.hash.replace(/^#/, '');
  const [name, seedText] = hash.split('/');
  const seed = seedText === undefined ? null : parseSeed(seedText);
  document.body.dataset['screen'] = name || 'play';
  if (name === 'versions') {
    mountStart(root);
  } else if (name === 'game') {
    mountGame(root);
  } else if (name === 'lab1') {
    mountLab(root, seed, () => go('versions'));
  } else if (name === 'lab2') {
    mountCampLab(root, seed, () => go('versions'));
  } else {
    // No hash, #play, or anything unknown: the game.
    mountCampLab(root, name === 'play' ? seed : null, () => go('versions'), true);
  }
}

/** Show the screen for the address now, and again (after a reload) whenever it changes. */
export function mountLauncher(root: HTMLElement): void {
  show(root);
  window.addEventListener('hashchange', () => {
    window.location.reload();
  });
}
