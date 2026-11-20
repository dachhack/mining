// The early phone preview screen (issues #64 and #86). A throwaway screen
// that plays the current engine the way `npm run play` does: a top-down map
// to tap instead of "mine x,y" to type, and a button for each listed choice.
// M3 replaces it.
//
// It draws only from the player's view (`buildView` in text/view.ts, the
// same data the play tool prints from, and the map's tiles), and it changes
// the game only by taking a choice: one from that view's list, or the mine or
// cut a tap on the map stands for (`takeTurn`, which calls the engine's
// `applyAction` or `endShift`). It never edits the state itself.

import { CAMPS, CAMP_TOOLS, STRUCTURES } from '../data';
import { ENGINE_VERSION, countItem, isRunActive } from '../engine';
import {
  MAX_SEED,
  clearPrepared,
  clearSavedRun,
  loadPrepared,
  loadRun,
  parseSeed,
  randomSeed,
  saveRun,
  startRun,
} from './previewSession';
import type { SaveStore } from './previewSession';
import { createTapMap } from './map/mapView';
import { NO_MARKS, lookOutcome, tapOutcome } from './map/targets';
import type { MapMarks, MapSquare, MapTool } from './map/targets';
import type { LogEntry, Session } from './text/log';
import { takeTurnLines } from './text/turn';
import {
  FORECAST_HEADING_PHONE,
  HAZARDS_HEADING,
  KNOWN_BELOW_NOTE,
  buildView,
  renderEndedLines,
} from './text/view';
import type { ChoiceView, PlayerView } from './text/view';

/**
 * What the player is asked before the mine is closed. Closing the mine costs
 * nothing and ends the run, so the phone asks first: a stray tap on the
 * button must not end a run (issue #92).
 */
const CLOSE_MINE_QUESTION =
  'Close the mine? This ends the run now, alive, with what is in the stockpile.';

/**
 * What the player is asked before a camp is taken down: the kit is not given
 * back, so a stray tap must not cost a camp (issue #100).
 */
const DECOMMISSION_QUESTION =
  'Decommission this camp? Its cheaper mining, recipes and rest end, and the kit is not given back.';

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

/** The small print under a choice: its AP cost. (Its typed name is the play tool's.) */
function choiceMeta(choice: ChoiceView): string {
  return choice.ap === null ? 'no AP' : `${choice.ap} AP`;
}

/**
 * A heading and its items in `box`, replacing what was there: the heading
 * as a paragraph, and one list item for each line.
 */
