// The text play interface (tools/play, src/app/text): the top-down map, mine
// and cut by naming a square, every reason a square is refused, the play log,
// and the test that the view tells nothing the player has not seen.
//
// The states are small cubes built by hand, here, with the engine's own state
// functions. Each layer is a list of rows (y = 0 first), one character per
// block; `BLOCK_CHARS` below says which block each character is.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BLOCKS, CREW, SHIFT, SURFACE, WORLD } from '../../src/data';
import type { BlockId } from '../../src/data';
import { ENGINE_VERSION, applyAction, createRun, endShift, hashState } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { updateReveal } from '../../src/engine/reveal';
import { blankState, cloneState, setBlock } from '../../src/engine/state';
import { setSurfaceKind } from '../../src/engine/surface/state';
import { updateMineralTraces } from '../../src/engine/tells';
import { choiceName, describeChoice, describeEvents } from '../../src/app/text/describe';
import { LOG_FORMAT, listedChoices, newSession, replayLog } from '../../src/app/text/log';
import type { Session } from '../../src/app/text/log';
import { cutChoice, mineChoice, parseSquareChoice, tapChoice } from '../../src/app/text/squares';
import { takeTurn } from '../../src/app/text/turn';
import { ACTIONS_HEADING, buildView, renderMap, renderView } from '../../src/app/text/view';
import { loadLog, resolveChoice, runCli, splitChoices, takeChoices } from '../../tools/play/cli';
import { helpText } from '../../tools/play/help';

// ---------------------------------------------------------------------------
// Building a small state
// ---------------------------------------------------------------------------

/** The character that stands for each block in a layer string. */
const BLOCK_CHARS: Record<string, BlockId> = {
  '.': 'air',
  d: 'dirt',
  '#': 'stone',
  H: 'hardRock',
  c: 'coalSeam',
  i: 'ironOre',
  R: 'rubble',
};

/**
 * A state for a hand-made cube. `layers[z][y]` is one row of layer z, one
 * character per block. `trees` lists the squares that carry a tree, as
 * "x,y". The run starts with a full shift's AP and some fuel, and everything
 * the player would see is revealed, as `createRun` does.
 */
function makeState(layers: string[][], trees: string[] = []): GameState {
  const firstLayer = layers[0] ?? [];
  const size = { x: (firstLayer[0] ?? '').length, y: firstLayer.length, z: layers.length };
  const state = blankState(size, 1);
  state.contractId = 'none';
  state.loadoutId = 'standard';
  layers.forEach((rows, z) => {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) {
        const blockId = BLOCK_CHARS[row.charAt(x)];
        if (blockId === undefined) {
          throw new Error(`No block for the character "${row.charAt(x)}"`);
        }
        setBlock(state, { x, y, z }, BLOCKS[blockId].code);
      }
    });
  });
  for (const tree of trees) {
    const [x, y] = tree.split(',').map(Number);
    setSurfaceKind(state, { x: x ?? 0, y: y ?? 0, z: WORLD.surfaceZ }, SURFACE.kinds.tree.code);
  }
  state.shift = SHIFT.firstShiftNumber;
  state.ap = SHIFT.apPerShift;
  state.fuel = 10;
  state.crew.health = CREW.startHealth;
  updateReveal(state, []);
  updateMineralTraces(state, []);
  return state;
}

/** A 3 x 3 cube of stone, 3 layers deep, with a coal block in the middle of layer 1. */
function stoneCube(trees: string[] = []): GameState {
  return makeState(
    [
      ['###', '###', '###'],
      ['###', '#c#', '###'],
      ['###', '###', '###'],
    ],
    trees,
  );
}

/** The whole text one step prints for `state`. */
function viewText(state: GameState, deepestDepth = 0): string {
  return renderView(buildView(state, { deepestDepth }));
}

/** The map rows of the view, without the rulers. */
function mapRows(state: GameState): string[] {
  return buildView(state, { deepestDepth: 0 }).map.rows;
}

/** A session on a hand-made state, for `takeTurn` and `takeChoices`. */
function sessionOn(state: GameState): Session {
  const session = newSession(1, 'none', 'standard');
  session.state = state;
  return session;
}

