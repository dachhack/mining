// Tests for the text play interface (tools/play.ts, issue #9).
//
// The two things that matter most are tested first: the view shows nothing
// the avatar could not know, and the printed action list is exactly the
// engine's legal actions plus "end shift".

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AVATAR, BLOCKS, SHIFT, STRUCTURES, TELLS } from '../../src/data';
import type { Vec3 } from '../../src/data';
import {
  ENGINE_VERSION,
  applyAction,
  blockDefAt,
  cellIndex,
  cellPosition,
  createRun,
  endShift,
  hashState,
  inGrid,
  isRevealed,
  isUnderTree,
  isSolid,
  legalActions,
  visibleMineralTraces,
} from '../../src/engine';
import type { GameState } from '../../src/engine';
import { loadLog, resolveChoice, runCli } from '../../tools/play/cli';
import { describeEvents } from '../../src/app/text/describe';
import { helpText } from '../../tools/play/help';
import { replayLog } from '../../src/app/text/log';
import type { LogEntry } from '../../src/app/text/log';
import { ACTIONS_HEADING, buildView, renderView } from '../../src/app/text/view';
import { act, buildState } from '../engine/helpers';
import { updateReveal } from '../../src/engine/reveal';

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
    // 1000 is not a rule number: it only means a large part of the cube was flipped.
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

    // Above the action list, the only line off the map that changed is the
    // legend, which gained the "%" entry.
    const beforeLines = before.slice(0, before.indexOf(ACTIONS_HEADING)).split('\n');
    const afterLines = after.slice(0, after.indexOf(ACTIONS_HEADING)).split('\n');
    expect(afterLines).toHaveLength(beforeLines.length);
    afterLines.forEach((line, lineNumber) => {
      const old = beforeLines[lineNumber] ?? '';
      if (line === old || /^y +\d+ /.test(line)) {
        return; // unchanged, or a map row (checked cell by cell above)
      }
      expect(line.startsWith('Legend:')).toBe(true);
      const entries = line.split(' | ').filter((entry) => !entry.startsWith('% '));
      expect(entries.join(' | ')).toBe(old);
    });

    // In the action list, the choices are the same ones with the same names
    // and numbers; the only words that changed are ", mineral traces" on
    // mine choices. (The printed list is compared choice by choice, not line
    // by line: mine choices that read alike share a line, and the traced
    // blocks no longer read like the plain ones.)
    const options = { radius: 4, layers: 1, deepestZ: state.avatar.pos.z };
    const plainChoices = buildView(shaftState(), options).choices;
    const tracedChoices = buildView(state, options).choices;
    expect(tracedChoices).toHaveLength(plainChoices.length);
    let mineLinesChanged = 0;
    tracedChoices.forEach((choice, index) => {
      const plain = plainChoices[index];
      expect(choice.name).toBe(plain?.name);
      expect(choice.number).toBe(plain?.number);
      if (choice.text !== plain?.text) {
        expect(choice.entry.type).toBe('mine');
        expect(choice.text.replace(', mineral traces', '')).toBe(plain?.text);
        mineLinesChanged += 1;
      }
    });
    expect(mineLinesChanged).toBeGreaterThan(0);
    expect(after).toContain('% Stone with mineral traces');
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
      // Traced rock is drawn as D (dirt), % (stone) or h (hard rock).
      const isTracedChar = char === 'D' || char === '%' || char === 'h';
      expect(isTracedChar).toBe(shown.has(index));
      if (isTracedChar) {
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
    // That block shares a line of the list with the other plain stone, so
    // its own words are read from the view's data.
    const view = buildView(state, { radius: 4, layers: 1, deepestZ: 2 });
    const westDown = view.choices.find((choice) => choice.name === 'mine-w-down');
    expect(westDown?.text).toBe('Mine west, one layer down: Stone, gives 1 Stone');
    expect(text).toMatch(/Mine Stone, gives 1 Stone: .*\d+\. mine-w-down/);
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
      'You notice mineral traces in the rock: ore is near. (On the map: D, % or h.)',
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
    expect(describeEvents(state, events)).toEqual(['A loose pile of 1 Coal fell out of sight.']);
    state.revealed[cellIndex(state.size, { x: 4, y: 2, z: 1 })] = 1;
    expect(describeEvents(state, events)).toEqual([
      'A loose pile of 1 Coal fell 1 block to layer 1.',
    ]);
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
    expect(text).toContain('the cell under that (layer 4) is unseen');
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
      const printed = text.slice(text.indexOf(ACTIONS_HEADING)).split('\n').slice(1);
      for (const choice of view.choices) {
        const cost = choice.ap === null ? '-' : String(choice.ap);
        // "7. mine-e" followed by a space or the end of the line, so that
        // "7. mine-e" is not found inside "17. mine-e-down".
        const label = new RegExp(`(^| )${choice.number}\\. ${choice.name}( |$)`);
        const lines = printed.filter((line) => label.test(line));
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain(`[${cost}] `);
        if (lines[0]?.endsWith(`[${cost}] ${choice.text}`) !== true) {
          // Not on a line of its own, so it is on a shared line: the shared
          // words must be this choice's own words, less the direction.
          const group = choice.group ?? '';
          expect(choice.group).not.toBeNull();
          expect(lines[0]).toContain(`[${cost}] ${group}:`);
          if (choice.entry.type === 'mine') {
            // "Mine north: Stone, gives 1 Stone" shares "Mine Stone, gives 1 Stone".
            expect(group.startsWith('Mine ')).toBe(true);
            expect(choice.text.endsWith(`: ${group.slice('Mine '.length)}`)).toBe(true);
          } else {
            // The two drops of an item share "Drop Stone (one, or all 3)".
            expect(choice.entry.type).toBe('drop');
            expect(group.startsWith('Drop ')).toBe(true);
          }
        }
      }
      // And nothing else is printed as a choice: the "N. name" labels under
      // the heading are as many as the choices.
      const labels = printed.join('\n').match(/(^| )\d+\. [a-z]+(-[a-z]+)*(?= |$)/gm) ?? [];
      expect(labels).toHaveLength(view.choices.length);
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
    expect(text).toContain('[0] Drop Stone (one, or all 10): ');
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
      'you will fall 3 blocks or more and lose at least 4 health; the cell under that (layer 3) is unseen',
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
      expect(result.output).toContain(ACTIONS_HEADING);
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
    expect(started.output).toContain(ACTIONS_HEADING);
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
    // Issue #30: the names of choices, and the two things the view now says.
    expect(result.output).toContain('CHOICES: NAMES AND NUMBERS');
    expect(result.output).toContain('mine-down');
    expect(result.output).toContain('--do mine-e,e,end');
    expect(result.output).toContain('Not on the list:');
    // Since the forest (issue #70) the surface is drawn beside layer 0.
    expect(result.output).toContain(
      'While you\n  stand on the surface the map is the whole surface and, beside it, the whole of layer 0',
    );
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

// ---------------------------------------------------------------------------
// Issues #30 and #20: stable names for choices, a shorter list, the whole top
// layer on the surface, label padding, and why a move is not offered.
// ---------------------------------------------------------------------------

const DEFAULT_VIEW = { radius: null, layers: 1 };

/** The text one step prints for `state` when no --radius is given. */
function defaultViewText(state: GameState): string {
  return renderView(buildView(state, { ...DEFAULT_VIEW, deepestZ: state.avatar.pos.z }));
}

/**
 * States met along a real run of seed 7, in which the choice is made by a
 * fixed rule (no randomness): every fifth step ends the shift, the others
 * take the legal action at a place in the list that moves on with each step.
 * The run goes on into the dark (the lamp oil runs out after a few shifts).
 */
function statesAlongARun(steps: number): GameState[] {
  const states: GameState[] = [];
  let state = createRun(7, 'none', 'standard');
  for (let i = 0; i < steps && state.status.kind !== 'ended'; i += 1) {
    states.push(state);
    // Not "leave" (it ends the run) and not mining underfoot (it costs
    // health and would end the run early).
    const here = state.avatar.pos;
    const safe = legalActions(state).filter(
      (action) =>
        action.type !== 'leave' &&
        !(action.type === 'mine' && action.target.x === here.x && action.target.y === here.y),
    );
    const action = safe[(i * 7) % Math.max(safe.length, 1)];
    state =
      i % 5 === 4 || action === undefined
        ? endShift(state).state
        : applyAction(state, action).state;
  }
  return states;
}

/**
 * A real run of seed 7 that is in the dark, one layer down, with the wall to
 * the east just dug out: the cell east is known to be open, its floor is not.
 */
function darkDugState(): GameState {
  let state = createRun(7, 'none', 'standard');
  const take = (name: string): void => {
    const entry = resolveChoice(state, name);
    if (entry === null) {
      throw new Error(`expected "${name}" to be on the list`);
    }
    state = entry.type === 'endShift' ? endShift(state).state : applyAction(state, entry).state;
  };
  take('mine-down');
  while (state.lampOil > 0) {
    take('end');
  }
  take('mine-down');
  take('mine-e');
  return state;
}

/** Take the choice called `name`, which must be on the list, and return the new state. */
function takeNamed(state: GameState, name: string): GameState {
  const entry = resolveChoice(state, name);
  if (entry === null) {
    throw new Error(`expected "${name}" to be on the list`);
  }
  return entry.type === 'endShift' ? endShift(state).state : applyAction(state, entry).state;
}

/** Take the choices in order. */
function takeAll(state: GameState, names: string[]): GameState {
  let current = state;
  for (const name of names) {
    current = takeNamed(current, name);
  }
  return current;
}

/**
 * Seed 7, two blocks dug straight down from the start with no ladder: the
 * miner stands on layer 1 with rock on all four sides and rock on top of it.
 */
function pitInRun(): GameState {
  return takeAll(createRun(7, 'none', 'standard'), ['mine-down', 'mine-down', 'end']);
}

/** A state made to print one of the notes of issues #47 and #46, and what it prints. */
interface NoteState {
  name: string;
  state: GameState;
  /** Pieces of text the default view of `state` contains. */
  prints: string[];
}

/**
 * One state for each new note or wording, all grown from a real run of seed
 * 7 so that there are thousands of unseen cells to change. The leak test at
 * the end of this file changes every unseen cell of each and requires the
 * same text.
 */
function noteStates(): NoteState[] {
  const made: NoteState[] = [];

  // A pit after a fall, lamp lit, with full AP.
  made.push({ name: 'pit', state: pitInRun(), prints: [`Not on the list: ${PIT_NOTE}`] });

  // The same pit with the lamp out.
  const darkPit = pitInRun();
  darkPit.lampOil = 0;
  made.push({
    name: 'pit in the dark',
    state: endShift(darkPit).state,
    prints: ['Not on the list: No move at all', 'LAMP IS OUT'],
  });

  // The pit with a torch in the miner's cell: no ladder can go there.
  const torchPit = pitInRun();
  torchPit.structures[cellIndex(torchPit.size, torchPit.avatar.pos)] = STRUCTURES.torch.code;
  made.push({
    name: 'pit with a torch',
    state: torchPit,
    prints: ['No move at all', 'The cell above you is open.\n'],
  });

  // 1 AP left in the pit: the stone beside the miner costs more.
  const tired = pitInRun();
  tired.ap = 1;
  made.push({
    name: 'too little AP',
    state: tired,
    prints: ['Not on the list: these cost more than the 1 AP you have left: [2] mine-'],
  });
  const spent = pitInRun();
  spent.ap = 0;
  made.push({
    name: 'no AP',
    state: spent,
    prints: ['Not on the list: everything that costs AP: you have 0 AP left.'],
  });

  // A step that is gone, with no move up on the list. From the surface the
  // miner opens the block north of the one underfoot, falls two blocks down
  // its own shaft to layer 1, then opens the cell north and the cell under
  // that. North is now open at layers 0, 1 and 2: a walk north drops 1
  // block, and there is nothing north to step up onto. (AP is topped up by
  // hand between steps; the cube is the engine's.)
  let stepGone = createRun(7, 'none', 'standard');
  for (const name of ['mine-n-down', 'mine-down', 'mine-down', 'mine-n', 'mine-n-down']) {
    stepGone.ap = SHIFT.apPerShift;
    stepGone = takeNamed(stepGone, name);
  }
  stepGone.ap = SHIFT.apPerShift;
  made.push({
    name: 'step gone',
    state: stepGone,
    prints: ['Not on the list: No step up north: there is no rock there to step onto'],
  });

  // Fuel 1: ending the shift leaves 0.
  const lastFuel = pitInRun();
  lastFuel.fuel = SHIFT.fuelPerShift;
  made.push({ name: 'last fuel', state: lastFuel, prints: ['FUEL WILL BE 0'] });

  // The lamp out on the surface, in daylight.
  const darkSurface = createRun(7, 'none', 'standard');
  darkSurface.lampOil = 0;
  made.push({ name: 'lamp out on the surface', state: darkSurface, prints: ['(lamp is out)'] });

  // More loose coal in the miner's cell than fits the pack (coal weighs 1).
  const heavy = pitInRun();
  heavy.inventory = { coal: AVATAR.carryCapacity - 4 };
  heavy.looseItems = [{ pos: { ...heavy.avatar.pos }, item: 'coal', count: 5 }];
  made.push({
    name: 'pile too big',
    state: heavy,
    prints: ['Pick up 4 of the 5 Coal from your cell (only 4 fit your carry limit)'],
  });

  // A drop too long beside the miner, with a torch in the cell it would walk into.
  const besideDrop = takeAll(createRun(7, 'none', 'standard'), ['mine-down', 'mine-n']);
  const north = { x: besideDrop.avatar.pos.x, y: besideDrop.avatar.pos.y - 1, z: 0 };
  for (let z = 1; z <= AVATAR.maxChosenDropBlocks + 1; z += 1) {
    const index = cellIndex(besideDrop.size, { ...north, z });
    besideDrop.blocks[index] = BLOCKS.air.code;
    besideDrop.revealed[index] = 1;
  }
  besideDrop.structures[cellIndex(besideDrop.size, north)] = STRUCTURES.torch.code;
  made.push({
    name: 'drop beside a torch',
    state: besideDrop,
    prints: [`No move north: the drop there is more than ${AVATAR.maxChosenDropBlocks} blocks.\n`],
  });
  return made;
}

describe('names for choices (issue #30)', () => {
  it('every choice has one name, and the name and the number both lead to it', () => {
    const states = statesAlongARun(150);
    expect(states.length).toBeGreaterThan(100);
    expect(states.some((state) => state.lampOil === 0)).toBe(true);
    for (const state of states) {
      // `buildView` throws if two choices share a name.
      const view = buildView(state, { ...DEFAULT_VIEW, deepestZ: 0 });
      for (const choice of view.choices) {
        expect(choice.name).toMatch(/^[a-z]+(-[a-z]+)*$/);
        expect(resolveChoice(state, choice.name)).toEqual(choice.entry);
        expect(resolveChoice(state, String(choice.number))).toEqual(choice.entry);
      }
    }
  });

  it('a name means the same thing at every step, or is not on the list', () => {
    const sideways = [
      { name: 'n', dx: 0, dy: -1 },
      { name: 'e', dx: 1, dy: 0 },
      { name: 's', dx: 0, dy: 1 },
      { name: 'w', dx: -1, dy: 0 },
    ];
    let checked = 0;
    for (const state of statesAlongARun(150)) {
      const here = state.avatar.pos;
      for (const { name, dx, dy } of sideways) {
        const entry = resolveChoice(state, name);
        if (entry !== null) {
          // A move one cell that way (it may be a step up or end in a drop).
          expect(entry).toMatchObject({ type: 'move', to: { x: here.x + dx, y: here.y + dy } });
          checked += 1;
        }
      }
      const mineDown = resolveChoice(state, 'mine-down');
      if (mineDown !== null) {
        expect(mineDown).toMatchObject({
          type: 'mine',
          target: { x: here.x, y: here.y, z: here.z + 1 },
        });
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('names the other kinds of choice from the action alone', () => {
    const state = buildState({
      layers: [
        ['#.#', '#.#', '###'],
        ['###', '###', '###'],
      ],
      avatar: { x: 1, y: 1, z: 0 },
      revealAll: true,
      inventory: { ladder: 2, torch: 1, stone: 3, timber: 1, coal: 1 },
      looseItems: [
        { pos: { x: 1, y: 1, z: 0 }, item: 'coal', count: 1 },
        { pos: { x: 1, y: 0, z: 0 }, item: 'rawIronOre', count: 1 },
      ],
    });
    const names = buildView(state, { ...DEFAULT_VIEW, deepestZ: 0 }).choices.map(
      (choice) => choice.name,
    );
    for (const name of [
      'n',
      'mine-e',
      'mine-sw',
      'mine-down',
      'mine-ne-down',
      'ladder-here',
      'ladder-n',
      'torch-here',
      'craft-ladder',
      'take-here-coal',
      'take-n-raw-iron-ore',
      'drop-stone',
      'drop-all-stone',
      'drop-torch',
      'end',
    ]) {
      expect(names).toContain(name);
    }
    // One torch is carried, so there is no "drop all" for it on the list.
    // Typed all the same, it means the one choice that drops them all.
    expect(names).not.toContain('drop-all-torch');
    expect(resolveChoice(state, 'drop-all-torch')).toEqual(resolveChoice(state, 'drop-torch'));
    expect(resolveChoice(state, 'drop-all-torch')).toMatchObject({ type: 'drop', item: 'torch' });
    // With three stone carried the two names stay two different choices,
    // and "drop all" of something not carried is not a choice.
    expect(resolveChoice(state, 'drop-all-stone')).toMatchObject({ item: 'stone', count: 3 });
    expect(resolveChoice(state, 'drop-stone')).toMatchObject({ item: 'stone', count: 1 });
    expect(resolveChoice(state, 'drop-all-relic')).toBeNull();
  });

  describe('with --do', () => {
    let folder = '';
    let logPath = '';
    beforeEach(() => {
      folder = mkdtempSync(join(tmpdir(), 'play-test-'));
      logPath = join(folder, 'run.json');
    });
    afterEach(() => {
      rmSync(folder, { recursive: true, force: true });
    });

    it('takes a chain of names, and the log holds the actions they stand for', () => {
      const result = runCli(['--seed', '7', '--log', logPath, '--do', 's,E,mine-down,end']);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('> Move south.');
      expect(result.output).toContain('> Move east.');
      const log = loadLog(logPath);
      expect(log.actions.map((entry) => entry.type)).toEqual(['move', 'move', 'mine', 'endShift']);
      expect(log.actions[1]).toMatchObject({ to: { x: 17, y: 17, z: -1 } });
      expect(log.actions[2]).toMatchObject({ target: { x: 17, y: 17, z: 0 } });
      // The log is the same kind of log as before: it replays.
      expect(runCli(['--replay', logPath]).exitCode).toBe(0);
    });

    it('refuses a name that is not on the list now, and never reads it as another action', () => {
      // In the pit dug at the start there is rock or a step up each way, and
      // no ladder: "down" (climb down) is not a choice, though number 4 is.
      runCli(['--seed', '7', '--log', logPath, '--do', 'mine-down']);
      const bytes = readFileSync(logPath, 'utf8');
      const result = runCli(['--log', logPath, '--do', 'down,n']);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('Refused choice 1 of 2 ("down")');
      expect(result.output).toContain('a name from the list');
      expect(readFileSync(logPath, 'utf8')).toBe(bytes);
    });
  });
});

describe('a shorter action list (issue #30)', () => {
  it('prints mine choices that differ only in direction on one line', () => {
    const state = createRun(7, 'none', 'standard');
    const view = buildView(state, { ...DEFAULT_VIEW, deepestZ: -1 });
    const text = renderView(view);
    expect(text).toContain(
      '[1] Mine Dirt, gives nothing: 6. mine-n-down  8. mine-s-down  9. mine-w-down  10. mine-ne-down  12. mine-sw-down',
    );
    expect(text).toContain(
      '[2] Mine Stone, gives 1 Stone: 7. mine-e-down  11. mine-se-down  13. mine-nw-down',
    );
    // The block underfoot keeps a line of its own: it says what the fall costs.
    expect(text).toMatch(/ 5\. mine-down +\[1\] Mine below you: Dirt \(you are standing on it/);

    const printed = text.slice(text.indexOf(ACTIONS_HEADING)).split('\n').slice(1);
    expect(view.choices).toHaveLength(20);
    // 4 moves, mine-down, 2 lines of grouped mines, craft, 2 lines of drops
    // (issue #46 item 3), leave, end.
    expect(printed).toHaveLength(12);
  });

  it('still lists every legal action, with its number and name, exactly once', () => {
    for (const state of statesAlongARun(60)) {
      const view = buildView(state, { ...DEFAULT_VIEW, deepestZ: 0 });
      expect(view.choices.map((choice) => choice.entry)).toEqual([
        ...legalActions(state),
        { type: 'endShift' },
      ]);
      const text = renderView(view);
      const list = text.slice(text.indexOf(ACTIONS_HEADING));
      for (const choice of view.choices) {
        const label = new RegExp(`(^| )${choice.number}\\. ${choice.name}( |$)`, 'gm');
        expect(list.match(label)).toHaveLength(1);
      }
    }
  });

  it('keeps blocks apart that differ in cost, yield, traces or weight', () => {
    // Stone and coal seam around the avatar, with a full pack: stone is too
    // heavy to take, coal is not.
    const state = buildState({
      layers: [['#.c', '#.c']],
      avatar: { x: 1, y: 0, z: 0 },
      revealAll: true,
      inventory: { stone: 9, coal: 1 },
    });
    const text = defaultViewText(state);
    expect(text).toMatch(
      /Mine Stone, gives 1 Stone \(too heavy to carry.*\): \d+\. mine-w {2}\d+\. mine-sw/,
    );
    expect(text).toMatch(/Mine Coal seam, gives 1 Coal: \d+\. mine-e {2}\d+\. mine-se/);
  });
});

describe('the map on the surface (issue #30)', () => {
  it('draws the whole surface and layer 0 when no --radius is given', () => {
    const state = createRun(7, 'none', 'standard');
    const view = buildView(state, { ...DEFAULT_VIEW, deepestZ: -1 });
    // The whole cube and one cell round it, which shows as the edge.
    expect(view.window).toEqual({ x0: -1, x1: state.size.x, y0: -1, y1: state.size.y });
    expect(view.radiusForAllSeen).toBeNull();
    const top = view.layers.find((layer) => layer.z === 0);
    expect(top?.rows).toHaveLength(state.size.y + 2);
    // A cell of the top layer is drawn as what it is only where the player
    // has seen it: round the start, never under a tree (owner, after PR #72;
    // issue #70). Everything else is "?".
    for (let y = 0; y < state.size.y; y += 1) {
      const row = top?.rows[y + 1] ?? '';
      expect(row).toHaveLength(state.size.x + 2);
      expect(row.charAt(0)).toBe('X');
      for (let x = 0; x < state.size.x; x += 1) {
        const seen = isRevealed(state, { x, y, z: 0 });
        expect(row.charAt(x + 1) === '?', `x${x} y${y}`).toBe(!seen);
        if (isUnderTree(state, { x, y, z: 0 })) {
          expect(seen).toBe(false);
        }
      }
    }
    // The whole surface is drawn too, and all of it is known.
    const surface = view.layers.find((layer) => layer.z === -1);
    expect(surface?.rows).toHaveLength(state.size.y + 2);
    for (const row of surface?.rows ?? []) {
      expect(row).not.toContain('?');
    }
    const text = renderView(view);
    expect(text).toContain('everything you have seen of these layers is on the map');
    expect(text).toContain(`y ${state.size.y - 1} `);
  });

  it('keeps to --radius when one is given, and says how to see the rest', () => {
    const state = createRun(7, 'none', 'standard');
    const view = buildView(state, { radius: 4, layers: 1, deepestZ: -1 });
    expect(view.window).toEqual({ x0: 12, x1: 20, y0: 12, y1: 20 });
    // With --radius the surface is drawn as before, beside layer 0.
    expect(view.layers.map((layer) => layer.label)).toEqual(['surface', 'layer 0']);
    // At the start the player has seen only the ground round the start,
    // all of it inside this map (owner, after PR #72).
    expect(view.radiusForAllSeen).toBeNull();
    expect(view.allSeenOnMap).toBe(true);
    const text = renderView(view);
    expect(text).not.toContain('--radius');
    expect(text).toContain('everything you have seen');
  });

  it('underground the default map is the small one, and says when more is known', () => {
    let state = createRun(7, 'none', 'standard');
    state = act(state, { type: 'mine', target: { x: 16, y: 16, z: 0 } }).state;
    expect(state.avatar.pos.z).toBe(0);
    const view = buildView(state, { ...DEFAULT_VIEW, deepestZ: 0 });
    expect(view.window).toEqual({ x0: 12, x1: 20, y0: 12, y1: 20 });
    // The top layer is known only round the start (owner, after PR #72), all
    // of it on this map: no hint.
    expect(renderView(view)).not.toContain('--radius');

    // The hint is for seen cells that are off the map. Here the player has
    // seen a cell of layer 1 that is 9 away. The number is the radius that
    // shows that cell.
    state.revealed[cellIndex(state.size, { x: 25, y: 16, z: 1 })] = 1;
    const further = buildView(state, { ...DEFAULT_VIEW, deepestZ: 0 });
    expect(further.radiusForAllSeen).toBe(9);
    expect(renderView(further)).toContain('you have seen more than is drawn: --radius 9 shows it');
    // And it does: with that radius the hint is gone.
    expect(buildView(state, { radius: 9, layers: 1, deepestZ: 0 }).radiusForAllSeen).toBeNull();

    // A pocket the player has seen all of: nothing more to show.
    const pocket = buildState({
      layers: [['###', '#.#', '###']],
      avatar: { x: 1, y: 1, z: 0 },
      revealAll: true,
    });
    expect(defaultViewText(pocket)).toContain('everything you have seen of these layers');
  });

  it('the hint counts seen cells only: unseen cells never change it', () => {
    const state = dugInState();
    const before = buildView(state, { ...DEFAULT_VIEW, deepestZ: 0 }).radiusForAllSeen;
    for (let index = 0; index < state.blocks.length; index += 1) {
      if (!isRevealed(state, cellPosition(state.size, index))) {
        state.blocks[index] = BLOCKS.air.code;
      }
    }
    expect(buildView(state, { ...DEFAULT_VIEW, deepestZ: 0 }).radiusForAllSeen).toBe(before);
  });
});

describe('layer labels on a narrow map (issue #20)', () => {
  it('keeps each label over its own layer when the map is narrower than the label', () => {
    // A pocket two layers down, 3 cells wide: the labels are 7 characters.
    const solid = ['###', '###', '###'];
    const state = buildState({
      layers: [solid, solid, ['###', '#.#', '###'], solid, solid],
      avatar: { x: 1, y: 1, z: 2 },
      revealAll: true,
    });
    const text = renderView(buildView(state, { radius: 1, layers: 1, deepestZ: 2 }));
    const lines = text.split('\n');
    const labels = lines.find((line) => line.includes('layer 1')) ?? '';
    const start = lines.indexOf(labels);
    expect(lines.slice(start, start + 5)).toEqual([
      '     layer 1  layer 2  layer 3',
      '     (above)  (yours)  (below)',
      'y  0 ###      ###      ###',
      'y  1 ###      #@#      ###',
      'y  2 ###      ###      ###',
    ]);
  });

  it('leaves a map wider than its labels as it was', () => {
    const text = renderView(
      buildView(createRun(7, 'none', 'standard'), { radius: 4, layers: 1, deepestZ: -1 }),
    );
    expect(text).toContain(
      // The surface shows the forest (issue #70), and the ground under the
      // trees is not seen.
      '     surface    layer 0\n     (yours)    (below)\ny 12 """""YY::  ?????????',
    );
  });
});

/** The note for a cell with no move at all, with the ladder advice (issue #47 item 2). */
const PIT_NOTE =
  'No move at all: there is rock on all four sides of you and no step up out. ' +
  'The cell above you is open: a ladder in your cell (ladder-here), then one in the cell ' +
  'above (ladder-up), would let you climb up (up).';

describe('why a move is not on the list (issue #30)', () => {
  /** The "Not on the list" lines of the view. */
  function notOffered(state: GameState): string[] {
    return buildView(state, { ...DEFAULT_VIEW, deepestZ: 0 }).notOffered;
  }
  /** A ledge on layer 0 with a pit east of it, `depth` cells deep below layer 0. */
  function besidePit(depth: number): GameState {
    const layers: string[][] = [['#..']];
    for (let z = 1; z <= 5; z += 1) {
      layers.push([z <= depth ? '##.' : '###']);
    }
    return buildState({ layers, avatar: { x: 1, y: 0, z: 0 }, revealAll: true });
  }

  it('says when the drop is too long, and nothing when the move is offered', () => {
    const longest = AVATAR.maxChosenDropBlocks;
    const shallow = besidePit(longest);
    expect(resolveChoice(shallow, 'e')).toMatchObject({ type: 'move', drop: longest });
    // Nothing at all: the move east is on the list, and so is a step up west
    // to the surface, so the step that is not there east needs no line.
    expect(resolveChoice(shallow, 'w')).toMatchObject({ type: 'move', to: { z: -1 } });
    expect(notOffered(shallow)).toEqual([]);

    const deep = besidePit(longest + 1);
    expect(resolveChoice(deep, 'e')).toBeNull();
    expect(notOffered(deep)).toEqual([
      `No move east: the drop there is more than ${longest} blocks. A ladder in that cell would hold you.`,
    ]);
    expect(defaultViewText(deep)).toContain('Not on the list: No move east: the drop there');

    // And the advice is true: with a ladder in that cell the move is offered.
    deep.structures[cellIndex(deep.size, { x: 2, y: 0, z: 0 })] = STRUCTURES.ladder.code;
    expect(resolveChoice(deep, 'e')).toMatchObject({ type: 'move', drop: 0 });
    expect(notOffered(deep)).toEqual([]);
  });

  it('on the surface, gives the reason without the ladder advice (nothing can be placed there)', () => {
    // The miner stands on the surface beside a hole. The cell east of it is
    // a surface cell, where no ladder can be placed.
    const longest = AVATAR.maxChosenDropBlocks;
    const hole = (depth: number): GameState => {
      const layers: string[][] = [];
      for (let z = 0; z < 6; z += 1) {
        layers.push([z < depth ? '##.' : '###']);
      }
      return buildState({ layers, avatar: { x: 1, y: 0, z: -1 }, revealAll: true });
    };

    const deep = hole(longest + 1);
    expect(resolveChoice(deep, 'e')).toBeNull();
    expect(resolveChoice(deep, 'ladder-e')).toBeNull();
    expect(notOffered(deep)).toEqual([
      `No move east: the drop there is more than ${longest} blocks.`,
    ]);

    // The same with the bottom of the hole unseen.
    const unseen = hole(longest);
    for (let z = 1; z < 6; z += 1) {
      unseen.revealed[cellIndex(unseen.size, { x: 2, y: 0, z })] = 0;
    }
    expect(resolveChoice(unseen, 'e')).toBeNull();
    expect(notOffered(unseen)).toEqual([
      'No move east: there is a drop of at least 1 block(s) and you have not seen its bottom.',
    ]);
    expect(defaultViewText(deep)).not.toContain('would hold you');
    expect(defaultViewText(unseen)).not.toContain('would hold you');
  });

  it('says nothing about a plain wall, and nothing about moves when there is no AP at all', () => {
    const solid = ['###', '###', '###'];
    const layers = [solid, ['###', '#.#', '###'], solid];
    const walled = buildState({ layers, avatar: { x: 1, y: 1, z: 1 }, revealAll: true });
    expect(notOffered(walled)).toEqual([]);
    expect(defaultViewText(walled)).not.toContain('Not on the list');

    const tired = besidePit(AVATAR.maxChosenDropBlocks + 1);
    tired.ap = 0;
    // No line about the move east; only the line that says AP is the reason.
    expect(notOffered(tired)).toEqual(['everything that costs AP: you have 0 AP left.']);
  });

  it('in the dark, says the floor of a cell just dug open has not been seen', () => {
    const state = darkDugState();
    const here = state.avatar.pos;
    const east = { x: here.x + 1, y: here.y, z: here.z };
    const underEast = { x: east.x, y: east.y, z: east.z + 1 };
    expect(state.lampOil).toBe(0);
    expect(isRevealed(state, east)).toBe(true);
    expect(isRevealed(state, underEast)).toBe(false);
    expect(resolveChoice(state, 'e')).toBeNull();
    expect(notOffered(state)).toContain(
      'No move east: you have not seen what is under that cell. A ladder in that cell would hold you.',
    );

    // The line is the same whatever the unseen floor is: rock, open, or
    // open with a ladder in it.
    const before = defaultViewText(state);
    const index = cellIndex(state.size, underEast);
    for (const block of [BLOCKS.stone.code, BLOCKS.air.code]) {
      state.blocks[index] = block;
      expect(defaultViewText(state)).toBe(before);
    }
    state.structures[index] = STRUCTURES.ladder.code;
    expect(defaultViewText(state)).toBe(before);
  });

  it('says when a drop was seen part of the way and its bottom was not', () => {
    const state = besidePit(4);
    // The player has seen one open cell under the cell east, and no further.
    for (let z = 2; z <= 5; z += 1) {
      state.revealed[cellIndex(state.size, { x: 2, y: 0, z })] = 0;
    }
    expect(notOffered(state)).toEqual([
      'No move east: there is a drop of at least 1 block(s) and you have not seen its bottom. ' +
        'A ladder in that cell would hold you.',
    ]);
    const before = defaultViewText(state);
    state.blocks[cellIndex(state.size, { x: 2, y: 0, z: 2 })] = BLOCKS.stone.code;
    expect(defaultViewText(state)).toBe(before);
  });

  it('in the dark, says when the top of the rock beside you has not been seen', () => {
    // A pit two deep; the avatar at its bottom in the dark. Overhead is open
    // (touched); the cells on top of the walls beside it are not known.
    const state = buildState({
      layers: [['###'], ['#.#'], ['#.#'], ['###']],
      avatar: { x: 1, y: 0, z: 2 },
      lampOil: 0,
      ap: 0,
    });
    // Ending a shift runs the engine's reveal: in the dark, the six cells touched.
    const dark = endShift(state).state;
    expect(isRevealed(dark, { x: 2, y: 0, z: 1 })).toBe(false);
    // One line for both directions, and then the line for a cell with no
    // move at all (issue #47 item 2).
    expect(notOffered(dark)).toEqual([
      'No step up east, west: you have not seen what is on top of the rock there.',
      PIT_NOTE,
    ]);
    const before = defaultViewText(dark);
    dark.blocks[cellIndex(dark.size, { x: 2, y: 0, z: 1 })] = BLOCKS.air.code;
    expect(defaultViewText(dark)).toBe(before);
  });

  it('explains a climb that is not offered from a ladder', () => {
    // A shaft with a ladder in the avatar's cell only: none above, and
    // below the ladder's foot a drop of 3.
    const state = buildState({
      layers: [['#.#'], ['#.#'], ['#.#'], ['#.#'], ['#.#'], ['###']],
      avatar: { x: 1, y: 0, z: 1 },
      ladders: [{ x: 1, y: 0, z: 1 }],
      revealAll: true,
    });
    expect(resolveChoice(state, 'up')).toBeNull();
    expect(resolveChoice(state, 'down')).toBeNull();
    expect(notOffered(state)).toEqual([
      'No climb up: the cell above you has no ladder.',
      `No climb down: off the foot of your ladder the drop is more than ${AVATAR.maxChosenDropBlocks} blocks. ` +
        'A ladder in the cell below would hold you.',
    ]);

    // With the drop unseen, it says that instead, whatever is there.
    for (let z = 3; z <= 5; z += 1) {
      state.revealed[cellIndex(state.size, { x: 1, y: 0, z })] = 0;
    }
    expect(notOffered(state)[1]).toBe(
      'No climb down: you have not seen how far the drop under the cell below goes. ' +
        'A ladder in the cell below would hold you.',
    );
    const before = defaultViewText(state);
    state.blocks[cellIndex(state.size, { x: 1, y: 0, z: 3 })] = BLOCKS.stone.code;
    expect(defaultViewText(state)).toBe(before);
  });

  it('never explains a move that is on the list', () => {
    const words = ['north', 'east', 'south', 'west'];
    const names = ['n', 'e', 's', 'w'];
    let notes = 0;
    for (const state of statesAlongARun(150)) {
      for (const note of notOffered(state)) {
        notes += 1;
        // The directions a note is about stand before its colon.
        const about = note.slice(0, note.indexOf(':'));
        // One kind of note is about a direction that does have a move: "No
        // step up north: there is no rock there to step onto" (issue #47
        // item 2). The move on the list that way is then a walk with a drop,
        // never a step up.
        const stepGone = note.includes('there is no rock there to step onto');
        words.forEach((word, index) => {
          if (about.includes(word)) {
            const move = resolveChoice(state, names[index] ?? '');
            if (stepGone) {
              expect(move).toMatchObject({ type: 'move', to: { z: state.avatar.pos.z } });
              expect(move).not.toMatchObject({ drop: 0 });
            } else {
              expect(move).toBeNull();
            }
          }
        });
      }
    }
    expect(notes).toBeGreaterThan(0);
  });
});

describe('unseen cells never change the view (issues #30 and #33)', () => {
  /**
   * Change every cell the player has not seen: its block (rock to open or
   * open to rock, as `toOpen` says), and optionally a ladder and loose items
   * in it. Ore is left as it is, and nothing is turned into ore: whether ore
   * is near a seen block is what mineral traces are meant to show.
   * Returns how many cells were changed.
   */
  function changeUnseen(state: GameState, toOpen: boolean, clutter: boolean): number {
    const oreCodes = TELLS.mineralTraces.sourceBlocks.map(
      (blockId) => BLOCKS[blockId as keyof typeof BLOCKS].code,
    );
    let changed = 0;
    const loose = [];
    for (let index = 0; index < state.blocks.length; index += 1) {
      const pos = cellPosition(state.size, index);
      if (isRevealed(state, pos) || oreCodes.includes(state.blocks[index] as number)) {
        continue;
      }
      state.blocks[index] = toOpen ? BLOCKS.air.code : BLOCKS.stone.code;
      if (clutter && toOpen) {
        state.structures[index] = STRUCTURES.ladder.code;
        loose.push({ pos, item: 'coal', count: 2 });
      }
      changed += 1;
    }
    if (clutter) {
      state.looseItems = [...state.looseItems, ...loose];
    }
    return changed;
  }

  it('the whole text is the same with every unseen cell open, solid, or laddered', () => {
    const states = [
      createRun(7, 'none', 'standard'),
      dugInState(),
      darkDugState(),
      // Every tenth state of a run, lit and dark, in tunnels and on ladders.
      ...statesAlongARun(150).filter((_state, index) => index % 10 === 0),
      // One state for each note and wording added for issues #47 and #46.
      ...noteStates().map((made) => made.state),
    ];
    for (const state of states) {
      const texts = [defaultViewText(state), viewText(state)];
      for (const [toOpen, clutter] of [
        [true, false],
        [false, false],
        [true, true],
      ] as const) {
        // `structuredClone` copies the state, arrays and all, so each change
        // starts from the state as it was.
        const copy = structuredClone(state);
        expect(changeUnseen(copy, toOpen, clutter)).toBeGreaterThan(1000);
        expect(defaultViewText(copy)).toBe(texts[0]);
        expect(viewText(copy)).toBe(texts[1]);
      }
    }
  });

  it('the states under test do print each new note (issues #47 and #46)', () => {
    // So the test above is known to cover every one of them.
    for (const made of noteStates()) {
      for (const text of made.prints) {
        expect(defaultViewText(made.state), made.name).toContain(text);
      }
    }
  });

  it('the dark view under test does have a move left out and explained', () => {
    // So the test above is known to cover the "Not on the list" line.
    expect(defaultViewText(darkDugState())).toContain('Not on the list: No move east');
  });
});

// ---------------------------------------------------------------------------
// Issue #47 (text bugs from playtest round m1-r2) and issue #46 items 1 to 5.
// ---------------------------------------------------------------------------

describe('the lamp-out banner (issue #47 item 1)', () => {
  it('says what the lamp no longer shows, and that seen blocks can still be mined', () => {
    // Seed 7, one block down, the lamp out: diagonal blocks seen earlier are
    // still on the mine list, and the banner must not say otherwise.
    let state = takeAll(createRun(7, 'none', 'standard'), ['mine-down']);
    state.lampOil = 0;
    state = endShift(state).state;
    const text = defaultViewText(state);
    expect(text).toMatch(/\d+\. mine-ne/);
    expect(text).not.toContain('No diagonal mining');
    expect(text).toContain(
      'Lamp oil 0 (LAMP IS OUT: your lamp shows nothing. By touch you learn only the six ' +
        'cells touching yours; blocks you saw earlier, or that a torch or daylight shows, ' +
        'can still be mined)',
    );
  });

  it('on the surface, in daylight, says only that the lamp is out', () => {
    const state = createRun(7, 'none', 'standard');
    state.lampOil = 0;
    const text = defaultViewText(state);
    expect(text).toContain('Lamp oil 0 (lamp is out) |');
    expect(text).not.toContain('six cells');
    expect(text).not.toContain('LAMP IS OUT');
  });
});

describe('more "Not on the list" notes (issue #47 item 2)', () => {
  function notOffered(state: GameState): string[] {
    return buildView(state, { ...DEFAULT_VIEW, deepestZ: 0 }).notOffered;
  }

  it('explains a pit: no move at all, open overhead, and how a ladder gets you out', () => {
    const state = pitInRun();
    expect(legalActions(state).filter((action) => action.type === 'move')).toEqual([]);
    expect(notOffered(state)).toEqual([PIT_NOTE]);

    // The advice is true: after the two ladders, "up" is on the list.
    const out = takeAll(state, ['ladder-here', 'ladder-up']);
    expect(resolveChoice(out, 'up')).toMatchObject({ type: 'move' });
    expect(notOffered(out)).toEqual([]);
  });

  it('gives no pit note when a move is on the list, or when the pit has a roof', () => {
    // One block down from the surface: a step up is offered every way.
    const shallow = takeAll(createRun(7, 'none', 'standard'), ['mine-down']);
    expect(notOffered(shallow)).toEqual([]);
    // A closed pocket is a plain wall four times and rock overhead.
    const solid = ['###', '###', '###'];
    const walled = buildState({
      layers: [solid, ['###', '#.#', '###'], solid],
      avatar: { x: 1, y: 1, z: 1 },
      revealAll: true,
    });
    expect(notOffered(walled)).toEqual([]);
  });

  it('names what costs more AP than is left, with its cost', () => {
    // Hard rock east and east-down (3 AP), stone west (2 AP), dirt underfoot (1 AP).
    const state = buildState({
      layers: [['#.H'], ['#dH'], ['###']],
      avatar: { x: 1, y: 0, z: 0 },
      revealAll: true,
      ap: 2,
    });
    expect(BLOCKS.hardRock.mineCost).toBeGreaterThan(2);
    expect(resolveChoice(state, 'mine-e')).toBeNull();
    expect(resolveChoice(state, 'mine-w')).not.toBeNull();
    const cost = BLOCKS.hardRock.mineCost ?? 0;
    expect(notOffered(state)).toContain(
      `these cost more than the 2 AP you have left: [${cost}] mine-e, mine-e-down.`,
    );
    expect(defaultViewText(state)).toContain('Not on the list: these cost more than the 2 AP');

    // Every name in the note is a real choice once the AP is there.
    state.ap = SHIFT.apPerShift;
    expect(resolveChoice(state, 'mine-e')).toMatchObject({ type: 'mine', ap: cost });
    expect(resolveChoice(state, 'mine-e-down')).toMatchObject({ type: 'mine', ap: cost });
    expect(notOffered(state).join(' ')).not.toContain('cost more');
  });

  it('with no AP at all, says so in one short line', () => {
    const state = pitInRun();
    state.ap = 0;
    expect(notOffered(state)).toEqual(['everything that costs AP: you have 0 AP left.']);
  });

  it('says when there is nothing to step up onto and the walk that way drops', () => {
    // The miner stands on a ledge of layer 1. North of it the cell is open,
    // and so are the cell on top of that and the cell under it: the block
    // that was the step is gone (playtest m1-r2, Speed-runner 23, shift 7).
    const state = buildState({
      layers: [
        ['.', '.', '#'],
        ['.', '.', '#'],
        ['.', '#', '#'],
        ['#', '#', '#'],
      ],
      avatar: { x: 0, y: 1, z: 1 },
      revealAll: true,
    });
    expect(resolveChoice(state, 'n')).toMatchObject({ type: 'move', drop: 1 });
    expect(notOffered(state)).toEqual([
      'No step up north: there is no rock there to step onto (the cell beside you is open). ' +
        'The move that way on the list walks off an edge and drops.',
    ]);

    // Not said while some move up is on the list: here a ladder to climb.
    // (Beside a hole in layer 0, with a step up to the surface the other
    // way, the line was noise: review of PR #48.)
    const withLadder = structuredClone(state);
    withLadder.structures[cellIndex(withLadder.size, { x: 0, y: 1, z: 1 })] =
      STRUCTURES.ladder.code;
    withLadder.structures[cellIndex(withLadder.size, { x: 0, y: 1, z: 0 })] =
      STRUCTURES.ladder.code;
    expect(resolveChoice(withLadder, 'up')).toMatchObject({ type: 'move' });
    expect(resolveChoice(withLadder, 'n')).toMatchObject({ type: 'move', drop: 1 });
    expect(notOffered(withLadder).join(' ')).not.toContain('No step up');

    // Not said for a walk on the flat, or where there is rock on top of the open cell.
    const flat = structuredClone(state);
    flat.blocks[cellIndex(flat.size, { x: 0, y: 0, z: 2 })] = BLOCKS.stone.code;
    expect(resolveChoice(flat, 'n')).toMatchObject({ type: 'move', drop: 0 });
    expect(notOffered(flat)).toEqual([]);
    const roofed = structuredClone(state);
    roofed.blocks[cellIndex(roofed.size, { x: 0, y: 0, z: 0 })] = BLOCKS.stone.code;
    expect(notOffered(roofed)).toEqual([]);
  });

  it('the step note reads only seen cells', () => {
    const state = buildState({
      layers: [
        ['.', '.', '#'],
        ['.', '.', '#'],
        ['.', '#', '#'],
        ['#', '#', '#'],
      ],
      avatar: { x: 0, y: 1, z: 1 },
      revealAll: true,
    });
    // The cell on top of the open cell north has not been seen: no note,
    // whatever it holds.
    state.revealed[cellIndex(state.size, { x: 0, y: 0, z: 0 })] = 0;
    const before = defaultViewText(state);
    expect(before).not.toContain('No step up');
    state.blocks[cellIndex(state.size, { x: 0, y: 0, z: 0 })] = BLOCKS.stone.code;
    expect(defaultViewText(state)).toBe(before);
  });
});

describe('traced rock keeps its rock type on the map (issue #47 item 3)', () => {
  // Iron ore in layer 1, east of the block under the miner's pit. Within 2
  // steps of it and in light: the dirt beside the miner, the hard rock of the
  // top layer beyond that, and the stone under the miner.
  function tracedState(): GameState {
    const built = buildState({
      layers: [['#.dH#'], ['##i##'], ['#####']],
      avatar: { x: 1, y: 0, z: 0 },
      ap: 0,
    });
    // An end of shift runs the engine's reveal and notes the traces.
    return endShift(built).state;
  }

  it('draws traced dirt, stone and hard rock each with its own character', () => {
    const state = tracedState();
    const view = buildView(state, { radius: 4, layers: 1, deepestZ: 0 });
    const shown = new Set(visibleMineralTraces(state).map((pos) => cellIndex(state.size, pos)));
    const plain: Record<string, string> = { Dirt: 'd', Stone: '#', 'Hard rock': 'H' };
    const traced: Record<string, string> = { Dirt: 'D', Stone: '%', 'Hard rock': 'h' };
    const kinds = new Set<string>();
    for (const layer of view.layers) {
      if (layer.z < 0) {
        continue;
      }
      layer.rows.forEach((row, rowIndex) => {
        for (let column = 0; column < row.length; column += 1) {
          const pos = { x: view.window.x0 + column, y: view.window.y0 + rowIndex, z: layer.z };
          if (!inGrid(state.size, pos) || !isRevealed(state, pos) || !isSolid(state, pos)) {
            continue;
          }
          const name = blockDefAt(state, pos).name;
          if (plain[name] === undefined) {
            continue; // the ore itself
          }
          const isTraced = shown.has(cellIndex(state.size, pos));
          expect(row.charAt(column)).toBe(isTraced ? traced[name] : plain[name]);
          if (isTraced) {
            kinds.add(name);
          }
        }
      });
    }
    // The picture really has all three.
    expect([...kinds].sort()).toEqual(['Dirt', 'Hard rock', 'Stone']);

    const text = renderView(view);
    expect(text).toContain('D Dirt with mineral traces');
    expect(text).toContain('% Stone with mineral traces');
    expect(text).toContain('h Hard rock with mineral traces');
  });

  it('the help explains the three characters', () => {
    const help = helpText();
    expect(help).toContain('"D" is dirt, "%" is stone and "h" is hard rock');
  });
});

describe('the fuel preview at the last fuel (issue #47 item 4)', () => {
  const layers = [['###'], ['###']];
  const avatar = { x: 1, y: 0, z: -1 };

  it('says the next shift is the last unless fuel is crafted', () => {
    const state = buildState({ layers, avatar, ap: 0, fuel: SHIFT.fuelPerShift, revealAll: true });
    expect(viewText(state)).toContain(
      `fuel ${SHIFT.fuelPerShift} -> 0 (-${SHIFT.fuelPerShift} shift), lamp oil 10 -> 10. ` +
        'FUEL WILL BE 0: the next shift is your last unless you craft fuel during it ' +
        '(ending a shift with no fuel ends the run).',
    );
    // And that is what happens: the next shift is played, and ending it ends the run.
    const next = endShift(state).state;
    expect(next.status.kind).toBe('active');
    expect(endShift(next).state.status).toMatchObject({ kind: 'ended', cause: 'outOfFuel' });
  });

  it('says nothing of the kind while fuel is left after the shift', () => {
    const state = buildState({
      layers,
      avatar,
      fuel: SHIFT.fuelPerShift + 1,
      revealAll: true,
    });
    expect(viewText(state)).not.toContain('FUEL WILL BE 0');
  });
});

describe('the fall warning (issue #47 item 5)', () => {
  function mineBelowLine(state: GameState): string {
    const line = defaultViewText(state)
      .split('\n')
      .find((text) => text.includes('Mine below you'));
    return line ?? '';
  }

  it('says "1 block", not "or more", when the cell below the landing is seen', () => {
    // The pit of seed 7 with a lit lamp: stand on a ladder, mine the block
    // below (the ladder holds), and from the ladder the cell under the hole
    // is seen. Back off the ladder the fall into the hole is known exactly.
    const state = createRun(7, 'none', 'standard');
    const below = { x: state.avatar.pos.x, y: state.avatar.pos.y, z: 1 };
    state.revealed[cellIndex(state.size, below)] = 1;
    expect(isSolid(state, below)).toBe(true);
    expect(mineBelowLine(state)).toContain(
      '(you are standing on it: you will fall 1 block and lose 1 health)',
    );
    expect(mineBelowLine(state)).not.toContain('or more');
  });

  it('keeps "or more" when that cell is unseen, and names the unseen cell', () => {
    const state = createRun(7, 'none', 'standard');
    expect(isRevealed(state, { x: state.avatar.pos.x, y: state.avatar.pos.y, z: 1 })).toBe(false);
    expect(mineBelowLine(state)).toContain(
      '(you are standing on it: you will fall 1 block or more and lose at least 1 health; ' +
        'the cell under that (layer 1) is unseen)',
    );
  });
});

describe('small wording (issue #47 item 6)', () => {
  it('the help states the lamp-oil rate from the data', () => {
    const help = helpText();
    expect(help).not.toContain('a little every few shifts');
    expect(help).toContain(
      `The lamp uses ${SHIFT.lampOilPerBurn} oil every ${SHIFT.lampOilBurnEveryShifts} shifts`,
    );
  });

  it('a pick-up of part of a pile says how many fit', () => {
    const state = buildState({
      layers: [['#.#'], ['###']],
      avatar: { x: 1, y: 0, z: 0 },
      revealAll: true,
      // Coal weighs 1, so 4 more fit under the carry limit.
      inventory: { coal: AVATAR.carryCapacity - 4 },
      looseItems: [{ pos: { x: 1, y: 0, z: 0 }, item: 'coal', count: 5 }],
    });
    const text = defaultViewText(state);
    expect(text).toContain('Loose in your cell: 5 Coal');
    expect(text).toMatch(
      /take-here-coal +\[0\] Pick up 4 of the 5 Coal from your cell \(only 4 fit your carry limit\)\n/,
    );
    // The name and the action are as before; a whole pile reads as before.
    expect(resolveChoice(state, 'take-here-coal')).toMatchObject({ type: 'pickUp', count: 4 });
    state.inventory = {};
    expect(defaultViewText(state)).toContain('[0] Pick up 5 Coal from your cell\n');
  });

  it('a stone that fell is not read as the stone just got', () => {
    // A loose stone lies in the miner's cell; mining underfoot gives another
    // stone to the pack, and the loose one falls with the miner.
    const state = buildState({
      layers: [['#.#'], ['###'], ['###']],
      avatar: { x: 1, y: 0, z: 0 },
      revealAll: true,
      looseItems: [{ pos: { x: 1, y: 0, z: 0 }, item: 'stone', count: 1 }],
    });
    const { state: after, events } = act(state, { type: 'mine', target: { x: 1, y: 0, z: 1 } });
    const lines = describeEvents(after, events);
    expect(lines).toContain('Got 1 Stone.');
    expect(lines).toContain('A loose pile of 1 Stone fell 1 block to layer 1.');
  });

  // A lit tunnel in layer 1: the miner at (1, 0), iron ore east of it at
  // (2, 0), and `row` is what lies beyond. Ending a shift first runs the
  // engine's reveal, so the mine that follows is an ordinary step.
  function minedOreEast(row: string): string[] {
    const built = buildState({
      layers: [['#######'], [row], ['#######']],
      avatar: { x: 1, y: 0, z: 1 },
      ap: 0,
    });
    const lit = endShift(built).state;
    const { state: after, events } = act(lit, { type: 'mine', target: { x: 2, y: 0, z: 1 } });
    return describeEvents(after, events);
  }

  it('mining a lone ore uncovers no traces, and nothing is said about any', () => {
    // The engine notes traces after the ore has gone, so there are none.
    const lines = minedOreEast('#.i####');
    expect(lines).toContain('Mined Iron ore.');
    expect(lines.join(' ')).not.toContain('mineral traces');
  });

  it('traces noticed in the step that mined ore are said to be from other ore', () => {
    // A second ore two cells behind the first: the rock between them shows
    // traces once the first ore is mined, and they are the second ore's.
    const lines = minedOreEast('#.i#i##');
    expect(lines).toContain(
      'You notice mineral traces in the rock this uncovered: other ore is near ' +
        '(the ore you just mined no longer counts). (On the map: D, % or h.)',
    );
    // It never tells the player to discount the hint.
    expect(lines.join(' ')).not.toContain('may come from');
    expect(lines.join(' ')).not.toContain('do not show');
  });

  it('traces noticed after mining plain rock read as before', () => {
    // The same tunnel with stone in place of the first ore.
    const built = buildState({
      layers: [['#######'], ['#.##i##'], ['#######']],
      avatar: { x: 1, y: 0, z: 1 },
      ap: 0,
    });
    const lit = endShift(built).state;
    const { state: after, events } = act(lit, { type: 'mine', target: { x: 2, y: 0, z: 1 } });
    expect(describeEvents(after, events)).toContain(
      'You notice mineral traces in the rock: ore is near. (On the map: D, % or h.)',
    );
  });
});

describe('ladder advice only where a ladder can go (issue #46 item 1)', () => {
  function notOffered(state: GameState): string[] {
    return buildView(state, { ...DEFAULT_VIEW, deepestZ: 0 }).notOffered;
  }
  const longest = AVATAR.maxChosenDropBlocks;

  it('leaves the advice out when the cell beside you holds a torch', () => {
    // A ledge on layer 0 with a pit east of it, one block too deep to drop into.
    const layers: string[][] = [['#..']];
    for (let z = 1; z <= 5; z += 1) {
      layers.push([z <= longest + 1 ? '##.' : '###']);
    }
    const east = { x: 2, y: 0, z: 0 };
    const state = buildState({
      layers,
      avatar: { x: 1, y: 0, z: 0 },
      revealAll: true,
      torches: [east],
      inventory: { ladder: 2 },
    });
    expect(resolveChoice(state, 'ladder-e')).toBeNull();
    expect(notOffered(state)).toEqual([
      `No move east: the drop there is more than ${longest} blocks.`,
    ]);
  });

  it('leaves the advice out when the cell below your ladder holds a torch', () => {
    const below = { x: 1, y: 0, z: 2 };
    const state = buildState({
      layers: [['#.#'], ['#.#'], ['#.#'], ['#.#'], ['#.#'], ['###']],
      avatar: { x: 1, y: 0, z: 1 },
      ladders: [
        { x: 1, y: 0, z: 0 },
        { x: 1, y: 0, z: 1 },
      ],
      torches: [below],
      revealAll: true,
      inventory: { ladder: 2 },
    });
    expect(resolveChoice(state, 'down')).toBeNull();
    expect(resolveChoice(state, 'ladder-down')).toBeNull();
    expect(notOffered(state)).toEqual([
      `No climb down: off the foot of your ladder the drop is more than ${longest} blocks.`,
    ]);
  });
});

describe('the surface map (issue #46 item 2)', () => {
  it('draws the surface and layer 0, with @ on the block the miner stands on', () => {
    // Issue #46 item 2 drew layer 0 alone, because the surface was open air
    // everywhere. Since the forest (issue #70) the surface is drawn beside it.
    const state = createRun(7, 'none', 'standard');
    const view = buildView(state, { ...DEFAULT_VIEW, deepestZ: -1 });
    expect(view.layers.map((layer) => layer.label)).toEqual(['surface', 'layer 0']);
    expect(view.layers[0]?.relation).toBe('yours');
    expect(view.layers[1]?.relation).toBe('under you');
    // Row and column 0 of the drawing are the edge, so (16, 16) is at 17, 17.
    expect(view.layers[0]?.rows[17]?.charAt(17)).toBe('@');
    expect(view.layers[1]?.rows[17]?.charAt(17)).toBe('@');
    const text = renderView(view);
    expect(text).toContain('@ you, on the surface: drawn on the block of layer 0 you stand on');
    // Two layers of 34 characters after the row label, with a gap of two.
    const row = text.split('\n').find((line) => line.startsWith('y 16 ')) ?? '';
    expect(row).toHaveLength('y 16 '.length + 2 * (state.size.x + 2) + 2);
    // The block under the miner is named where it is mined.
    expect(text).toContain('Mine below you: Dirt');
  });

  it('lists loose items lying on the surface', () => {
    const state = createRun(7, 'none', 'standard');
    state.looseItems = [
      { pos: { x: 3, y: 4, z: -1 }, item: 'stone', count: 2 },
      { pos: { ...state.avatar.pos }, item: 'coal', count: 1 },
    ];
    const text = defaultViewText(state);
    expect(text).toContain('Loose at x3 y4, the surface: 2 Stone');
    expect(text).toContain('Loose in your cell: 1 Coal');
  });

  it('one layer down the map is as before: your layer with those above and below', () => {
    const state = takeAll(createRun(7, 'none', 'standard'), ['mine-down']);
    const view = buildView(state, { ...DEFAULT_VIEW, deepestZ: 0 });
    expect(view.layers.map((layer) => layer.label)).toEqual(['surface', 'layer 0', 'layer 1']);
  });
});

describe('drop choices share a line (issue #46 item 3)', () => {
  it('prints drop-<item> and drop-all-<item> on one line', () => {
    const text = defaultViewText(createRun(7, 'none', 'standard'));
    expect(text).toContain('[0] Drop Ladder (one, or all 6): 15. drop-ladder  16. drop-all-ladder');
    expect(text).toContain('[0] Drop Timber (one, or all 2): 17. drop-timber  18. drop-all-timber');
  });

  it('a single carried item keeps its own line', () => {
    const state = createRun(7, 'none', 'standard');
    state.inventory = { timber: 1 };
    expect(defaultViewText(state)).toMatch(/\d+\. drop-timber +\[0\] Drop 1 Timber\n/);
  });
});

describe('the drop-all alias is strict (issue #46 item 4)', () => {
  it('reads drop-all-X as drop-X only while exactly one X is carried', () => {
    const state = createRun(7, 'none', 'standard');
    state.inventory = { timber: 1, ladder: 6 };
    expect(resolveChoice(state, 'drop-all-timber')).toMatchObject({ item: 'timber', count: 1 });
    // "drop-all-all-ladder" used to be read as "drop-all-ladder".
    expect(resolveChoice(state, 'drop-all-ladder')).toMatchObject({ item: 'ladder', count: 6 });
    expect(resolveChoice(state, 'drop-all-all-ladder')).toBeNull();
    expect(resolveChoice(state, 'drop-all-all-timber')).toBeNull();
    expect(resolveChoice(state, 'drop-all-all-all-timber')).toBeNull();
  });
});

describe('the forest in the play interface (issue #70)', () => {
  /** A 3 x 3 cube, the miner on the surface in the middle, a tree east of it. */
  function forest(): GameState {
    const state = buildState({
      layers: [
        ['ddd', 'ddd', 'ddd'],
        ['ddd', 'ddd', 'ddd'],
      ],
      surface: ['p.o', '..T', '...'],
      avatar: { x: 1, y: 1, z: -1 },
      fuel: 50,
    });
    updateReveal(state, []);
    return state;
  }

  it('draws the surface with a character for each kind, and names them in the legend', () => {
    const view = buildView(forest(), { ...DEFAULT_VIEW, deepestZ: -1 });
    const surface = view.layers.find((layer) => layer.z === -1);
    expect(surface?.rows).toEqual(['XXXXX', 'X:"^X', 'X"@YX', 'X"""X', 'XXXXX']);
    const text = renderView(view);
    expect(text).toContain('Y tree (blocks the way and hides the ground under it');
    expect(text).toContain(': dirt path (open)');
    expect(text).toContain('^ stone outcrop (open, over stone)');
    expect(text).toContain('" meadow (open)');
    // Layer 0 under the tree is unseen.
    const top = view.layers.find((layer) => layer.z === 0);
    expect(top?.rows[2]).toBe('Xd@?X');
  });

  it('offers cut-e, says why there is no move east, and names the stump', () => {
    const state = forest();
    const text = defaultViewText(state);
    expect(text).toMatch(/cut-e +\[2\] Cut the tree east: gives 2 Timber/);
    expect(text).toContain(
      'Not on the list: No move east: a tree stands there (cut-e cuts it down).',
    );
    const cut = resolveChoice(state, 'cut-e');
    expect(cut).toMatchObject({ type: 'cutTree', target: { x: 2, y: 1, z: -1 } });
    const after = act(state, { type: 'cutTree' });
    const afterText = defaultViewText(after.state);
    expect(describeEvents(after.state, after.events)).toContain(
      'You cut down the tree; a stump is left.',
    );
    expect(afterText).toContain(', stump (open; a tree grows back');
    expect(afterText).toContain(
      'Stump at x2 y1: a tree grows back in 10 shifts if nothing stands on it then.',
    );
  });

  it('says in the forecast where a tree grows back, and then that it grew', () => {
    let state = act(forest(), { type: 'cutTree' }).state;
    for (let shift = 1; shift < 10; shift += 1) {
      state = endShift(state).state;
    }
    expect(defaultViewText(state)).toContain('A tree grows back on the stump at x2 y1.');
    const { state: after, events } = endShift(state);
    expect(describeEvents(after, events)).toContain(
      'A tree grew back on a stump at x2 y1 (east of you).',
    );
  });
});
