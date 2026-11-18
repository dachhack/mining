// Tests for the text play interface (tools/play.ts, issue #9).
//
// The two things that matter most are tested first: the view shows nothing
// the avatar could not know, and the printed action list is exactly the
// engine's legal actions plus "end shift".

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BLOCKS, STRUCTURES } from '../../src/data';
import type { Vec3 } from '../../src/data';
import {
  applyAction,
  cellIndex,
  cellPosition,
  createRun,
  endShift,
  hashState,
  isRevealed,
  legalActions,
} from '../../src/engine';
import type { GameState } from '../../src/engine';
import { loadLog, runCli } from '../../tools/play/cli';
import { describeEvents } from '../../tools/play/describe';
import { helpText } from '../../tools/play/help';
import { replayLog } from '../../tools/play/log';
import type { LogEntry } from '../../tools/play/log';
import { buildView, renderView } from '../../tools/play/view';
import { act, buildState } from '../engine/helpers';

/** The text one step prints for `state`. */
function viewText(state: GameState): string {
  return renderView(buildView(state, { radius: 4, layers: 1, deepestZ: state.avatar.pos.z }));
}

/** A run that has dug a little, so that some of layers 1 and 2 is revealed and some is not. */
function dugInState(): GameState {
  let state = createRun(7, 'none', 'standard');
  for (let i = 0; i < 6; i += 1) {
    // Mine the block underfoot whenever it is affordable; otherwise end the shift.
    const below = { x: state.avatar.pos.x, y: state.avatar.pos.y, z: state.avatar.pos.z + 1 };
    const mine = legalActions(state).find(
      (action) =>
        action.type === 'mine' &&
        cellIndex(state.size, action.target) === cellIndex(state.size, below),
    );
    state = mine === undefined ? endShift(state).state : applyAction(state, mine).state;
  }
  return state;
}