/** Mine the square and return the new state. */
function mined(state: GameState, x: number, y: number): GameState {
  const choice = mineChoice(state, x, y);
  if (choice.entry === null) {
    throw new Error(`Cannot mine ${x},${y}: ${choice.refusal ?? ''}`);
  }
  return applyAction(state, choice.entry).state;
}

// ---------------------------------------------------------------------------
// The map
// ---------------------------------------------------------------------------

describe('the top-down map', () => {
  it('draws every square as its top block and its depth', () => {
    let state = makeState([
      ['d#c', '###', '###'],
      ['###', '###', '###'],
    ]);
    // Ground level: the block's character, then a blank.
    expect(mapRows(state)).toEqual(['d # c', '# # #', '# # #']);
    state = mined(state, 0, 0);
    // The dug square shows the block under it and its depth.
    expect(mapRows(state)[0]).toBe('#1# c');
  });

  it('draws a tree, and hides the ground under it until it is cut', () => {
    const state = stoneCube(['1,1']);
    expect(mapRows(state)[1]).toBe('# Y #');
    const cut = cutChoice(state, 1, 1);
    expect(cut.entry).not.toBeNull();
    if (cut.entry === null) return;
    const after = applyAction(state, cut.entry).state;
    // A stump: the block shows, with "," where the depth would be.
    expect(mapRows(after)[1]).toBe('# #,#');
    expect(viewText(after)).toContain('Stumps, and the shifts until a tree grows back');
    expect(viewText(after)).toContain(`x1 y1 in ${SURFACE.regrowShifts}`);
  });

  it('draws the block the player saw under a tree that grew back', () => {
    let state = makeState([['dc'], ['##']], ['1,0']);
    const cut = cutChoice(state, 1, 0);
    if (cut.entry === null) throw new Error('no cut');
    state = applyAction(state, cut.entry).state;
    state.fuel = SURFACE.regrowShifts + 5; // enough to see the tree grow back
    for (let shift = 0; shift < SURFACE.regrowShifts; shift += 1) {
      state = endShift(state).state;
    }
    expect(mapRows(state)[0]).toBe('d Yc');
  });

  it('shows mineral traces with the traced character, and names it in the legend', () => {
    // Iron ore one block under the middle: the stone over it carries traces.
    const state = makeState([
      ['###', '###', '###'],
      ['###', '#i#', '###'],
    ]);
    expect(mapRows(state)[1]).toBe('% % %');
    expect(viewText(state)).toContain('% Stone (2 AP) with mineral traces');
  });

  it('draws a square with no block left as the floor', () => {
    let state = makeState([['#']]);
    state = mined(state, 0, 0);
    expect(mapRows(state)[0]).toBe('X1');
    expect(viewText(state)).toContain('X no block left');
  });

  it('writes depths of 10 and more as letters, still two characters a square', () => {
    const layers: string[][] = [];
    for (let z = 0; z < 12; z += 1) {
      layers.push(['#']);
    }
    let state = makeState(layers);
    for (let depth = 0; depth < 11; depth += 1) {
      state.ap = SHIFT.apPerShift;
      state = mined(state, 0, 0);
    }
    expect(mapRows(state)[0]).toBe('#b');
  });

  it('has x rulers over the grid and a y at the start of each row', () => {
    const state = createRun(7, 'none', 'standard');
    const map = renderMap(buildView(state, { deepestDepth: 0 }));
    expect(map.grid).toHaveLength(WORLD.size.y + 2);
    // The ones of each x, two characters apart, over each square's first character.
    expect(map.grid[1]?.trimStart().startsWith('0 1 2 3 4 5 6 7 8 9 0 1')).toBe(true);
    expect(map.grid[2]?.startsWith('y  0 ')).toBe(true);
    expect(map.grid[WORLD.size.y + 1]?.startsWith(`y ${WORLD.size.y - 1} `)).toBe(true);
    // No row is wider than the margin plus two characters a square.
    for (const row of map.grid) {
      expect(row.length).toBeLessThanOrEqual(5 + 2 * WORLD.size.x);
    }
    // The legend gives each block's cost.
    expect(map.after[0]).toContain(`Dirt (${BLOCKS.dirt.mineCost} AP)`);
  });

  it('has the gauges and what the player has in the HUD', () => {
    const state = createRun(7, 'none', 'standard');
    const view = buildView(state, { deepestDepth: 3 });
    expect(view.hud[0]).toContain(`AP ${SHIFT.apPerShift}/${SHIFT.apPerShift}`);
    expect(view.hud[0]).toContain(`Fuel ${state.fuel}`);
    expect(view.hud[0]).not.toContain('Lamp oil');
    expect(view.hud[0]).toContain(`Crew health ${CREW.startHealth}/${CREW.startHealth}`);
    expect(view.hud[1]).toBe('Deepest square so far: depth 3');
    expect(view.hud[2]).toBe('You have: 2 Timber');
  });
});

