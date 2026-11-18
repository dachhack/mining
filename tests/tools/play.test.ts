// Tests for the text play interface (tools/play.ts, issue #9).
//
// The two things that matter most are tested first: the view shows nothing
// the avatar could not know, and the printed action list is exactly the
// engine's legal actions plus "end shift".

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AVATAR, BLOCKS, STRUCTURES, TELLS } from '../../src/data';
import type { Vec3 } from '../../src/data';
import {
  ENGINE_VERSION,
  applyAction,
  cellIndex,
  cellPosition,
  createRun,
  endShift,
  hashState,
  inGrid,
  isRevealed,
  legalActions,
  visibleMineralTraces,
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
    // The view after one more step (an end of shift), which is when the
    // engine notes any mineral traces the avatar's light falls on.
    const beforeNextStep = viewText(endShift(state).state);
    // The view really does have both known and unknown cells in it.
    expect(before).toContain('?');
    expect(before).toContain('d');

    // Turn every unrevealed block into a different solid block. (Solid stays
    // solid, so what the avatar can do is the same; only what it would see,
    // if the view leaked, is different.)
    //
    // Ore stays ore of another kind, and everything else becomes a block that
    // is not ore. That leaves one thing alone: whether ore is near a block
    // the player sees, which mineral traces are meant to show (the next two
    // tests are about those).
    const oreCodes = TELLS.mineralTraces.sourceBlocks.map(
      (blockId) => BLOCKS[blockId as keyof typeof BLOCKS].code,
    );
    let changed = 0;
    for (let index = 0; index < state.blocks.length; index += 1) {
      if (!isRevealed(state, cellPosition(state.size, index))) {
        const was = state.blocks[index] as number;
        if (oreCodes.includes(was)) {
          state.blocks[index] =
            was === BLOCKS.crystal.code ? BLOCKS.ironOre.code : BLOCKS.crystal.code;
        } else {
          state.blocks[index] =
            was === BLOCKS.keystone.code ? BLOCKS.relic.code : BLOCKS.keystone.code;
        }
        changed += 1;
      }
    }
    expect(changed).toBeGreaterThan(1000);
    expect(viewText(state)).toBe(before);
    expect(viewText(endShift(state).state)).toBe(beforeNextStep);
  });

  it('prints the same text when ore far from everything seen is swapped with rock', () => {
    // Mineral traces may tell the player about ore within a few steps of a
    // block they see, and nothing else. So every unrevealed cell further
    // than that from every revealed cell can turn from ore into rock, or
    // from rock into ore, without the view changing: now, or a step later.
    const state = dugInState();
    const before = viewText(state);
    const beforeNextStep = viewText(endShift(state).state);

    const reach = TELLS.mineralTraces.distance;
    // 1 for every cell within `reach` steps of a revealed cell (itself included).
    const nearSeen = new Uint8Array(state.blocks.length);
    for (let index = 0; index < state.blocks.length; index += 1) {
      const pos = cellPosition(state.size, index);
      if (!isRevealed(state, pos)) {
        continue;
      }
      for (let dz = -reach; dz <= reach; dz += 1) {
        const leftForY = reach - Math.abs(dz);
        for (let dy = -leftForY; dy <= leftForY; dy += 1) {
          const leftForX = leftForY - Math.abs(dy);
          for (let dx = -leftForX; dx <= leftForX; dx += 1) {
            const near = { x: pos.x + dx, y: pos.y + dy, z: pos.z + dz };
            if (inGrid(state.size, near)) {
              nearSeen[cellIndex(state.size, near)] = 1;
            }
          }
        }
      }
    }

    const oreCodes = TELLS.mineralTraces.sourceBlocks.map(
      (blockId) => BLOCKS[blockId as keyof typeof BLOCKS].code,
    );
    let toOre = 0;
    let toRock = 0;
    for (let index = 0; index < state.blocks.length; index += 1) {
      if (nearSeen[index] === 1) {
        continue;
      }
      if (oreCodes.includes(state.blocks[index] as number)) {
        state.blocks[index] = BLOCKS.stone.code;
        toRock += 1;
      } else {
        state.blocks[index] = BLOCKS.ironOre.code;
        toOre += 1;
      }
    }
    expect(toOre).toBeGreaterThan(1000);
    expect(toRock).toBeGreaterThan(0);
    expect(viewText(state)).toBe(before);
    expect(viewText(endShift(state).state)).toBe(beforeNextStep);
  });

  // A shaft down the middle of a 5 x 5 x 4 cube of stone, the avatar at its
  // bottom in layer 2, lamp lit. Only what the engine's reveal rules show is
  // revealed, so layer 3 is seen under the avatar and unseen at its corners.
  //
  // `hiddenOre`, if given, is turned into iron ore first; the tests pass a
  // cell the avatar does not see.
  function shaftState(hiddenOre?: Vec3): GameState {
    const solid = ['#####', '#####', '#####', '#####', '#####'];
    const holed = ['#####', '#####', '##.##', '#####', '#####'];
    const state = buildState({
      layers: [holed, holed, holed, solid],
      avatar: { x: 2, y: 2, z: 2 },
      ladders: [
        { x: 2, y: 2, z: 0 },
        { x: 2, y: 2, z: 1 },
        { x: 2, y: 2, z: 2 },
      ],
    });
    if (hiddenOre !== undefined) {
      state.blocks[cellIndex(state.size, hiddenOre)] = BLOCKS.ironOre.code;
    }
    // Ending a shift runs the engine's reveal for the state as it stands, and
    // notes the mineral traces the light falls on.
    const ready = endShift(state).state;
    if (hiddenOre !== undefined) {
      expect(isRevealed(ready, hiddenOre)).toBe(false);
    }
    return ready;
  }

  /**
   * A function giving the map character the view draws for a cell, or `null`
   * if the cell is off the map. The view is built once, here.
   */
  function mapReader(state: GameState): (pos: Vec3) => string | null {
    const view = buildView(state, { radius: 4, layers: 1, deepestZ: state.avatar.pos.z });
    return (pos: Vec3): string | null => {
      const layer = view.layers.find((candidate) => candidate.z === pos.z);
      const row = layer?.rows[pos.y - view.window.y0];
      if (row === undefined || pos.x < view.window.x0 || pos.x > view.window.x1) {
        return null;
      }
      return row.charAt(pos.x - view.window.x0);
    };
  }

  it('shows mineral traces only on revealed blocks, when unseen ore is put near them', () => {
    const before = viewText(shaftState());
    expect(before).not.toContain('%');
    expect(before).not.toContain('mineral traces');

    // Put iron ore in an unrevealed cell at the edge of layer 3. It is 2
    // steps from the shaft wall west of the avatar, (1, 2, 2), and 2 steps
    // from the floor under it, (2, 2, 3). Both touch the avatar's lit cell.
    const hidden: Vec3 = { x: 0, y: 2, z: 3 };
    const state = shaftState(hidden);
    const after = viewText(state);
    expect(after).not.toBe(before);

    // The engine names the traced blocks, every one of them revealed.
    const traced = visibleMineralTraces(state);
    expect(traced.length).toBeGreaterThan(0);
    for (const pos of traced) {
      expect(isRevealed(state, pos)).toBe(true);
    }

    // On the map, the cells that changed are exactly those blocks: each was
    // stone and is now "%". No other cell changed, and an unrevealed cell is
    // still "?": neither the ore nor anything else out of sight is drawn.
    const charAt = mapReader(state);
    const plainCharAt = mapReader(shaftState());
    for (let index = 0; index < state.blocks.length; index += 1) {
      const pos = cellPosition(state.size, index);
      const isTraced = traced.some((t) => cellIndex(state.size, t) === index);
      const char = charAt(pos);
      if (isTraced && char !== null) {
        expect(char).toBe('%');
        expect(plainCharAt(pos)).toBe('#');
      } else {
        expect(char).toBe(plainCharAt(pos));
      }
      if (!isRevealed(state, pos) && char !== null) {
        expect(char).toBe('?');
      }
    }
    expect(charAt(hidden)).toBe('?');

    // Off the map, the only lines that changed are mine lines, and only by
    // the words ", mineral traces"; and the legend gained the "%" entry.
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
    expect(afterLines).toHaveLength(beforeLines.length);
    let mineLinesChanged = 0;
    afterLines.forEach((line, lineNumber) => {
      const old = beforeLines[lineNumber] ?? '';
      if (line === old || /^y +\d+ /.test(line)) {
        return; // unchanged, or a map row (checked cell by cell above)
      }
      if (line.startsWith('Legend:')) {
        const entries = line.split(' | ').filter((entry) => !entry.startsWith('% '));
        expect(entries.join(' | ')).toBe(old);
        return;
      }
      expect(line).toContain('Mine ');
      expect(line.replace(', mineral traces', '')).toBe(old);
      mineLinesChanged += 1;
    });
    expect(mineLinesChanged).toBeGreaterThan(0);
    expect(after).toContain('% rock with mineral traces');
  });

  it('prints traces for a block exactly when the engine says the player sees them', () => {
    // Fill every unrevealed cell with crystal, so that every block the
    // avatar sees is near ore. What the view then marks must be the engine's
    // answer for each cell: revealed, seen in light, and plain rock.
    const dug = dugInState();
    for (let index = 0; index < dug.blocks.length; index += 1) {
      if (!isRevealed(dug, cellPosition(dug.size, index))) {
        dug.blocks[index] = BLOCKS.crystal.code;
      }
    }
    // One more step, so that the engine notes the traces now in the light.
    const state = endShift(dug).state;
    const charAt = mapReader(state);
    // The blocks the engine says show traces, as cell indexes.
    const shown = new Set(visibleMineralTraces(state).map((pos) => cellIndex(state.size, pos)));
    let marked = 0;
    for (let index = 0; index < state.blocks.length; index += 1) {
      const pos = cellPosition(state.size, index);
      const char = charAt(pos);
      if (char === null) {
        continue;
      }
      expect(char === '%').toBe(shown.has(index));
      if (char === '%') {
        expect(isRevealed(state, pos)).toBe(true);
        marked += 1;
      }
    }
    expect(marked).toBeGreaterThan(0);
    // Revealed blocks out of the light are near the crystal too, and are not marked.
    expect(viewText(state)).toContain('d');
    // The crystal itself is nowhere in the view.
    expect(viewText(state)).not.toContain('Crystal');
  });

  it('names traces in the mine list only for a block in light', () => {
    // Iron ore at the edge of layer 3, outside the pick's reach and unseen.
    const state = shaftState({ x: 0, y: 2, z: 3 });
    const text = viewText(state);
    // (1, 2, 2), the wall west of the avatar: the ore is 1 west and 1 down
    // from it, 2 steps. Its face touches the avatar's lit cell.
    expect(text).toContain('Mine west: Stone, mineral traces, gives 1 Stone');
    // (1, 2, 3), west and one layer down: 1 step from the ore and revealed
    // (the pick reaches it), but no face of it touches a lit cell.
    expect(isRevealed(state, { x: 1, y: 2, z: 3 })).toBe(true);
    expect(text).toContain('Mine west, one layer down: Stone, gives 1 Stone');
  });

  it('keeps traces on the map when the light has gone, and says when they are first seen', () => {
    const state = shaftState({ x: 0, y: 2, z: 3 });
    expect(viewText(state)).toContain('%');
    // The lamp runs dry: the traced blocks are no longer lit.
    state.lampOil = 0;
    const dark = endShift(state);
    expect(viewText(dark.state)).toContain('%');
    expect(viewText(dark.state)).toContain('Mine west: Stone, mineral traces, gives 1 Stone');
    // Nothing new was seen in that step, so nothing is said about traces.
    expect(describeEvents(dark.state, dark.events).join(' ')).not.toContain('mineral traces');

    // The step in which they are first seen says so, once.
    const said = describeEvents(state, [
      { type: 'mineralTracesSeen', pos: { x: 1, y: 2, z: 2 } },
      { type: 'mineralTracesSeen', pos: { x: 2, y: 2, z: 3 } },
    ]);
    expect(said).toEqual([
      'You notice mineral traces in the rock: ore is near. The map marks them "%".',
    ]);
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

describe('mining underfoot in the dark (issues #33 and #34)', () => {
  it('says the fall is of unknown depth and gives the least it will cost', () => {
    // A pocket two layers down with a hole under its floor: the fall is really 2.
    const solid = ['###', '###', '###'];
    const hole = ['###', '#.#', '###'];
    const layers = [solid, solid, hole, solid, hole, solid];
    const built = buildState({ layers, avatar: { x: 1, y: 1, z: 2 }, lampOil: 0, ap: 0 });
    const dark = endShift(built).state;

    // The floor is touched; the hole under it is not known.
    expect(isRevealed(dark, { x: 1, y: 1, z: 3 })).toBe(true);
    expect(isRevealed(dark, { x: 1, y: 1, z: 4 })).toBe(false);
    const text = viewText(dark);
    expect(text).toContain('you will fall 1 block or more');
    expect(text).toContain('lose at least');
    expect(text).toContain('below that is unseen');
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
      'Mine below you: Stone (you are standing on it: you will fall 1 block and lose 1 health), gives 1 Stone',
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
      { open: 0, text: 'you will fall 1 block and lose 1 health', lost: 1 },
      { open: 1, text: 'you will fall 2 blocks and lose 2 health', lost: 2 },
      { open: 2, text: 'you will fall 3 blocks and lose 4 health', lost: 4 },
      { open: 3, text: 'you will fall 4 blocks and lose 6 health', lost: 6 },
      { open: 4, text: 'you will fall 5 blocks and lose 8 health', lost: 8 },
      { open: 5, text: 'you will fall 6 blocks, FATAL', lost: AVATAR.startHealth },
    ];
    for (const { open, text, lost } of cases) {
      const state = overVoid(open, 8);
      expect(mineBelowLine(state)).toContain(`(you are standing on it: ${text})`);
      const { state: after, events } = act(state, { type: 'mine', target: { x: 1, y: 0, z: 0 } });
      const fell = events.find((event) => event.type === 'fell');
      expect(fell).toMatchObject({ distance: open + 1, kind: 'uncontrolled' });
      expect(state.avatar.health - after.avatar.health).toBe(lost);
    }
  });

  it('says FATAL when the health the fall costs is all the avatar has left', () => {
    // A 1-block fall costs 1 health. With 1 health left that kills.
    const lastPoint = overVoid(0, 8);
    lastPoint.avatar.health = 1;
    expect(mineBelowLine(lastPoint)).toContain(
      '(you are standing on it: you will fall 1 block, FATAL)',
    );
    const { state: after } = act(lastPoint, { type: 'mine', target: { x: 1, y: 0, z: 0 } });
    expect(after.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'fell' });

    const twoLeft = overVoid(0, 8);
    twoLeft.avatar.health = 2;
    expect(mineBelowLine(twoLeft)).toContain('you will fall 1 block and lose 1 health)');
  });

  it('tells a chosen drop from a lost footing in what happened', () => {
    const state = overVoid(0, 8);
    const mined = act(state, { type: 'mine', target: { x: 1, y: 0, z: 0 } });
    const lines = describeEvents(mined.state, mined.events);
    expect(lines).toContain('You lost your footing and fell 1 block.');
    expect(lines).toContain('You lost 1 health from the fall (now 9).');

    const ledge = buildState({ layers: [['#.'], ['##']], revealAll: true });
    const walked = act(ledge, { type: 'move', to: { x: 1, y: 0, z: -1 } });
    expect(describeEvents(walked.state, walked.events)).toEqual(['You dropped 1 block.']);
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
    expect(mineBelowLine(caught)).toContain('you will fall 3 blocks and lose 4 health)');
    const { state: after, events } = act(caught, { type: 'mine', target: { x: 1, y: 0, z: 0 } });
    expect(events.find((event) => event.type === 'fell')).toMatchObject({ distance: 3 });
    expect(caught.avatar.health - after.avatar.health).toBe(4);
  });

  it('judges the fall by revealed cells only, and says when it cannot see the bottom', () => {
    const state = overVoid(5, 8);
    // The player has seen the void down to layer 2 only.
    for (let z = 3; z < 8; z += 1) {
      state.revealed[cellIndex(state.size, { x: 1, y: 0, z })] = 0;
    }
    const before = viewText(state);
    expect(mineBelowLine(state)).toContain(
      'you will fall 3 blocks or more and lose at least 4 health; below that is unseen',
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
    expect(log.engineVersion).toBe(ENGINE_VERSION);
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

  it('--replay says plainly when a mismatch comes with a log from another engine version', () => {
    runCli(['--seed', '7', '--log', logPath, '--do', '1']);
    const leave = numberOf((entry) => entry.type === 'leave');
    runCli(['--log', logPath, '--do', leave]);
    const log = loadLog(logPath);
    if (log.outcome === null) {
      throw new Error('Test setup: the run should have ended');
    }

    // The same engine version with a wrong hash: a mismatch, and no excuse.
    const wrongHash = { ...log, outcome: { ...log.outcome, stateHash: '0000000000000000' } };
    writeFileSync(logPath, JSON.stringify(wrongHash));
    const sameEngine = runCli(['--replay', logPath]);
    expect(sameEngine.exitCode).toBe(1);
    expect(sameEngine.output).toContain('MISMATCH');
    expect(sameEngine.output).not.toContain('This is expected');

    // A log that names another engine version: still a mismatch (exit code
    // 1), with the reason spelled out.
    writeFileSync(logPath, JSON.stringify({ ...wrongHash, engineVersion: '0.1.0' }));
    const otherEngine = runCli(['--replay', logPath]);
    expect(otherEngine.exitCode).toBe(1);
    expect(otherEngine.output).toContain('MISMATCH');
    expect(otherEngine.output).toContain(
      `This is expected: the log was played on engine 0.1.0 and this is engine ${ENGINE_VERSION}. ` +
        'A play log replays to its recorded hash only on the engine version it names.',
    );
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
      'Mineral traces',
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

  it('says unspent AP is lost, and nothing about banking (issue #32)', () => {
    const help = helpText();
    expect(help).toContain('Unspent AP is lost when the shift ends');
    expect(help.toLowerCase()).not.toContain('bank');
    expect(help.toLowerCase()).not.toContain('refund');
  });
});

describe('unspent AP in the view (issue #32: no fuel refill)', () => {
  const layers = [['###'], ['###']];
  const avatar = { x: 1, y: 0, z: -1 };

  it('has no banked-AP gauge', () => {
    const text = viewText(buildState({ layers, avatar, revealAll: true }));
    expect(text).toContain('Fuel 10');
    expect(text.toLowerCase()).not.toContain('bank');
  });

  it('the end-of-shift line says unspent AP will be lost and what fuel will be', () => {
    const state = buildState({ layers, avatar, ap: 5, fuel: 10, lampOil: 6, revealAll: true });
    expect(viewText(state)).toContain(
      'If you end the shift now: 5 unspent AP will be lost, fuel 10 -> 9 (-1 shift), lamp oil 6 -> 6.',
    );
    // And that is what then happens.
    expect(endShift(state).state.fuel).toBe(9);
  });

  it('the end-of-shift line does not mention AP when none is unspent', () => {
    const state = buildState({ layers, avatar, ap: 0, fuel: 10, lampOil: 6, revealAll: true });
    expect(viewText(state)).toContain(
      'If you end the shift now: fuel 10 -> 9 (-1 shift), lamp oil 6 -> 6.',
    );
  });

  it('warns that the run ends on 0 fuel even with every AP unspent', () => {
    const state = buildState({ layers, avatar, ap: 5, fuel: 0, revealAll: true });
    expect(viewText(state)).toContain(
      'THE RUN ENDS: you ran out of fuel and died. No fuel is left, and unspent AP does not become fuel.',
    );
  });

  it('ending a shift reports only the fuel the shift used', () => {
    const state = buildState({ layers, avatar, ap: 5, fuel: 10, revealAll: true });
    const { state: after, events } = endShift(state);
    expect(describeEvents(after, events)).toEqual([
      'Fuel -1 (the shift), now 9.',
      'Shift 1 ended; shift 2 begins.',
    ]);
  });
});