describe('the view hides what the avatar cannot know', () => {
  it('prints the same text when every unrevealed block is changed', () => {
    const state = dugInState();
    expect(state.avatar.pos.z).toBeGreaterThan(0);
    const before = viewText(state);
    // The view really does have both known and unknown cells in it.
    expect(before).toContain('?');
    expect(before).toContain('d');

    // Turn every unrevealed block into a different solid block. (Solid stays
    // solid, so what the avatar can do is the same; only what it would see,
    // if the view leaked, is different.)
    let changed = 0;
    for (let index = 0; index < state.blocks.length; index += 1) {
      if (!isRevealed(state, cellPosition(state.size, index))) {
        const wasCrystal = state.blocks[index] === BLOCKS.crystal.code;
        state.blocks[index] = wasCrystal ? BLOCKS.keystone.code : BLOCKS.crystal.code;
        changed += 1;
      }
    }
    expect(changed).toBeGreaterThan(1000);
    expect(viewText(state)).toBe(before);
  });

  // A 5 x 5 x 2 cube with a pit at (2, 2, 0) where the avatar stands, and one
  // cell of interest two steps away at (4, 2, 0).
  const far: Vec3 = { x: 4, y: 2, z: 0 };
  function pitState(): GameState {
    const state = buildState({
      layers: [
        ['#####', '#####', '##.##', '#####', '#####'],
        ['#####', '#####', '#####', '#####', '#####'],
      ],
      avatar: { x: 2, y: 2, z: 0 },
    });
    // Reveal the ring around the avatar and the layer below it, but not `far`.
    for (let index = 0; index < state.revealed.length; index += 1) {
      const pos = cellPosition(state.size, index);
      if (Math.abs(pos.x - 2) <= 1 && Math.abs(pos.y - 2) <= 1) {
        state.revealed[index] = 1;
      }
    }
    return state;
  }

  it('does not show an unrevealed open cell as open, nor what is in it', () => {
    const state = pitState();
    const before = viewText(state);

    // Hollow out the unrevealed cell and put a torch and loose items in it.
    const index = cellIndex(state.size, far);
    state.blocks[index] = BLOCKS.air.code;
    state.structures[index] = STRUCTURES.torch.code;
    state.looseItems = [{ pos: { ...far }, item: 'coal', count: 3 }];
    expect(viewText(state)).toBe(before);
    expect(before).not.toContain('Coal');
    expect(before).not.toContain('torch');

    // Once the cell is revealed the same things do show.
    state.revealed[index] = 1;
    const after = viewText(state);
    expect(after).not.toBe(before);
    expect(after).toContain('Loose at x4 y2, layer 0: 3 Coal (in a cell with a torch)');
  });

  it('draws an unrevealed cell as "?" whether it is rock or open', () => {
    const state = pitState();
    // Reveal a cell beyond `far` in another row, so that its column is drawn.
    state.revealed[cellIndex(state.size, { x: 4, y: 0, z: 0 })] = 1;
    const view = buildView(state, { radius: 2, layers: 0, deepestZ: 0 });
    expect(view.layers).toHaveLength(1);
    // Row y = 2 of the avatar's layer; x = 4 is `far`, unrevealed.
    expect(view.layers[0]?.rows[2]).toBe('#@#?');
    state.blocks[cellIndex(state.size, far)] = BLOCKS.air.code;
    const hollow = buildView(state, { radius: 2, layers: 0, deepestZ: 0 });
    expect(hollow.layers[0]?.rows[2]).toBe('#@#?');
  });

  it('trims rows and columns of the map that are unseen in every layer', () => {
    const state = pitState();
    const view = buildView(state, { radius: 2, layers: 1, deepestZ: 0 });
    // Only the 3 x 3 ring around the avatar is revealed, on both cube layers;
    // the surface above is always known, inside the cube's footprint.
    expect(view.window).toEqual({ x0: 0, x1: 4, y0: 0, y1: 4 });
    const below = buildView(state, { radius: 2, layers: 0, deepestZ: 0 });
    expect(below.window).toEqual({ x0: 1, x1: 3, y0: 1, y1: 3 });
    expect(below.layers[0]?.rows).toEqual(['###', '#@#', '###']);
    expect(renderView(below)).toContain('Map: x 1..3');
  });

  it('does not say where a dropped item landed if that cell is not revealed', () => {
    const state = pitState();
    const events = [
      {
        type: 'itemFell' as const,
        from: { x: 4, y: 2, z: 0 },
        to: { x: 4, y: 2, z: 1 },
        item: 'coal',
        count: 1,
      },
    ];
    expect(describeEvents(state, events)).toEqual(['1 Coal fell out of sight.']);
    state.revealed[cellIndex(state.size, { x: 4, y: 2, z: 1 })] = 1;
    expect(describeEvents(state, events)).toEqual(['1 Coal fell 1 block to layer 1.']);
  });

  it('never prints the seed, the RNG state or a state hash in a view', () => {
    const state = createRun(123456789, 'none', 'standard');
    const text = viewText(state);
    expect(text).not.toContain('123456789');
    expect(text).not.toContain(String(state.rng.s));
    expect(text).not.toContain(hashState(state));
  });
});

describe('the lamp (issue #33)', () => {
  // A dead-end pocket two layers down: the avatar at (1,1,2), rock all round.
  const solid = ['###', '###', '###'];
  const layers = [solid, solid, ['###', '#.#', '###'], solid, solid];
  const here = { x: 1, y: 1, z: 2 };

  it('says on the view when the lamp is out and what that costs', () => {
    const lit = viewText(buildState({ layers, avatar: here, revealAll: true, lampOil: 1 }));
    expect(lit).not.toContain('LAMP IS OUT');

    const dark = viewText(buildState({ layers, avatar: here, revealAll: true, lampOil: 0 }));
    expect(dark).toContain('LAMP IS OUT');
    expect(dark).toContain('six cells touching yours');
  });

  it('draws the diagonals as unseen in the dark, and lists no diagonal mining', () => {
    // Nothing is revealed until the engine has run: end a shift in the dark.
    const built = buildState({ layers, avatar: here, lampOil: 0, ap: 0 });
    const dark = endShift(built).state;
    const text = viewText(dark);
    // The avatar's row of its own layer: walls east and west are known.
    expect(text).toContain('#@#');
    expect(text).not.toMatch(/Mine .*north-east/);
    expect(legalActions(dark).filter((action) => action.type === 'mine')).toHaveLength(5);
  });
});