// ---------------------------------------------------------------------------
// The action list
// ---------------------------------------------------------------------------

describe('the action list', () => {
  it('summarises mines and cuts and lists only the other choices', () => {
    const state = createRun(7, 'none', 'standard');
    const view = buildView(state, { deepestDepth: 0 });
    // Hundreds of squares can be mined or cut; none of them is a line.
    expect(view.squares?.mines).toBeGreaterThan(100);
    expect(view.squares?.cuts).toBeGreaterThan(100);
    expect(view.choices.map((choice) => choice.name)).toEqual(['leave', 'end']);
    expect(view.choices.map((choice) => choice.number)).toEqual([1, 0]);
    const text = renderView(view);
    expect(text).toContain(ACTIONS_HEADING);
    expect(text).toContain(`${view.squares?.mines} squares can be mined now`);
    expect(text).toContain(`${view.squares?.cuts} trees can be cut now`);
    // The whole view stays short: the map, and a handful of lines round it.
    expect(text.split('\n').length).toBeLessThan(WORLD.size.y + 20);
  });

  it('counts the same mines and cuts as the engine offers', () => {
    const state = stoneCube(['0,0', '2,2']);
    const view = buildView(state, { deepestDepth: 0 });
    expect(view.squares).toEqual({ mines: 7, cuts: 2, cutAp: SURFACE.cutTree.ap });
  });

  it('lists a craft once its inputs are there, by name and by number', () => {
    let state = makeState([['c#'], ['##']]);
    state = mined(state, 0, 0);
    const names = buildView(state, { deepestDepth: 1 }).choices.map((choice) => choice.name);
    expect(names).toContain('craft-fuel');
    expect(names).not.toContain('craft-lamp-oil');
    const byName = resolveChoice(state, 'craft-fuel');
    expect(byName.entry).toEqual({ type: 'craft', recipe: 'fuel', ap: 1 });
    const number = names.indexOf('craft-fuel') + 1;
    expect(resolveChoice(state, String(number)).entry).toEqual(byName.entry);
  });

  it('says what costs more AP than is left', () => {
    const state = stoneCube(['0,0']);
    state.ap = 1;
    const text = viewText(state);
    expect(text).toContain('Not possible now: 8 mines and 1 cut cost more than the 1 AP you have');
    state.ap = 0;
    expect(viewText(state)).toContain('Not possible now: everything that costs AP');
  });

  it('describes a mine by its square, depth, block and yield', () => {
    const state = stoneCube();
    const choice = mineChoice(state, 1, 1);
    if (choice.entry === null) throw new Error('no mine');
    expect(choiceName(choice.entry)).toBe('mine 1,1');
    expect(describeChoice(state, choice.entry)).toBe(
      'Mine x1 y1 (ground level): Stone, gives 1 Stone',
    );
  });
});

// ---------------------------------------------------------------------------
// Mine and cut by name, and every refusal
// ---------------------------------------------------------------------------

