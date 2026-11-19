// The early phone preview screen (issue #64). A throwaway screen that plays
// the current engine the way `npm run play` does, with a button to tap for
// each choice instead of a number to type. M3 replaces it.
//
// It draws only from the player's view (`buildView` in text/view.ts), the
// same data the play tool prints from, and it changes the game only by
// taking a choice from that view's list (`takeTurn`, which calls the
// engine's `applyAction` or `endShift`). It never edits the state itself.

import { ENGINE_VERSION, isRunActive } from '../engine';
import { clearSavedRun, loadRun, parseSeed, randomSeed, saveRun, startRun } from './previewSession';
import type { SaveStore } from './previewSession';
import type { Session } from './text/log';
import { takeTurn } from './text/turn';
import {
  DEFAULT_LAYERS,
  buildView,
  forecastLine,
  hazardsLine,
  renderEndedLines,
  renderMap,
} from './text/view';
import type { ChoiceView, PlayerView } from './text/view';

/**
 * The browser's `localStorage`, or `null` if it cannot be used. Merely
 * reading `window.localStorage` throws in some browsers when storage is
 * turned off, hence the try/catch.
 */
function browserStore(): SaveStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
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
    // `textContent`, never `innerHTML`: game text is shown as text, not markup.
    made.textContent = text;
  }
  return made;
}

/** One paragraph per line of text, in `box`, replacing what was there. */
function showLines(box: HTMLElement, lines: string[]): void {
  box.replaceChildren(...lines.map((line) => element('p', 'line', line)));
  box.hidden = lines.length === 0;
}

/** The small print under a choice: its name and its AP cost. */
function choiceMeta(choice: ChoiceView): string {
  const cost = choice.ap === null ? 'no AP' : `${choice.ap} AP`;
  return `${choice.name} · ${cost}`;
}