describe('the action list', () => {
  it('is the legal actions in order, then end shift', () => {
    for (const state of [createRun(7, 'none', 'standard'), dugInState()]) {
      const view = buildView(state, { radius: 4, layers: 1, deepestZ: 0 });
      const legal = legalActions(state);
      const expected: LogEntry[] = [...legal, { type: 'endShift' }];
      expect(view.choices.map((choice) => choice.entry)).toEqual(expected);
      expect(view.choices.map((choice) => choice.number)).toEqual([
        ...legal.map((_action, index) => index + 1),
        0,
      ]);
      expect(view.choices.map((choice) => choice.ap)).toEqual([
        ...legal.map((action) => action.ap),
        null,
      ]);

      // And every one of them is printed, with its number and AP cost.
      const text = renderView(view);
      const printed = text.slice(text.indexOf('Actions [AP cost]:')).split('\n').slice(1);
      expect(printed).toHaveLength(legal.length + 1);
      view.choices.forEach((choice, index) => {
        const cost = choice.ap === null ? '-' : String(choice.ap);
        expect(printed[index]?.trim()).toBe(`${choice.number}. [${cost}] ${choice.text}`);
      });
    }
  });

  it('says enough to choose: direction, block, yield and drop depth', () => {
    const state = buildState({
      layers: [
        ['.##', '###', '###'],
        ['.##', '#c#', '###'],
        ['###', '###', '###'],
      ],
      avatar: { x: 1, y: 0, z: -1 },
      revealAll: true,
      inventory: { stone: 10 },
    });
    const text = viewText(state);
    expect(text).toContain('[1] Move west, then drop 2 blocks to layer 1');
    expect(text).toContain('[1] Move east');
    expect(text).toContain(
      'Mine below you: Stone (you are standing on it: you will fall 1 block, no harm), gives 1 Stone',
    );
    // 10 stone weigh 20, the carry limit, so one more does not fit.
    expect(text).toContain('(too heavy to carry: it will be left lying there)');
    expect(text).toContain('[0] Drop all 10 Stone');
    expect(text).toContain('Leave the cube');
  });

  // A 3 x 1 column cube. The avatar stands on the surface over (1, 0); the
  // cells under the block it stands on are open down to `depth` layers.
  function overVoid(openLayers: number, totalLayers: number): GameState {
    const layers: string[][] = [];
    for (let z = 0; z < totalLayers; z += 1) {
      layers.push([z >= 1 && z <= openLayers ? '#.#' : '###']);
    }
    return buildState({ layers, avatar: { x: 1, y: 0, z: -1 }, revealAll: true });
  }
  /** The action-list line for mining the block underfoot. */
  function mineBelowLine(state: GameState): string {
    const line = viewText(state)
      .split('\n')
      .find((text) => text.includes('Mine below you'));
    return line ?? '';
  }

  it('says how far the avatar will fall when it mines the block it stands on', () => {
    // Each case is checked against what the engine then does.
    const cases = [
      { open: 0, text: 'you will fall 1 block, no harm' },
      { open: 1, text: 'you will fall 2 blocks, no harm' },
      { open: 3, text: 'you will fall 4 blocks, it will cost health' },
      { open: 5, text: 'you will fall 6 blocks, FATAL' },
    ];
    for (const { open, text } of cases) {
      const state = overVoid(open, 8);
      expect(mineBelowLine(state)).toContain(`(you are standing on it: ${text})`);
      const { events } = act(state, { type: 'mine', target: { x: 1, y: 0, z: 0 } });
      const fell = events.find((event) => event.type === 'fell');
      expect(fell).toMatchObject({ distance: open + 1 });
    }
  });

  it('says so when a ladder holds the avatar, or one further down will catch it', () => {
    const onLadder = buildState({
      layers: [['#.#'], ['###'], ['###']],
      avatar: { x: 1, y: 0, z: 0 },
      ladders: [{ x: 1, y: 0, z: 0 }],
      revealAll: true,
    });
    expect(mineBelowLine(onLadder)).toContain('your ladder holds you, you will not fall');

    const caught = overVoid(5, 8);
    caught.structures[cellIndex(caught.size, { x: 1, y: 0, z: 2 })] = STRUCTURES.ladder.code;
    expect(mineBelowLine(caught)).toContain('you will fall 3 blocks, it will cost health)');
    const { events } = act(caught, { type: 'mine', target: { x: 1, y: 0, z: 0 } });
    expect(events.find((event) => event.type === 'fell')).toMatchObject({ distance: 3 });
  });

  it('judges the fall by revealed cells only, and says when it cannot see the bottom', () => {
    const state = overVoid(5, 8);
    // The player has seen the void down to layer 2 only.
    for (let z = 3; z < 8; z += 1) {
      state.revealed[cellIndex(state.size, { x: 1, y: 0, z })] = 0;
    }
    const before = viewText(state);
    expect(mineBelowLine(state)).toContain(
      'you will fall 3 blocks or more, it will cost health; below that is unseen',
    );
    // Whatever the unseen cells hold, the text is the same.
    state.blocks[cellIndex(state.size, { x: 1, y: 0, z: 3 })] = BLOCKS.stone.code;
    expect(viewText(state)).toBe(before);
    state.blocks[cellIndex(state.size, { x: 1, y: 0, z: 3 })] = BLOCKS.air.code;
    state.structures[cellIndex(state.size, { x: 1, y: 0, z: 4 })] = STRUCTURES.ladder.code;
    expect(viewText(state)).toBe(before);
  });

  it('shows no actions, and the outcome, once the run has ended', () => {
    const start = createRun(7, 'none', 'standard');
    const leave = legalActions(start).find((action) => action.type === 'leave');
    if (leave === undefined) {
      throw new Error('expected to be able to leave from the start');
    }
    const ended = applyAction(start, leave).state;
    const view = buildView(ended, { radius: 4, layers: 1, deepestZ: -1 });
    expect(view.choices).toEqual([]);
    const text = renderView(view);
    expect(text).toContain('RUN ENDED: you left the cube alive');
    expect(text).toContain('Shifts played: 1 | Deepest: the surface');
    expect(text).toContain('Carrying (weight): 6 Ladder (0), 2 Timber (2)');
    expect(text).not.toContain('Actions');
  });
});