describe('mine and cut by name', () => {
  it('reads "mine x,y" and "cut x,y", with or without spaces', () => {
    expect(parseSquareChoice('mine 3,4')).toEqual({ kind: 'mine', x: 3, y: 4 });
    expect(parseSquareChoice('MINE 3 , 4')).toEqual({ kind: 'mine', x: 3, y: 4 });
    expect(parseSquareChoice('mine-3,4')).toEqual({ kind: 'mine', x: 3, y: 4 });
    expect(parseSquareChoice('cut 10,31')).toEqual({ kind: 'cut', x: 10, y: 31 });
    expect(parseSquareChoice('mine 3')).toBeNull();
    expect(parseSquareChoice('leave')).toBeNull();
  });

  it('splits a chain at its commas but keeps a square whole', () => {
    expect(splitChoices('mine 3,4, cut 5,6,end')).toEqual(['mine 3,4', 'cut 5,6', 'end']);
    expect(splitChoices('3, 1,end')).toEqual(['3', '1', 'end']);
    expect(splitChoices('mine 1,1; craft-fuel; 0')).toEqual(['mine 1,1', 'craft-fuel', '0']);
  });

  it('mines a square and says what came of it', () => {
    const session = sessionOn(stoneCube());
    const line = takeTurn(session, { type: 'mine', x: 1, y: 1, ap: 2 });
    expect(line).toBe(
      '> Mine x1 y1 (ground level): Stone, gives 1 Stone. Mined Stone. ' +
        'The top block there is now Coal seam (depth 1). Got 1 Stone.',
    );
    expect(session.deepestDepth).toBe(1);
    expect(session.log.actions).toEqual([{ type: 'mine', x: 1, y: 1, ap: 2 }]);
  });

  it('cuts a tree and says what the ground under it is', () => {
    const session = sessionOn(stoneCube(['1,1']));
    const result = takeChoices(session, ['cut 1,1']);
    expect(result.refused).toBeNull();
    expect(result.lines[0]).toContain('> Cut the tree on x1 y1: gives 2 Timber');
    expect(result.lines[0]).toContain('The top block there is now Stone (ground level).');
    expect(result.lines[0]).toContain('Got 2 Timber.');
  });

  it('says that a roof fell in', () => {
    // A void under the middle block: mining the roof fills it with rubble.
    const state = makeState([['#'], ['.'], ['.'], ['#']]);
    const session = sessionOn(state);
    const line = takeTurn(session, { type: 'mine', x: 0, y: 0, ap: 2 });
    expect(line).toContain("which fell in: the square's new top is rubble");
    expect(mapRows(session.state)[0]).toBe(':1');
  });

  it('refuses a mine under a tree, and says to cut it', () => {
    const state = stoneCube(['1,1']);
    const choice = mineChoice(state, 1, 1);
    expect(choice.entry).toBeNull();
    expect(choice.refusal).toBe('A tree stands on x1 y1: cut it first ("cut 1,1").');
  });

  it('refuses a mine the level rule forbids, naming the neighbours that are too high', () => {
    let state = stoneCube();
    state = mined(state, 1, 1);
    const choice = mineChoice(state, 1, 1);
    expect(choice.entry).toBeNull();
    expect(choice.refusal).toBe(
      'The level rule: x1 y1 is at depth 1, and a square may be mined only when no square ' +
        'beside it is higher. Too high: x1 y0 (north, depth 0), x2 y1 (east, depth 0), ' +
        'x1 y2 (south, depth 0) and x0 y1 (west, depth 0). Mine there first.',
    );
    // A corner square has two neighbours; with both dug level, it may go on.
    state = stoneCube();
    state = mined(state, 0, 0);
    state.ap = SHIFT.apPerShift;
    state = mined(state, 1, 0);
    const corner = mineChoice(state, 0, 0);
    expect(corner.refusal).toBe(
      'The level rule: x0 y0 is at depth 1, and a square may be mined only when no square ' +
        'beside it is higher. Too high: x0 y1 (south, depth 0). Mine there first.',
    );
  });

  it('refuses a mine of a square with no block left', () => {
    let state = makeState([['#']]);
    state = mined(state, 0, 0);
    expect(mineChoice(state, 0, 0).refusal).toBe(
      'x0 y0 has no block left: it is at the bedrock floor of the cube.',
    );
  });

  it('refuses a mine or a cut that costs more AP than is left', () => {
    const state = stoneCube(['0,0']);
    state.ap = 1;
    expect(mineChoice(state, 1, 1).refusal).toBe(
      'Mining x1 y1 costs 2 AP and you have 1 left this shift.',
    );
    expect(cutChoice(state, 0, 0).refusal).toBe(
      `Cutting the tree on x0 y0 costs ${SURFACE.cutTree.ap} AP and you have 1 left this shift.`,
    );
  });

  it('refuses a square off the map, and a cut where there is no tree', () => {
    const state = stoneCube();
    expect(mineChoice(state, 3, 0).refusal).toBe(
      'x3 y0 is not a square of the map (x is 0 to 2, y is 0 to 2).',
    );
    expect(cutChoice(state, 9, 9).refusal).toContain('is not a square of the map');
    expect(cutChoice(state, 1, 1).refusal).toBe('There is no tree on x1 y1 to cut.');
  });

  it('a tap cuts a tree, mines open ground, and gives the reason otherwise', () => {
    let state = stoneCube(['0,0']);
    expect(tapChoice(state, 0, 0).entry).toEqual({
      type: 'cutTree',
      x: 0,
      y: 0,
      ap: SURFACE.cutTree.ap,
    });
    expect(tapChoice(state, 1, 1).entry).toEqual({ type: 'mine', x: 1, y: 1, ap: 2 });
    state = mined(state, 1, 1);
    expect(tapChoice(state, 1, 1).refusal).toContain('The level rule');
  });

  it('every entry the square functions give is one the engine accepts', () => {
    const state = createRun(7, 'none', 'standard');
    let accepted = 0;
    for (let y = 0; y < state.size.y; y += 4) {
      for (let x = 0; x < state.size.x; x += 4) {
        const choice = tapChoice(state, x, y);
        expect(choice.entry === null).toBe(choice.refusal !== null);
        if (choice.entry !== null) {
          // `applyAction` throws on an action that is not legal.
          applyAction(state, choice.entry);
          accepted += 1;
        }
      }
    }
    expect(accepted).toBeGreaterThan(0);
  });

  it('a refused choice stops a chain, keeps what came before, and does not crash', () => {
    const session = sessionOn(stoneCube());
    const result = takeChoices(session, ['mine 1,1', 'mine 1,1', 'end']);
    expect(result.taken).toBe(1);
    expect(result.refused).toContain('Refused choice 2 of 3 ("mine 1,1"): The level rule');
    expect(result.refused).toContain('Nothing was done from it on.');
    expect(session.log.actions).toHaveLength(1);

    const unknown = takeChoices(session, ['mine-down']);
    expect(unknown.refused).toContain('It is not a choice as things stand now');
    const tooHigh = takeChoices(session, ['7']);
    expect(tooHigh.refused).toContain('a number from 1 to 1');
  });

  it('never reads a name as some other action', () => {
    const state = stoneCube();
    expect(resolveChoice(state, 'craft-fuel').entry).toBeNull();
    expect(resolveChoice(state, 'e').entry).toBeNull();
    expect(resolveChoice(state, 'end').entry).toEqual({ type: 'endShift' });
    expect(resolveChoice(state, '0').entry).toEqual({ type: 'endShift' });
    expect(resolveChoice(state, 'leave').entry).toEqual({ type: 'leave', ap: 0 });
  });
});