/** Build the screen inside `root` and start (or resume) a run. */
export function mountPreview(root: HTMLElement): void {
  const store = browserStore();

  // ----- The fixed parts of the page -----
  const page = element('main', 'preview');

  const header = element('header', 'top');
  header.append(element('h1', 'title', 'Mining Game'));
  const status = element('p', 'status', `Early preview · Engine v${ENGINE_VERSION}`);
  status.dataset['testid'] = 'status';
  header.append(status);

  const runBar = element('div', 'run-bar');
  const seedText = element('span', 'seed');
  seedText.dataset['testid'] = 'seed';
  const restartButton = element('button', 'small', 'Restart');
  restartButton.type = 'button';
  const newRunButton = element('button', 'small', 'New run');
  newRunButton.type = 'button';
  runBar.append(seedText, restartButton, newRunButton);
  header.append(runBar);

  // The "new run" form: a seed field, filled with a random seed to start with.
  const newRunForm = element('form', 'new-run');
  newRunForm.hidden = true;
  const seedLabel = element('label', 'seed-label', 'Seed ');
  const seedInput = element('input', 'seed-input');
  seedInput.inputMode = 'numeric';
  seedInput.autocomplete = 'off';
  seedLabel.append(seedInput);
  const startButton = element('button', 'small', 'Start run');
  startButton.type = 'submit';
  const cancelButton = element('button', 'small', 'Cancel');
  cancelButton.type = 'button';
  const seedError = element('p', 'error');
  seedError.hidden = true;
  newRunForm.append(seedLabel, startButton, cancelButton, seedError);
  header.append(newRunForm);

  const note = element('p', 'note');
  note.dataset['testid'] = 'note';

  // After each choice the page scrolls back to here, so the gauges, what
  // came of the choice and the map are in sight together.
  const playTop = element('div', 'play-top');
  // The gauges stay at the top of the screen while the rest scrolls.
  const gauges = element('section', 'gauges');
  gauges.dataset['testid'] = 'gauges';

  const ended = element('section', 'ended');
  ended.dataset['testid'] = 'ended';
  // The map: its header and legend wrap; the grid keeps its text layout and
  // scrolls sideways inside its own box.
  const map = element('section', 'map-box');
  map.dataset['testid'] = 'map';
  const mapHeader = element('p', 'map-text');
  const mapGrid = element('pre', 'map');
  const mapAfter = element('div', 'map-text');
  map.append(mapHeader, mapGrid, mapAfter);
  const forecast = element('section', 'forecast');
  forecast.dataset['testid'] = 'forecast';
  const outcome = element('section', 'outcome');
  outcome.dataset['testid'] = 'outcome';
  const actionsHeading = element('h2', 'actions-heading', 'Actions');
  const actions = element('section', 'actions');
  actions.dataset['testid'] = 'actions';

  page.append(
    header,
    note,
    playTop,
    gauges,
    ended,
    outcome,
    map,
    forecast,
    actionsHeading,
    actions,
  );
  root.replaceChildren(page);

  // ----- The run -----
  // `session` is replaced on a new run or restart; `lastLines` holds what
  // came of the last choice.
  const loaded = loadRun(store);
  let session: Session = loaded.session ?? startRun(randomSeed(Math.random));
  let lastLines: string[] = [];
  note.textContent = loaded.note ?? '';
  note.hidden = loaded.note === null;
  if (loaded.session === null) {
    saveRun(store, session);
  }

  /** Redraw everything from the player's view of the current state. */
  function draw(): void {
    const view: PlayerView = buildView(session.state, {
      // `null`: let the view choose, as the play tool does with no --radius.
      radius: null,
      layers: DEFAULT_LAYERS,
      deepestZ: session.deepestZ,
    });
    seedText.textContent = `Seed ${session.log.seed}`;
    showLines(gauges, view.hud);
    showLines(ended, renderEndedLines(view));
    const mapText = renderMap(view);
    mapHeader.textContent = mapText.header;
    mapGrid.textContent = mapText.grid.join('\n');
    showLines(mapAfter, mapText.after);
    if (view.ended === null) {
      const notOffered = view.notOffered.map((line) => `Not on the list: ${line}`);
      showLines(forecast, [hazardsLine(view), forecastLine(view), ...notOffered]);
    } else {
      showLines(forecast, []);
    }
    showLines(outcome, lastLines);

    // One button per choice on the list, in the list's order.
    const buttons = view.choices.map((choice) => {
      const button = element('button', 'choice');
      button.type = 'button';
      button.dataset['choice'] = choice.name;
      button.append(
        element('span', 'choice-text', choice.text),
        element('span', 'choice-meta', choiceMeta(choice)),
      );
      button.addEventListener('click', () => {
        take(choice);
      });
      return button;
    });
    actions.replaceChildren(...buttons);
    actionsHeading.hidden = buttons.length === 0;
  }

  /** Take one choice from the list, save, and redraw. */
  function take(choice: ChoiceView): void {
    if (!isRunActive(session.state)) {
      return;
    }
    try {
      lastLines = [takeTurn(session, choice.entry)];
    } catch (error) {
      // Should not happen: the button came from the list of legal choices.
      lastLines = [`That could not be done: ${error instanceof Error ? error.message : ''}`];
    }
    note.hidden = true;
    saveRun(store, session);
    draw();
    playTop.scrollIntoView({ block: 'start' });
  }

  /** Start a new run on `seed`, replacing the saved one. */
  function begin(seed: number, message: string): void {
    clearSavedRun(store);
    session = startRun(seed);
    lastLines = [];
    saveRun(store, session);
    note.textContent = message;
    note.hidden = false;
    newRunForm.hidden = true;
    draw();
    window.scrollTo(0, 0);
  }

  // ----- The buttons of the run bar -----
  restartButton.addEventListener('click', () => {
    // Ask first while the run is going: a mis-tap would lose it.
    if (isRunActive(session.state) && session.log.actions.length > 0) {
      if (!window.confirm('Restart this run from the start? What you have done is lost.')) {
        return;
      }
    }
    begin(session.log.seed, `Restarted: seed ${session.log.seed}.`);
  });
  newRunButton.addEventListener('click', () => {
    seedInput.value = String(randomSeed(Math.random));
    seedError.hidden = true;
    newRunForm.hidden = false;
    seedInput.focus();
  });
  cancelButton.addEventListener('click', () => {
    newRunForm.hidden = true;
  });
  newRunForm.addEventListener('submit', (event) => {
    // Stop the browser from reloading the page, which is what a form does by default.
    event.preventDefault();
    const seed = parseSeed(seedInput.value);
    if (seed === null) {
      seedError.textContent = 'The seed must be a whole number from 0 to 4294967295.';
      seedError.hidden = false;
      return;
    }
    begin(seed, `New run: seed ${seed}.`);
  });

  draw();
}