describe('one-shot mode and the play log', () => {
  let folder = '';
  let logPath = '';
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'play-test-'));
    logPath = join(folder, 'run.json');
  });
  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  /** The menu number of the first legal action of the log's current state that `wanted` accepts. */
  function numberOf(wanted: (entry: LogEntry) => boolean): string {
    const state = replayLog(loadLog(logPath)).state;
    const index = legalActions(state).findIndex(wanted);
    expect(index).toBeGreaterThanOrEqual(0);
    return String(index + 1);
  }

  it('a log written step by step replays to the same state hash', () => {
    const started = runCli(['--seed', '7', '--log', logPath]);
    expect(started.exitCode).toBe(0);
    expect(started.output).toContain('Shift 1 | AP 5/5');

    // The same choices, applied straight to the engine, to compare with.
    let expected = createRun(7, 'none', 'standard');
    const script = ['5', '1', 'end', '2', '0', '3,4'];
    for (const choices of script) {
      for (const choice of choices.split(',')) {
        if (choice === 'end' || choice === '0') {
          expected = endShift(expected).state;
        } else {
          const action = legalActions(expected)[Number(choice) - 1];
          if (action === undefined) {
            throw new Error(`the script's choice ${choice} is not legal`);
          }
          expected = applyAction(expected, action).state;
        }
      }
      expect(runCli(['--log', logPath, '--do', choices]).exitCode).toBe(0);
    }

    const log = loadLog(logPath);
    expect(log.seed).toBe(7);
    expect(log.contractId).toBe('none');
    expect(log.loadoutId).toBe('standard');
    expect(log.engineVersion).toBe('0.1.0');
    expect(log.actions).toHaveLength(7);
    expect(log.outcome).toBeNull();
    // The log holds actions, not menu numbers.
    expect(log.actions[0]).toMatchObject({ type: 'mine' });
    expect(log.actions[2]).toEqual({ type: 'endShift' });

    expect(hashState(replayLog(log).state)).toBe(hashState(expected));
    const replayed = runCli(['--replay', logPath]);
    expect(replayed.exitCode).toBe(0);
    expect(replayed.output).toContain(`Final state hash: ${hashState(expected)}`);
    expect(replayed.output).toContain('still going');
  });

  it('--log alone reprints the view without changing the log', () => {
    runCli(['--seed', '7', '--log', logPath, '--do', '1']);
    const bytes = readFileSync(logPath, 'utf8');
    const first = runCli(['--log', logPath]);
    const second = runCli(['--log', logPath]);
    expect(first.exitCode).toBe(0);
    expect(second.output).toBe(first.output);
    expect(readFileSync(logPath, 'utf8')).toBe(bytes);
  });

  it('refuses a choice that is not on the list and leaves the log as it was', () => {
    runCli(['--seed', '7', '--log', logPath, '--do', '1']);
    const bytes = readFileSync(logPath, 'utf8');
    for (const bad of ['999', 'banana', '-1', '1.5']) {
      const result = runCli(['--log', logPath, '--do', bad]);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain(`Refused choice 1 of 1 ("${bad}")`);
      // The current view is still printed, so the player can choose again.
      expect(result.output).toContain('Actions [AP cost]:');
      expect(readFileSync(logPath, 'utf8')).toBe(bytes);
    }
  });

  it('stops a chain at the first illegal choice, keeps what came before, and says which', () => {
    runCli(['--seed', '7', '--log', logPath]);
    const result = runCli(['--log', logPath, '--do', '1,999,2']);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('> Move north.');
    expect(result.output).toContain('Refused choice 2 of 3 ("999")');
    const log = loadLog(logPath);
    expect(log.actions).toHaveLength(1);
    // The log is still a good log: it replays, and play can go on from it.
    expect(runCli(['--replay', logPath]).exitCode).toBe(0);
    expect(runCli(['--log', logPath, '--do', '2']).exitCode).toBe(0);
    expect(loadLog(logPath).actions).toHaveLength(2);
  });

  it('records the outcome when the run ends, and then refuses further choices', () => {
    runCli(['--seed', '7', '--log', logPath, '--do', '1']);
    const leave = numberOf((entry) => entry.type === 'leave');
    const result = runCli(['--log', logPath, '--do', leave]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('RUN ENDED: you left the cube alive');

    const log = loadLog(logPath);
    const finalState = replayLog(log).state;
    expect(log.outcome).toEqual({
      outcome: 'salvage',
      cause: 'left',
      shiftsPlayed: 1,
      deepestLayer: -1,
      inventory: [
        { item: 'ladder', count: 6 },
        { item: 'timber', count: 2 },
      ],
      stateHash: hashState(finalState),
    });

    const replayed = runCli(['--replay', logPath]);
    expect(replayed.exitCode).toBe(0);
    expect(replayed.output).toContain('Outcome: salvage (left)');
    expect(replayed.output).toContain('matches the outcome recorded in the log');

    const bytes = readFileSync(logPath, 'utf8');
    const more = runCli(['--log', logPath, '--do', '1']);
    expect(more.exitCode).toBe(1);
    expect(more.output).toContain('the run has ended');
    expect(readFileSync(logPath, 'utf8')).toBe(bytes);
  });

  it('tracks the deepest layer reached across steps', () => {
    runCli(['--seed', '7', '--log', logPath]);
    // Mine the block underfoot (the avatar drops into layer 0), then step back up.
    runCli([
      '--log',
      logPath,
      '--do',
      numberOf((e) => e.type === 'mine' && e.target.x === 16 && e.target.y === 16),
    ]);
    const up = runCli([
      '--log',
      logPath,
      '--do',
      numberOf((e) => e.type === 'move' && e.to.z === -1),
    ]);
    expect(up.output).toContain('the surface | Deepest so far: layer 0');
  });

  it('will not start a new run over an existing log', () => {
    runCli(['--seed', '7', '--log', logPath, '--do', '1']);
    const bytes = readFileSync(logPath, 'utf8');
    const again = runCli(['--seed', '8', '--log', logPath]);
    expect(again.exitCode).toBe(1);
    expect(again.output).toContain('already exists');
    expect(readFileSync(logPath, 'utf8')).toBe(bytes);
  });

  it('reports a log that is damaged or does not replay, without touching it', () => {
    writeFileSync(logPath, '{ not json');
    expect(runCli(['--log', logPath]).output).toContain('not valid JSON');

    runCli(['--seed', '7', '--log', join(folder, 'good.json'), '--do', '1']);
    const log = loadLog(join(folder, 'good.json'));
    // An action nobody could take from the start: a mine 10 cells away.
    log.actions = [{ type: 'mine', target: { x: 3, y: 3, z: 0 }, ap: 1 }];
    writeFileSync(logPath, JSON.stringify(log));
    const result = runCli(['--log', logPath, '--do', '1']);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('entry 1 of 1 does not replay');
    expect(readFileSync(logPath, 'utf8')).toBe(JSON.stringify(log));
  });

  it('creates the folder of the log if it does not exist yet', () => {
    const nested = join(folder, 'm1-r1', 'deep', 'run.json');
    const started = runCli(['--seed', '7', '--log', nested]);
    expect(started.exitCode).toBe(0);
    expect(started.output).toContain('Actions [AP cost]:');
    expect(loadLog(nested).seed).toBe(7);
  });

  it('names the ways a run ends in words', () => {
    const state = buildState({
      layers: [['###'], ['###']],
      avatar: { x: 1, y: 0, z: -1 },
      fuel: 0,
      ap: 0,
      revealAll: true,
    });
    expect(viewText(state)).toContain('THE RUN ENDS: you ran out of fuel and died.');
    expect(viewText(endShift(state).state)).toContain('RUN ENDED: you ran out of fuel and died');
  });

  it('reports bad arguments', () => {
    expect(runCli([]).exitCode).toBe(1);
    expect(runCli(['--bogus']).output).toContain('unknown argument --bogus');
    expect(runCli(['--seed', 'x']).output).toContain('--seed must be a whole number');
    expect(runCli(['--seed', '99999999999']).exitCode).toBe(1);
    expect(runCli(['--seed', '7', '--loadout', 'nope']).output).toContain('Unknown loadout id');
    expect(runCli(['--log', join(folder, 'missing.json')]).output).toContain('cannot read the log');
  });
});

describe('--help', () => {
  it('prints usage and the rules, with every number filled in', () => {
    const result = runCli(['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(helpText());
    for (const heading of [
      'USAGE',
      'READING A VIEW',
      'Shifts and action points',
      'Fuel and lamp oil',
      'Moving',
      'Falling',
      'Mining',
      'What you can see',
      'In the dark',
      'Weight and loose items',
      'Crafting',
      'Leaving',
    ]) {
      expect(result.output).toContain(heading);
    }
    expect(result.output).toContain('Ladder (x3): from 1 Timber');
    expect(result.output).not.toContain('undefined');
    expect(result.output).not.toContain('NaN');
  });
});