// ---------------------------------------------------------------------------
// The view tells nothing the player has not seen
// ---------------------------------------------------------------------------

describe('the view does not leak', () => {
  /**
   * A copy of `state` in which every block the player has not seen is another
   * block: everything below a top block, and the ground under a tree that was
   * never cut. Each becomes hard rock, or stone if it was hard rock. No ore
   * is put in, because mineral traces are the one hint the rules give of
   * hidden blocks; traces already seen are stored in the state and stay.
   */
  function withHiddenBlocksChanged(state: GameState): GameState {
    const copy = cloneState(state);
    const stone = BLOCKS.stone.code;
    const hardRock = BLOCKS.hardRock.code;
    const cells = copy.blocks.length;
    for (let index = 0; index < cells; index += 1) {
      if (copy.revealed[index] === 1) {
        continue;
      }
      copy.blocks[index] = copy.blocks[index] === hardRock ? stone : hardRock;
    }
    return copy;
  }

  /** Everything a player is shown or offered for `state`. */
  function everythingShown(state: GameState): string {
    const lines = [viewText(state, 2)];
    for (const entry of listedChoices(state)) {
      lines.push(`${choiceName(entry)}: ${describeChoice(state, entry)}`);
    }
    for (let y = 0; y < state.size.y; y += 1) {
      for (let x = 0; x < state.size.x; x += 1) {
        const tap = tapChoice(state, x, y);
        const mine = mineChoice(state, x, y);
        const cut = cutChoice(state, x, y);
        lines.push(JSON.stringify([x, y, tap, mine, cut]));
        if (tap.entry !== null) {
          lines.push(describeChoice(state, tap.entry));
        }
      }
    }
    return lines.join('\n');
  }

  it('is the same text and the same choices when only hidden blocks differ', () => {
    // A terraced pit with trees round it, one of them cut, on a cube with no
    // ore (so no traces): plain dirt, stone and coal.
    let state = makeState(
      [
        ['d#d#', '#d#d', 'dc#d', '####'],
        ['####', '#c##', '##d#', '####'],
        ['#d##', '####', '##c#', '####'],
        ['####', '####', '####', '####'],
      ],
      ['0,0', '3,3', '3,0'],
    );
    state = mined(state, 1, 1);
    state = mined(state, 2, 1);
    state.ap = SHIFT.apPerShift;
    state = mined(state, 1, 2);
    const cut = cutChoice(state, 3, 0);
    if (cut.entry === null) throw new Error('no cut');
    state = applyAction(state, cut.entry).state;
    state.ap = SHIFT.apPerShift;

    const changed = withHiddenBlocksChanged(state);
    // The two states really differ, below the tops and under the two trees.
    expect(hashState(changed)).not.toBe(hashState(state));
    expect(changed.blocks[0]).not.toBe(state.blocks[0]);
    expect(everythingShown(changed)).toBe(everythingShown(state));
  });

  it('is the same on a generated cube when only hidden blocks differ', () => {
    const state = createRun(11, 'none', 'standard');
    // Every hidden block becomes another rock (hidden ore and coal included).
    // The traces the player has already seen are stored in the state, so the
    // map keeps them; nothing else on it may change.
    const changed = withHiddenBlocksChanged(state);
    expect(hashState(changed)).not.toBe(hashState(state));
    expect(viewText(changed)).toBe(viewText(state));
  });

  it('says the same after the same action when only blocks below the new top differ', () => {
    const state = stoneCube();
    const changed = withHiddenBlocksChanged(state);
    // Put back the one block the mine will uncover, so that both show coal.
    changed.blocks.set(state.blocks.subarray(9, 18), 9);
    const entry = { type: 'mine', x: 1, y: 1, ap: 2 } as const;
    const first = applyAction(state, entry);
    const second = applyAction(changed, entry);
    expect(describeEvents(second.state, second.events)).toEqual(
      describeEvents(first.state, first.events),
    );
    expect(viewText(second.state)).toBe(viewText(first.state));
  });
});