function showList(box: HTMLElement, heading: string, items: string[]): void {
  const list = element('ul', 'lines');
  list.append(...items.map((item) => element('li', 'line', item)));
  box.replaceChildren(element('p', 'list-heading', heading), list);
  box.hidden = false;
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
  // The map: the whole surface from above. Drag to pan, pinch to zoom, tap a
  // square to mine it or cut its tree (issue #86).
  const tapMap = createTapMap(
    (x, y) => {
      tapSquare(x, y);
    },
    (x, y) => {
      holdSquare(x, y);
    },
  );
  // The tool bar (design doc 11): what a tap on the map does. Each button is
  // a toggle: with one on, a tap places a support (issue #94), founds a camp
  // (issue #100), places a pump, seals, scans, or lists what is known of the
  // square (issue #104); with all off, a tap mines or cuts.
  const toolBar = element('section', 'tool-bar');
  toolBar.setAttribute('aria-label', 'Tools: what a tap on the map does');
  /** One button of the tool bar. */
  function toolButton(testId: string): HTMLButtonElement {
    const made = element('button', 'small tool');
    made.type = 'button';
    made.dataset['testid'] = testId;
    return made;
  }
  const supportTool = toolButton('tool-support');
  const campTool = toolButton('tool-camp');
  const explosiveTool = toolButton('tool-explosive');
  const pumpTool = toolButton('tool-pump');
  const ventTool = toolButton('tool-vent');
  const sealTool = toolButton('tool-seal');
  const scanTool = toolButton('tool-scan');
  const lookTool = toolButton('tool-look');
  const toolHint = element('span', 'tool-hint');
  toolHint.dataset['testid'] = 'tool-hint';
  toolBar.append(
    supportTool,
    campTool,
    explosiveTool,
    pumpTool,
    ventTool,
    sealTool,
    scanTool,
    lookTool,
    toolHint,
  );
  // What the map cannot show.
  const mapNotes = element('section', 'map-notes');
  mapNotes.dataset['testid'] = 'map-notes';
  const forecast = element('section', 'forecast');
  forecast.dataset['testid'] = 'forecast';
  const hazards = element('section', 'forecast');
  hazards.dataset['testid'] = 'hazards';
  const notOffered = element('section', 'forecast');
  notOffered.dataset['testid'] = 'not-offered';
  const outcome = element('section', 'outcome');
  outcome.dataset['testid'] = 'outcome';
  // End shift: an explicit button of its own, right under the map (design
  // doc 11).
  const endShiftButton = element('button', 'end-shift', 'End shift');
  endShiftButton.type = 'button';
  endShiftButton.dataset['testid'] = 'end-shift';
  // The warning shown over the button when ending the shift would or may
  // lose the run (the engine's forecast; issue #112). The first tap on End
  // shift then only shows it; a second tap ends the shift.
  const endShiftWarning = element('section', 'end-shift-warning');
  endShiftWarning.dataset['testid'] = 'end-shift-warning';
  endShiftWarning.setAttribute('role', 'alert');
  endShiftWarning.hidden = true;
  // The other listed choices, folded away: the map covers mining and
  // cutting, and this list has crafting and leaving.
  const allActions = element('details', 'all-actions');
  const actionsHeading = element('summary', 'actions-heading', 'Other actions');
  const actions = element('section', 'actions');
  actions.dataset['testid'] = 'actions';
  allActions.append(actionsHeading, actions);

  // The map comes first, so that it is on the first screen of a phone. The
  // tool bar and what came of the last tap or choice sit under it, so that
  // the map does not move under the finger when their text changes length.
  page.append(
    header,
    note,
    playTop,
    gauges,
    ended,
    tapMap.element,
    toolBar,
    outcome,
    endShiftWarning,
    endShiftButton,
    forecast,
    hazards,
    notOffered,
    mapNotes,
    allActions,
    tapMap.legend,
  );
  root.replaceChildren(page);

  // ----- The run -----
  // `session` is replaced on a new run or restart; `lastLines` holds what
  // came of the last tap or choice, and `marks` what a refused tap marks on
  // the map (cleared by the next tap or choice).
  // A prepared state (a test's, or for screenshots: see `PREPARED_KEY`) comes
  // before the saved run, and is never saved over it.
  const prepared = loadPrepared(store);
  let saving = prepared === null;
  const loaded =
    prepared === null
      ? loadRun(store)
      : {
          session: prepared,
          note: 'A prepared state, for tests and screenshots. It is not saved.',
        };
  let session: Session = loaded.session ?? startRun(randomSeed(Math.random));
  let lastLines: string[] = [];
  let marks: MapMarks = NO_MARKS;
  // What a tap on the map does, and the square of a risky mine that is
  // waiting for its second tap (`null` when none is).
  let tool: MapTool = 'dig';
  let pending: MapSquare | null = null;
  // The warning of a lost run, as last drawn (`null` when there is none),
  // and whether End shift has been tapped once and waits for the second tap.
  let lostWarning: string | null = null;
  let endShiftAsked = false;
  note.textContent = loaded.note ?? '';
  note.hidden = loaded.note === null;
  if (loaded.session === null) {
    saveRun(store, session);
  }

  /**
   * Redraw everything from the player's view of the current state. `fresh`
   * is true for a new or resumed run: the map then centres on its middle.
   */
  function draw(fresh: boolean): void {
    const view: PlayerView = buildView(session.state, {
      deepestDepth: session.deepestDepth,
      audience: 'phone',
    });
    seedText.textContent = `Seed ${session.log.seed}`;
    showLines(gauges, view.hud);
    showLines(ended, renderEndedLines(view));
    tapMap.show(session.state, fresh, marks);
    // The phone lists a square's known blocks by a hold or the Inspect tool.
    showLines(
      mapNotes,
      view.notes.map((note) =>
        note.startsWith(KNOWN_BELOW_NOTE)
          ? `${note} Hold a square, or tap it with Inspect, to list what you know under it.`
          : note,
      ),
    );
    if (view.ended === null) {
      // What ending the shift will do, one line each, most dangerous first;
      // then the hazards and their countdowns; then what AP is missing for.
      showList(forecast, FORECAST_HEADING_PHONE, view.forecastLines);
      if (view.hazards.length === 0) {
        showLines(hazards, [`${HAZARDS_HEADING} none known`]);
      } else {
        showList(hazards, HAZARDS_HEADING, view.hazards);
      }
      showLines(
        notOffered,
        view.notOffered.map((line) => `Not possible now: ${line}`),
      );
    } else {
      showLines(forecast, []);
      showLines(hazards, []);
      showLines(notOffered, []);
    }
    showLines(outcome, lastLines);

    // The tool bar: how many supports there are, and what a tap does now.
    const supportsHeld = countItem(session.state, STRUCTURES.support.placedFromItem);
    supportTool.textContent = `Support (${supportsHeld})`;
    supportTool.setAttribute('aria-pressed', tool === 'support' ? 'true' : 'false');
    supportTool.classList.toggle('on', tool === 'support');
    const kitsHeld = countItem(session.state, CAMPS.kitItem);
    campTool.textContent = `Camp (${kitsHeld})`;
    campTool.setAttribute('aria-pressed', tool === 'camp' ? 'true' : 'false');
    campTool.classList.toggle('on', tool === 'camp');
    // With no kit there is nothing to found: the button is not shown.
    campTool.hidden = kitsHeld === 0;
    // The camp-made tools (issues #103 and #104): each button shows how many
    // are held, and is not shown while there is none.
    const held = heldTools();
    /** Set one tool button's words, whether it is on, and whether it shows. */
    const showTool = (
      toolButtonEl: HTMLButtonElement,
      name: MapTool,
      text: string,
      show: boolean,
    ) => {
      toolButtonEl.textContent = text;
      toolButtonEl.setAttribute('aria-pressed', tool === name ? 'true' : 'false');
      toolButtonEl.classList.toggle('on', tool === name);
      toolButtonEl.hidden = !show;
    };
    const explosivesHeld = countItem(session.state, STRUCTURES.explosive.placedFromItem);
    showTool(
      explosiveTool,
      'explosive',
      `Explosive (${explosivesHeld})`,
      explosivesHeld > 0 || tool === 'explosive',
    );
    showTool(pumpTool, 'pump', `Pump (${held.pumps})`, held.pumps > 0);
    showTool(ventTool, 'vent', `Vent (${held.vents})`, held.vents > 0);
    showTool(sealTool, 'seal', `Seal (${held.sealant})`, held.sealant > 0);
    showTool(scanTool, 'scan', `Scan (${held.charges})`, held.charges > 0);
    showTool(lookTool, 'look', 'Inspect', true);
    toolBar.hidden = view.ended !== null;
    if (tool === 'explosive') {
      toolHint.textContent =
        'A tap shows the blast of an explosive; a second tap on the square places it. Tap the button again to go back to mining.';
    } else if (tool === 'support') {
      toolHint.textContent = 'A tap places a support. Tap the button again to go back to mining.';
    } else if (tool === 'camp') {
      toolHint.textContent =
        'Tap the centre of a flat 3 x 3 patch to found a camp there. It takes the rest of the shift.';
    } else if (tool === 'pump') {
      toolHint.textContent =
        'Tap a square to see what a pump there would reach; tap it again to place the pump.';
    } else if (tool === 'vent') {
      toolHint.textContent =
        'Tap a square to see which squares a vent there would clear of gas; tap it again to place the vent.';
    } else if (tool === 'seal') {
      toolHint.textContent =
        'A tap puts a block of sealed rock on a dug square: it comes up 1 level, and the water, lava and gas on it are destroyed.';
    } else if (tool === 'scan') {
      toolHint.textContent =
        'Tap a square to see which squares a scan there would look under; tap it again to scan.';
    } else if (tool === 'look') {
      toolHint.textContent =
        'A tap lists what you know of a square, and changes nothing. Holding a square does the same with any tool.';
    } else if (supportsHeld === 0) {
      toolHint.textContent = 'A tap mines or cuts. Craft a support to place one.';
    } else {
      toolHint.textContent = 'A tap mines or cuts.';
    }

    // End shift has its own button; it is hidden once the run is over.
    endShiftButton.hidden = view.ended !== null;
    // If the run would or may be lost, the button says so and turns red;
    // after the first tap the full warning stands over it.
    lostWarning = view.crewLostWarning;
    if (lostWarning === null) {
      endShiftAsked = false;
    }
    endShiftButton.classList.toggle('danger', lostWarning !== null);
    if (lostWarning === null) {
      endShiftButton.textContent = 'End shift';
    } else if (endShiftAsked) {
      endShiftButton.textContent = 'Tap again to end the shift anyway';
    } else {
      endShiftButton.textContent = lostWarning.startsWith('THE RUN WILL')
        ? 'End shift (THE RUN WILL BE LOST)'
        : 'End shift (the run may be lost)';
    }
    endShiftWarning.hidden = !(endShiftAsked && lostWarning !== null);
    endShiftWarning.textContent =
      lostWarning === null
        ? ''
        : `${lostWarning} The red frames on the map show where the crew will be hurt (dashed: may be hurt); ` +
          'the list below says by what. Tap End shift again to end it anyway, or do something else.';

    // One button per other choice on the list, in the list's order.
    const others = view.choices.filter((choice) => choice.entry.type !== 'endShift');
    const buttons = others.map((choice) => {
      const button = element('button', 'choice');
      button.type = 'button';
      button.dataset['choice'] = choice.name;
      button.append(
        element('span', 'choice-text', choice.text),
        element('span', 'choice-meta', choiceMeta(choice)),
      );
      button.addEventListener('click', () => {
        // Closing the mine ends the run: ask first, so that a stray tap
        // does not end it (issue #92).
        const closing = choice.entry.type === 'closeMine';
        if (closing && !window.confirm(CLOSE_MINE_QUESTION)) {
          return;
        }
        // Taking a camp down loses its kit: ask first, too.
        const decommissioning = choice.entry.type === 'decommissionCamp';
        if (decommissioning && !window.confirm(DECOMMISSION_QUESTION)) {
          return;
        }
        take(choice.entry, true);
      });
      return button;
    });
    actions.replaceChildren(...buttons);
    actionsHeading.textContent = `Other actions (${buttons.length})`;
    allActions.hidden = buttons.length === 0;
  }

  /** How many of each camp-made tool the stockpile holds. */
  function heldTools(): { pumps: number; vents: number; sealant: number; charges: number } {
    return {
      vents: countItem(session.state, STRUCTURES.vent.placedFromItem),
      pumps: countItem(session.state, STRUCTURES.pump.placedFromItem),
      sealant: countItem(session.state, CAMP_TOOLS.sealantItem),
      charges: countItem(session.state, CAMP_TOOLS.scanChargeItem),
    };
  }

  /**
   * The player held the square (x, y): list what is known of it, the blocks
   * a scan showed under it included (design doc 7.2). Nothing is done.
   */
  function holdSquare(x: number, y: number): void {
    const looked = lookOutcome(session.state, x, y);
    lastLines = looked.lines;
    marks = looked.marks;
    pending = null;
    draw(false);
  }

  /**
   * A tap on the square (x, y) of the map: mine it, or cut its tree; with
   * the support tool on, place a support there; with the camp tool on, found
   * a camp round it. A tap the rules refuse
   * changes nothing: the reason is shown under the map, and the map marks the
   * square and, for the level rule, the neighbours that are too high. A mine
   * that would make squares unstable is not taken at the first tap either:
   * the map marks those squares, and a second tap on the square takes it.
   */
  function tapSquare(x: number, y: number): void {
    if (!isRunActive(session.state)) {
      return;
    }
    // A second tap in a row on the same square confirms a risky mine, and
    // takes a pump, a vent or a scan whose range the first tap showed.
    endShiftAsked = false; // a tap on the map is "something else"
    const confirmed = pending !== null && pending.x === x && pending.y === y;
    const outcome = tapOutcome(session.state, x, y, tool, confirmed);
    if (outcome.entry !== null) {
      take(outcome.entry, false);
      return;
    }
    lastLines = outcome.lines;
    marks = outcome.marks;
    pending = outcome.needsConfirm ? { x, y } : null;
    draw(false);
  }

  /**
   * Take one choice (from the list or the map), save, and redraw. From the
   * list the page scrolls back up to the gauges and the map; a tap on the
   * map leaves the page where it is.
   */
  function take(entry: LogEntry, fromList: boolean): void {
    if (!isRunActive(session.state)) {
      return;
    }
    marks = NO_MARKS;
    pending = null;
    endShiftAsked = false;
    try {
      lastLines = takeTurnLines(session, entry, 'phone');
    } catch (error) {
      // Should not happen: the choice came from the list of legal choices,
      // or from a tap the rules had just allowed.
      lastLines = [`That could not be done: ${error instanceof Error ? error.message : ''}`];
    }
    // With the last support placed, or the last camp kit used, a tap goes
    // back to mining.
    if (tool === 'support' && countItem(session.state, STRUCTURES.support.placedFromItem) === 0) {
      tool = 'dig';
    }
    if (tool === 'camp' && countItem(session.state, CAMPS.kitItem) === 0) {
      tool = 'dig';
    }
    const held = heldTools();
    if (
      (tool === 'explosive' &&
        countItem(session.state, STRUCTURES.explosive.placedFromItem) === 0) ||
      (tool === 'pump' && held.pumps === 0) ||
      (tool === 'vent' && held.vents === 0) ||
      (tool === 'seal' && held.sealant === 0) ||
      (tool === 'scan' && held.charges === 0)
    ) {
      tool = 'dig';
    }
    note.hidden = true;
    if (saving) {
      saveRun(store, session);
    }
    draw(false);
    if (fromList) {
      playTop.scrollIntoView({ block: 'start' });
    }
  }

  /** Start a new run on `seed`, replacing the saved one. */
  function begin(seed: number, message: string): void {
    clearSavedRun(store);
    clearPrepared(store);
    saving = true;
    session = startRun(seed);
    lastLines = [];
    marks = NO_MARKS;
    tool = 'dig';
    pending = null;
    endShiftAsked = false;
    saveRun(store, session);
    note.textContent = message;
    note.hidden = false;
    newRunForm.hidden = true;
    draw(true);
    window.scrollTo(0, 0);
  }

  // Each tool button turns its tool on, or off again (back to mining).
  const toolButtons: [HTMLButtonElement, MapTool][] = [
    [supportTool, 'support'],
    [campTool, 'camp'],
    [explosiveTool, 'explosive'],
    [pumpTool, 'pump'],
    [ventTool, 'vent'],
    [sealTool, 'seal'],
    [scanTool, 'scan'],
    [lookTool, 'look'],
  ];
  for (const [toolButtonEl, name] of toolButtons) {
    toolButtonEl.addEventListener('click', () => {
      tool = tool === name ? 'dig' : name;
      marks = NO_MARKS;
      pending = null;
      endShiftAsked = false;
      draw(false);
    });
  }

  endShiftButton.addEventListener('click', () => {
    // A shift that would or may lose the run needs a second tap (issue #112).
    if (lostWarning !== null && !endShiftAsked) {
      endShiftAsked = true;
      draw(false);
      endShiftWarning.scrollIntoView({ block: 'nearest' });
      return;
    }
    take({ type: 'endShift' }, false);
  });

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
      seedError.textContent = `The seed must be a whole number from 0 to ${MAX_SEED}.`;
      seedError.hidden = false;
      return;
    }
    begin(seed, `New run: seed ${seed}.`);
  });

  draw(true);
}