// ---------------------------------------------------------------------------
// The play log and the command line
// ---------------------------------------------------------------------------

describe('the play log', () => {
  /** A fresh folder for one test's log files. */
  function tempFile(name: string): string {
    return join(mkdtempSync(join(tmpdir(), 'play-test-')), name);
  }

  /** The first square of seed 7's map the tool will mine, and one it will cut. */
  function firstSquares(): { mine: string; cut: string } {
    const state = createRun(7, 'none', 'standard');
    let mine = '';
    let cut = '';
    for (let y = 0; y < state.size.y; y += 1) {
      for (let x = 0; x < state.size.x; x += 1) {
        const tap = tapChoice(state, x, y);
        if (tap.entry?.type === 'mine' && mine === '') mine = `mine ${x},${y}`;
        if (tap.entry?.type === 'cutTree' && cut === '') cut = `cut ${x},${y}`;
      }
    }
    return { mine, cut };
  }

  it('records the run and replays to the same hash', () => {
    const path = tempFile('run.json');
    const squares = firstSquares();
    const start = runCli(['--seed', '7', '--log', path]);
    expect(start.exitCode).toBe(0);
    expect(start.output).toContain('New run: seed 7.');

    const played = runCli(['--log', path, '--do', `${squares.mine}, ${squares.cut}, end`]);
    expect(played.exitCode).toBe(0);
    expect(played.output).toContain('> Mine ');
    expect(played.output).toContain('> Cut the tree on ');
    expect(played.output).toContain('> End the shift.');

    const log = loadLog(path);
    expect(log.format).toBe(LOG_FORMAT);
    expect(log.engineVersion).toBe(ENGINE_VERSION);
    expect(log.seed).toBe(7);
    expect(log.actions.map((entry) => entry.type)).toEqual(['mine', 'cutTree', 'endShift']);
    expect(log.outcome).toBeNull();

    // Replaying the log arrives at the state the session was in.
    const again = replayLog(log);
    const direct = runCli(['--log', path]);
    expect(direct.output).toBe(viewText(again.state, again.deepestDepth));
    expect(again.deepestDepth).toBe(1);

    // Leaving ends the run and writes the outcome, which --replay checks.
    const left = runCli(['--log', path, '--do', 'leave']);
    expect(left.output).toContain('=== RUN ENDED: you left the mine alive');
    const finished = loadLog(path);
    expect(finished.outcome?.outcome).toBe('salvage');
    expect(finished.outcome?.deepestDepth).toBe(1);
    expect(finished.outcome?.stateHash).toBe(hashState(replayLog(finished).state));
    const replay = runCli(['--replay', path]);
    expect(replay.exitCode).toBe(0);
    expect(replay.output).toContain('This matches the outcome recorded in the log.');
    expect(replay.output).toContain(`Final state hash: ${finished.outcome?.stateHash ?? ''}`);
  });

  it('reports a replay that ends somewhere else', () => {
    const path = tempFile('run.json');
    runCli(['--seed', '7', '--log', path, '--do', 'leave']);
    const text = readFileSync(path, 'utf8');
    const log = JSON.parse(text) as { outcome: { stateHash: string } };
    log.outcome.stateHash = '0000000000000000';
    writeFileSync(path, JSON.stringify(log));
    const replay = runCli(['--replay', path]);
    expect(replay.exitCode).toBe(1);
    expect(replay.output).toContain('MISMATCH');
  });

  it('a refused choice exits with 1, prints the view, and does not rewrite the log', () => {
    const path = tempFile('run.json');
    runCli(['--seed', '7', '--log', path]);
    const before = readFileSync(path, 'utf8');
    const refused = runCli(['--log', path, '--do', 'mine 99,0']);
    expect(refused.exitCode).toBe(1);
    expect(refused.output).toContain('x99 y0 is not a square of the map');
    expect(refused.output).toContain(ACTIONS_HEADING);
    expect(readFileSync(path, 'utf8')).toBe(before);
  });

  it('does not start a run over an existing log, and names an entry that does not replay', () => {
    const path = tempFile('run.json');
    runCli(['--seed', '7', '--log', path]);
    const again = runCli(['--seed', '8', '--log', path]);
    expect(again.exitCode).toBe(1);
    expect(again.output).toContain('already exists');

    // An entry the engine refuses (a square off the map) does not replay.
    const log = JSON.parse(readFileSync(path, 'utf8')) as { actions: unknown[] };
    log.actions.push({ type: 'mine', x: 99, y: 0, ap: 1 });
    writeFileSync(path, JSON.stringify(log));
    const broken = runCli(['--log', path]);
    expect(broken.exitCode).toBe(1);
    expect(broken.output).toContain('entry 1 of 1 does not replay');
  });

  it('does not read a log in the old format', () => {
    const path = tempFile('old.json');
    writeFileSync(
      path,
      JSON.stringify({
        format: 1,
        engineVersion: '0.3.0',
        seed: 7,
        contractId: 'none',
        loadoutId: 'standard',
        actions: [],
        outcome: null,
      }),
    );
    const result = runCli(['--log', path]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain(`its format is 1, but this tool reads format ${LOG_FORMAT}`);
  });

  it('rejects the options that went with the miner', () => {
    expect(runCli(['--seed', '7', '--radius', '3']).exitCode).toBe(1);
    expect(runCli(['--seed', '7', '--layers', '2']).exitCode).toBe(1);
  });
});

describe('the help text', () => {
  it('states the rules of the top-down game', () => {
    const help = helpText();
    expect(runCli(['--help'])).toEqual({ output: help, exitCode: 0 });
    expect(help).toContain('mine X,Y');
    expect(help).toContain('cut X,Y');
    expect(help).toContain('THE LEVEL RULE');
    expect(help).toContain('There is no miner');
    expect(help).toContain(`Each shift you get ${SHIFT.apPerShift} AP`);
    expect(help).toContain(`Cut any tree (${SURFACE.cutTree.ap} AP) for 2 Timber`);
    expect(help).toContain('A tree hides the ground under it');
    expect(help).toContain('the roof of one');
    expect(help).toContain('There is no\n    carry limit');
    expect(help).toContain('"leave" is always on the list');
    expect(help).toContain('Hazards (pit walls that slump, water, lava, gas)');
    // Nothing of the miner is left in it.
    for (const gone of ['mine-down', 'torch-here', '--radius', 'drop-all', 'You never fall']) {
      expect(help).not.toContain(gone);
    }
  });
});
