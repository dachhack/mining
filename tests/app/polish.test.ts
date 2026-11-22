// T14 (issue #110): what the phone map and the phone's text gained. The
// tiles carry the tells, the worked squares and the edge of the area where
// mining is cheaper; the map opens on the pit or on open ground; the
// forecast is one line for each thing, the most dangerous first; and the
// phone has its own wording wherever the play tool names a command to type.

import { describe, expect, it } from 'vitest';
import { BLOCKS, STRUCTURES } from '../../src/data';
import { createRun, endShift, hashState, serialise } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { setGasOn, setLavaOn, setWaterOn } from '../../src/engine/standing';
import {
  armCharge,
  cloneState,
  setBlock,
  setCrackTimer,
  setGas,
  setLava,
  setStructure,
  setWater,
} from '../../src/engine/state';
import { PREPARED_KEY, SAVE_KEY, clearPrepared, loadPrepared } from '../../src/app/previewSession';
import type { SaveStore } from '../../src/app/previewSession';
import { tapOutcome } from '../../src/app/map/targets';
import { buildTile, openingSquare } from '../../src/app/map/tiles';
import { choiceLabel, describeEvents } from '../../src/app/text/describe';
import { tooLittleApNote } from '../../src/app/text/missing';
import { mineChoice } from '../../src/app/text/squares';
import { buildView, forecastTextLines, hazardsLines } from '../../src/app/text/view';
import { act, buildState, terrainLayers } from '../engine/helpers';
import type { BuildStateOptions } from '../engine/helpers';

/** A pit drawn from above (see `terrainLayers`): stone unless `materials` says otherwise. */
function pit(
  depths: string[],
  options: Omit<BuildStateOptions, 'layers'> = {},
  materials?: string[],
  layerCount?: number,
): GameState {
  return buildState({
    layers: terrainLayers(depths, materials, layerCount),
    fuel: 10,
    shift: 3, // a shift in which lava does not flow
    ...options,
  });
}

const NO_SIDES = { north: false, east: false, south: false, west: false };

describe('tiles carry the tells (design doc 3.7)', () => {
  it('damp stone, pitted rock and warm glow, from pockets the player has not seen', () => {
    const state = pit(['111'], {}, undefined, 6);
    // A water pocket under x0, a gas pocket under x1, lava two under x2.
    setBlock(state, { x: 0, y: 0, z: 2 }, BLOCKS.air.code);
    setWater(state, { x: 0, y: 0, z: 2 }, 1);
    setBlock(state, { x: 1, y: 0, z: 2 }, BLOCKS.air.code);
    setGas(state, { x: 1, y: 0, z: 2 }, 4);
    setBlock(state, { x: 2, y: 0, z: 3 }, BLOCKS.air.code);
    setLava(state, { x: 2, y: 0, z: 3 }, 1);
    expect(buildTile(state, 0, 0).tells).toMatchObject({ damp: true, pitted: false });
    expect(buildTile(state, 1, 0).tells).toMatchObject({ pitted: true, hairline: false });
    expect(buildTile(state, 2, 0).tells).toMatchObject({ warm: true, damp: false });
  });

  it('hairline glow on unstable ore; none on plain rock', () => {
    const state = pit(['00'], {}, ['U#']);
    expect(buildTile(state, 0, 0).tells.hairline).toBe(true);
    expect(buildTile(state, 1, 0).tells).toEqual({
      damp: false,
      pitted: false,
      warm: false,
      hairline: false,
    });
  });

  it('a tree hides the tell of the block under it', () => {
    const state = buildState({
      layers: [['#'], ['.'], ['#']],
      water: [{ x: 0, y: 0, z: 1 }],
      surface: ['T'],
    });
    expect(buildTile(state, 0, 0).tells.damp).toBe(false);
  });
});

describe('tiles mark the squares worked this shift (owner question 95)', () => {
  it('a mined square is worked until the shift ends', () => {
    const state = pit(['000']);
    const mined = act(state, { type: 'mine', x: 1, y: 0 }).state;
    expect(buildTile(mined, 1, 0).worked).toBe(true);
    expect(buildTile(mined, 0, 0).worked).toBe(false);
    const next = endShift(mined).state;
    expect(buildTile(next, 1, 0).worked).toBe(false);
  });
});

describe('the edge of the area where mining is cheaper', () => {
  it('is empty with no camp', () => {
    const state = pit(['000', '000', '000']);
    expect(buildTile(state, 1, 1).cheaperEdge).toEqual(NO_SIDES);
  });

  it('runs round the area: its outer squares have an edge, its inner squares none', () => {
    // A 21 x 21 field with a camp in the middle (x9-11, y9-11). Mining is
    // cheaper within 8 steps of a camp square.
    const rows = Array.from({ length: 21 }, () => '0'.repeat(21));
    const state = pit(rows, { camps: [{ pos: { x: 10, y: 10, z: 0 }, foundedShift: 1 }] });
    // The camp's own squares and the squares beside it are inside.
    expect(buildTile(state, 10, 10).cheaperEdge).toEqual(NO_SIDES);
    expect(buildTile(state, 12, 10).cheaperEdge).toEqual(NO_SIDES);
    // x19 y10 is 8 steps east of the camp square x11 y10: the last one inside.
    expect(buildTile(state, 19, 10).cheaper).toBe(true);
    expect(buildTile(state, 19, 10).cheaperEdge.east).toBe(true);
    expect(buildTile(state, 19, 10).cheaperEdge.west).toBe(false);
    // x20 y10 is outside: no discount and no edge.
    expect(buildTile(state, 20, 10).cheaper).toBe(false);
    expect(buildTile(state, 20, 10).cheaperEdge).toEqual(NO_SIDES);
  });
});

describe('where the map opens (issue #110)', () => {
  it('on the open ground nearest the middle, on a new run', () => {
    // Seed 110: open ground at x15 y15, a step from the middle (15.5, 15.5).
    // (It opened on the nearest coal in sight until question 140 took coal
    // off the top layer.)
    const state = createRun(110, 'none', 'standard');
    expect(openingSquare(state)).toEqual({ x: 15, y: 15 });
  });

  it('on the middle of the pit once something is dug', () => {
    const rows = ['000000', '000000', '000110', '000120', '000000', '000000'];
    expect(openingSquare(pit(rows))).toEqual({ x: 4, y: 3 });
  });

  it('on the nearest open ground; on the middle under an unbroken forest', () => {
    const open = buildState({
      layers: [['#####'], ['#####']],
      surface: ['TTTT.'],
    });
    expect(openingSquare(open)).toEqual({ x: 4, y: 0 });
    const forest = buildState({ layers: [['#####'], ['#####']], surface: ['TTTTT'] });
    expect(openingSquare(forest)).toEqual({ x: 2, y: 0 });
  });

  it('does not depend on what is under the tops', () => {
    const plain = createRun(7, 'none', 'standard');
    const scrambled = createRun(7, 'none', 'standard');
    // Turn every block below the top layer to coal: nothing the player sees changes.
    for (let z = 1; z < scrambled.size.z - 1; z += 1) {
      for (let y = 0; y < scrambled.size.y; y += 1) {
        for (let x = 0; x < scrambled.size.x; x += 1) {
          setBlock(scrambled, { x, y, z }, BLOCKS.coalSeam.code);
        }
      }
    }
    expect(openingSquare(scrambled)).toEqual(openingSquare(plain));
  });
});

describe('the forecast: one line for each thing, the most dangerous first', () => {
  /** A pit with water that will flow, a charge on a worked square, and a crack that will fall. */
  function busy(): GameState {
    const state = pit(['0123', '1111', '1131'], { worked: [{ x: 1, y: 1 }] }, [
      'd###',
      '####',
      '####',
    ]);
    setWaterOn(state, 2, 2, 2);
    setStructure(state, { x: 1, y: 1, z: 1 }, STRUCTURES.explosive.code);
    armCharge(state, { x: 1, y: 1, z: 1 }, 'explosive');
    return state;
  }

  it('puts what hurts the crew first and the fuel bookkeeping last', () => {
    const view = buildView(busy(), { deepestDepth: 3 });
    const lines = view.forecastLines;
    // The engine's forecast of crew damage comes first, then the total.
    expect(lines[0]).toBe(
      'THE CREW LOSES 6 health: the blast on x1 y1, where it worked this shift.',
    );
    expect(lines[1]).toBe('Crew health 10 -> 4: 6 damage in all.');
    expect(
      lines.findIndex((line) => line.includes('THE EXPLOSIVE on x1 y1 GOES OFF')),
    ).toBeGreaterThan(1);
    expect(lines[lines.length - 1]).toBe('5 unspent AP will be lost, fuel 10 -> 9 (-1 shift).');
    // Every line is one thing: the joined text is the lines in order.
    expect(view.forecast).toBe(lines.join(' '));
  });

  it('an explosion comes before a flow, and a flow before new cracks', () => {
    const state = pit(['0123', '1111', '1131']);
    setWaterOn(state, 2, 2, 2);
    setStructure(state, { x: 1, y: 1, z: 1 }, STRUCTURES.explosive.code);
    armCharge(state, { x: 1, y: 1, z: 1 }, 'explosive');
    const lines = buildView(state, { deepestDepth: 3 }).forecastLines;
    const at = (words: string): number => lines.findIndex((line) => line.includes(words));
    expect(at('THE EXPLOSIVE')).toBeGreaterThanOrEqual(0);
    expect(at('THE EXPLOSIVE')).toBeLessThan(at('fuel 10 -> 9'));
  });

  it('lava comes before water, and both before what the pumps take', () => {
    // Water on x3 flows; the pump on x5 y1 takes the water beside it on x5 y0.
    const state = pit(['333333', '333333'], {
      shift: 2,
      structures: [{ pos: { x: 5, y: 1, z: 3 }, structure: 'pump' }],
    });
    setLavaOn(state, 0, 0, 2, false);
    setWaterOn(state, 3, 0, 3);
    setWaterOn(state, 5, 0, 3);
    const lines = buildView(state, { deepestDepth: 3 }).forecastLines;
    const at = (words: string): number => lines.findIndex((line) => line.includes(words));
    expect(at('LAVA WILL FLOW')).toBeGreaterThanOrEqual(0);
    expect(at('LAVA WILL FLOW')).toBeLessThan(at('WATER WILL FLOW'));
    expect(at('WATER WILL FLOW')).toBeLessThan(at('The pumps will take water'));
  });

  it('the play tool prints a heading and one indented line for each', () => {
    const view = buildView(busy(), { deepestDepth: 3 });
    const printed = forecastTextLines(view);
    expect(printed[0]).toBe('If you end the shift now:');
    expect(printed).toHaveLength(view.forecastLines.length + 1);
    expect(printed[1]?.startsWith('  - THE CREW LOSES 6 health')).toBe(true);
  });

  it('a full lava source is one sentence, when it happens as well', () => {
    const state = pit(['030', '000'], { shift: 2 });
    setLavaOn(state, 1, 0, 3, true);
    const { state: after, events } = endShift(state);
    const told = describeEvents(after, events).join(' ');
    expect(told).toContain(
      'The lava source on x1 y0 was full to ground level: the 1 lava it poured drained away.',
    );
    expect(told).not.toContain('stood above ground level');
  });
});

describe('the Hazards list', () => {
  it('says what stands in the pit, so gas is never "none known"', () => {
    const state = pit(['222']);
    expect(hazardsLines(buildView(state, { deepestDepth: 2 }))).toEqual(['Hazards: none known']);
    setGasOn(state, 0, 0, 3);
    setWaterOn(state, 2, 0, 1);
    const lines = hazardsLines(buildView(state, { deepestDepth: 2 }));
    expect(lines[0]).toBe('Hazards:');
    expect(lines.join('\n')).toContain('  - water stands on 1 square:');
    expect(lines.join('\n')).toContain('  - gas stands on 1 square:');
  });

  it('counts lava sources', () => {
    const state = pit(['22']);
    setLavaOn(state, 0, 0, 1, true);
    setLavaOn(state, 1, 0, 1, false);
    expect(buildView(state, { deepestDepth: 2 }).hazards).toContain(
      'lava stands on 2 squares (1 is a source: it keeps pouring): it burns a crew working on or beside it',
    );
  });
});

describe("the phone's own wording (issue #110)", () => {
  /** A flat field with a camp in the middle and coal to craft with. */
  function campState(options: Partial<BuildStateOptions> = {}): GameState {
    const rows = Array.from({ length: 7 }, () => '0'.repeat(7));
    return pit(rows, {
      camps: [{ pos: { x: 3, y: 3, z: 0 }, foundedShift: 1 }],
      ...options,
    });
  }

  it('the camp note names buttons on the phone and commands in the play tool', () => {
    const state = campState();
    const phone = buildView(state, { deepestDepth: 0, audience: 'phone' }).notes.join('\n');
    const play = buildView(state, { deepestDepth: 0 }).notes.join('\n');
    expect(phone).toContain('Rest and Decommission are under "Other actions".');
    expect(phone).not.toContain('"rest 3,3"');
    expect(play).toContain('"rest 3,3" or "decommission 3,3".');
  });

  it("the phone's notes leave out what its map draws", () => {
    const state = campState({
      structures: [{ pos: { x: 0, y: 0, z: 0 }, structure: 'pump' }],
    });
    setBlock(state, { x: 6, y: 6, z: 1 }, BLOCKS.air.code);
    setWater(state, { x: 6, y: 6, z: 1 }, 1);
    const phone = buildView(state, { deepestDepth: 0, audience: 'phone' }).notes.join('\n');
    const play = buildView(state, { deepestDepth: 0 }).notes.join('\n');
    for (const words of ['On x0 y0: a pump', 'Tells on top blocks', 'Pumps on x0 y0', 'by row:']) {
      expect(play).toContain(words);
      expect(phone).not.toContain(words);
    }
    // Both name the tells as the design doc does.
    expect(play).toContain('damp: damp stone, water under or beside');
  });

  it('founding a camp says how to rest, in each view', () => {
    const rows = Array.from({ length: 7 }, () => '0'.repeat(7));
    const state = pit(rows, { stockpile: { campKit: 1 } });
    const { state: after, events } = act(state, { type: 'foundCamp', x: 3, y: 3 });
    expect(describeEvents(after, events, 'phone').join(' ')).toContain(
      '"Rest at the camp", under "Other actions", restores crew health.',
    );
    expect(describeEvents(after, events).join(' ')).toContain('"rest 3,3" restores crew health.');
  });

  it('noticing mineral traces points at the marks of each map', () => {
    const state = pit(['00'], {}, undefined, 4);
    setBlock(state, { x: 0, y: 0, z: 2 }, BLOCKS.ironOre.code);
    const { state: after, events } = act(state, { type: 'mine', x: 0, y: 0 });
    expect(describeEvents(after, events, 'phone').join(' ')).toContain(
      '(On the map: three gold dots.)',
    );
    expect(describeEvents(after, events).join(' ')).toContain('(On the map: D, % or h.)');
  });

  it('a listed choice has a short name for its button', () => {
    expect(choiceLabel({ type: 'craft', recipe: 'support', ap: 1 })).toBe('Craft Support');
    expect(choiceLabel({ type: 'craft', recipe: 'scannerCharge', ap: 1 })).toBe(
      'Craft Scanner charge',
    );
    expect(choiceLabel({ type: 'rest', x: 3, y: 3, ap: 5 })).toBe('Rest at the camp');
    expect(choiceLabel({ type: 'closeMine', ap: 0 })).toBe('Close the mine');
  });

  it('what costs too much AP is named by its button on the phone', () => {
    const state = campState({ ap: 0, stockpile: { coal: 1, stone: 1 } });
    // With no AP the note is the same for both: everything is missing.
    expect(tooLittleApNote(state, 'phone')).toBe(tooLittleApNote(state));
    const one = buildState({
      layers: [['H'], ['#']],
      ap: 1,
      stockpile: { timber: 1, stone: 1 },
    });
    const phone = tooLittleApNote(one, 'phone') ?? '';
    const play = tooLittleApNote(one) ?? '';
    expect(play).toContain('1 mine costs more than the 1 AP you have left');
    expect(phone).toContain('1 mine costs more than the 1 AP you have left');
    // No typed command reaches the phone.
    expect(phone).not.toMatch(/craft-|\[\d\]/);
  });
});

describe('refusals on the phone name buttons, not commands (review of PR #111)', () => {
  it('a tap on a camp square says where Decommission is', () => {
    const rows = Array.from({ length: 7 }, () => '0'.repeat(7));
    const state = pit(rows, { camps: [{ pos: { x: 3, y: 3, z: 0 }, foundedShift: 1 }] });
    const phone = tapOutcome(state, 3, 3).lines.join(' ');
    expect(phone).toContain(
      'A camp stands on x3 y3: its squares cannot be mined while it stands. ' +
        'To mine there, decommission the camp first ("Decommission" under "Other actions").',
    );
    expect(phone).not.toContain('decommission 3,3');
    // The play tool still names the command to type.
    expect(mineChoice(state, 3, 3).refusal).toContain('("decommission 3,3")');
  });

  it('a mine of a tree square says to tap the tree', () => {
    const state = buildState({ layers: [['##'], ['##']], surface: ['T.'] });
    expect(mineChoice(state, 0, 0, 'phone').refusal).toBe(
      'A tree stands on x0 y0: cut it first (tap the tree).',
    );
    expect(mineChoice(state, 0, 0).refusal).toBe(
      'A tree stands on x0 y0: cut it first ("cut 0,0").',
    );
  });

  it('no refusal a tap can give on the phone holds a typed command', () => {
    // A field with a camp, a tree, a dug square and nothing in the stockpile:
    // every tool is tried on every square.
    const rows = ['0000000', '0000000', '0000000', '0000000', '0000000', '0000010', '0000000'];
    const state = pit(rows, {
      camps: [{ pos: { x: 2, y: 2, z: 0 }, foundedShift: 1 }],
      surface: ['......T', '.......', '.......', '.......', '.......', '.......', '.......'],
    });
    const tools = ['dig', 'support', 'camp', 'explosive', 'pump', 'vent', 'seal', 'scan'] as const;
    // What the play tool types: a word and "x,y", or a craft name.
    const typed =
      /"(mine|cut|support|explosive|camp|rest|decommission|pump|vent|seal|scan|look)!? [0-9X]+,[0-9Y]+"|craft-[a-z]/;
    for (const tool of tools) {
      for (let y = 0; y < 7; y += 1) {
        for (let x = 0; x < 7; x += 1) {
          const text = tapOutcome(state, x, y, tool).lines.join(' ');
          expect(text, `${tool} on ${x},${y}`).not.toMatch(typed);
        }
      }
    }
  });
});

describe('the forecast says what each hazard takes off crew health (issue #112)', () => {
  it('names the worked squares water, lava, gas and a slump will reach', () => {
    // Water flows from x0 onto x1; gas stands on x3; lava stands beside x5.
    const state = pit(['3333333'], {
      shift: 2,
      worked: [
        { x: 1, y: 0 },
        { x: 3, y: 0 },
        { x: 5, y: 0 },
      ],
    });
    setWaterOn(state, 0, 0, 3);
    setGasOn(state, 3, 0, 2);
    setLavaOn(state, 6, 0, 1, false);
    const lines = buildView(state, { deepestDepth: 3 }).forecastLines;
    // One line for each kind, the first three lines, then the total: all of
    // it before the flows themselves. Equal amounts keep the engine's order.
    expect(lines.slice(0, 4)).toEqual([
      'THE CREW LOSES 1 health: water flowing onto x1 y0, where it worked this shift.',
      'THE CREW LOSES 1 health: lava beside x5 y0, where it worked this shift.',
      'THE CREW LOSES 1 health: gas on x3 y0, where it worked this shift.',
      'Crew health 10 -> 7: 3 damage in all.',
    ]);
    expect(lines.findIndex((line) => line.startsWith('WATER WILL FLOW'))).toBeGreaterThan(3);
    // Nothing hidden is uncovered, so there is no "may be more" line.
    expect(lines.join(' ')).not.toContain('you have not seen');
    // And it is true: ending the shift takes exactly that.
    expect(endShift(state).state.crew.health).toBe(7);
  });

  it('a slump that lands on a worked square', () => {
    // Dirt at the top of a slope that falls 2, cracked and due now; the crew
    // worked the square at the foot, where the block will land.
    const worked = pit(
      ['012'],
      { cracks: [{ pos: { x: 0, y: 0, z: 0 }, timer: 0 }], worked: [{ x: 2, y: 0 }] },
      ['ddd'],
    );
    const lines = buildView(worked, { deepestDepth: 3 }).forecastLines;
    expect(lines.join(' ')).toContain('THE PIT WALL SLUMPS');
    expect(lines[0]).toBe(
      'THE CREW LOSES 3 health: the slump at x2 y0, where it worked this shift.',
    );
    expect(lines[1]).toBe('Crew health 10 -> 7: 3 damage in all.');
    // The block that falls uncovers one the player has not seen.
    expect(lines[2]).toContain('A block you have not seen will be uncovered');
    expect(endShift(worked).state.crew.health).toBe(7);
  });

  it('the largest amount first; a run that would be lost is said first of all', () => {
    // Lava on the worked square x0 (5); water flows onto the worked x3 (1).
    const state = pit(['33333'], {
      shift: 3,
      health: 6,
      worked: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
      ],
    });
    setLavaOn(state, 0, 0, 1, false);
    setWaterOn(state, 4, 0, 3);
    const view = buildView(state, { deepestDepth: 3 });
    expect(view.forecastLines.slice(0, 4)).toEqual([
      'THE RUN WILL BE LOST if you end the shift now: the crew has 6 health; it loses 6.',
      'THE CREW LOSES 5 health: lava on x0 y0, where it worked this shift.',
      'THE CREW LOSES 1 health: water flowing onto x3 y0, where it worked this shift.',
      'Crew health 6 -> 0: 6 damage in all.',
    ]);
    expect(view.crewLostWarning).toBe(view.forecastLines[0]);
    expect(endShift(state).state.status).toMatchObject({ kind: 'ended', outcome: 'lost' });

    // With one more health the run goes on, and nothing warns of a loss.
    const safe = cloneState(state);
    safe.crew.health = 7;
    const safeView = buildView(safe, { deepestDepth: 3 });
    expect(safeView.crewLostWarning).toBeNull();
    expect(safeView.forecast).not.toContain('THE RUN');
  });

  it('"may" and "at least" are worded so, and a run that may be lost is said', () => {
    // A slump uncovers a hidden block, so the water that then flows onto the
    // worked square x1 y1 is a "may".
    const state = pit(['024', '122'], { worked: [{ x: 1, y: 1 }], health: 1 }, undefined);
    setCrackTimer(state, { x: 1, y: 0, z: 2 }, 0);
    setWaterOn(state, 0, 1, 1);
    // The map frames that square as "may be hurt".
    expect(buildTile(state, 1, 1)).toMatchObject({ crewHurt: true, crewHurtMayOnly: true });
    const view = buildView(state, { deepestDepth: 4 });
    expect(view.forecastLines.slice(0, 4)).toEqual([
      'THE RUN MAY BE LOST if you end the shift now: the crew has 1 health; it may lose 1.',
      'THE CREW MAY LOSE 1 health: water flowing onto x1 y1, where it worked this shift.',
      'Crew health 1 -> 1 for certain, 0 if all that may happen does: 0 damage is certain, 1 in all.',
      'A block you have not seen will be uncovered: if a pocket is under it, ' +
        'its water, lava or gas may hurt the crew more than this says.',
    ]);

    // A blast uncovers hidden blocks: gas far from it is "at least".
    const blast = pit(['111111'], { worked: [{ x: 5, y: 0 }] });
    setStructure(blast, { x: 2, y: 0, z: 1 }, STRUCTURES.explosive.code);
    armCharge(blast, { x: 2, y: 0, z: 1 }, 'explosive');
    setGasOn(blast, 5, 0, 1);
    expect(buildView(blast, { deepestDepth: 1 }).forecastLines[0]).toBe(
      'THE CREW LOSES AT LEAST 1 health: gas on x5 y0, where it worked this shift.',
    );
  });

  it('the map marks the worked squares where the crew will be hurt', () => {
    const state = pit(['3333333'], {
      shift: 2,
      worked: [
        { x: 1, y: 0 },
        { x: 4, y: 0 },
      ],
    });
    setWaterOn(state, 0, 0, 3);
    expect(buildTile(state, 1, 0)).toMatchObject({ crewHurt: true, crewHurtMayOnly: false });
    // Worked, but nothing reaches it; and not worked at all.
    expect(buildTile(state, 4, 0)).toMatchObject({ worked: true, crewHurt: false });
    expect(buildTile(state, 2, 0)).toMatchObject({ worked: false, crewHurt: false });
  });

  it('says nothing when no hazard reaches a worked square, or a vent will clear the gas', () => {
    const calm = pit(['3333333'], { shift: 2, worked: [{ x: 3, y: 0 }] });
    setWaterOn(calm, 0, 0, 3);
    expect(buildView(calm, { deepestDepth: 3 }).forecast).not.toContain('THE CREW');

    const vented = pit(['333'], {
      worked: [{ x: 0, y: 0 }],
      structures: [{ pos: { x: 2, y: 0, z: 3 }, structure: 'vent' }],
    });
    setGasOn(vented, 0, 0, 2);
    expect(buildView(vented, { deepestDepth: 3 }).forecast).not.toContain('THE CREW');
    expect(endShift(vented).state.crew.health).toBe(vented.crew.health);
  });
});

describe('the Hazards list is in order of urgency (review of PR #111)', () => {
  it('what is due when this shift ends comes first, stopped cracks last', () => {
    const state = pit(
      ['0120', '0000'],
      {
        cracks: [
          { pos: { x: 0, y: 0, z: 0 }, timer: 1 }, // due next shift
          { pos: { x: 3, y: 1, z: 0 }, timer: 0 }, // a stable square: stopped
        ],
      },
      ['d##d', '####'],
    );
    setStructure(state, { x: 0, y: 1, z: 0 }, STRUCTURES.explosive.code);
    armCharge(state, { x: 0, y: 1, z: 0 }, 'explosive');
    const hazards = buildView(state, { deepestDepth: 2 }).hazards;
    expect(hazards[0]).toContain('the explosive on x0 y1 goes off at the end of this shift');
    expect(hazards[1]).toContain('x0 y0 is cracked: due at the end of the next shift');
    expect(hazards[2]).toContain('x3 y1 is cracked, countdown stopped at 1');
  });
});

describe('a prepared state (for tests and screenshots)', () => {
  function memoryStore(): SaveStore & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
      removeItem: (key) => {
        data.delete(key);
      },
    };
  }

  it('is loaded as a run with no choices made, at the state it holds', () => {
    const state = pit(['012'], { fuel: 7 });
    const store = memoryStore();
    store.setItem(PREPARED_KEY, JSON.stringify(serialise(state)));
    const session = loadPrepared(store);
    expect(session).not.toBeNull();
    expect(hashState(session?.state ?? pit(['0']))).toBe(hashState(state));
    expect(session?.log.actions).toEqual([]);
    expect(session?.deepestDepth).toBe(2);
  });

  it('is nothing when the store has none, or holds something else', () => {
    const store = memoryStore();
    expect(loadPrepared(store)).toBeNull();
    expect(loadPrepared(null)).toBeNull();
    store.setItem(PREPARED_KEY, '{"not":"a state"}');
    expect(loadPrepared(store)).toBeNull();
    store.setItem(PREPARED_KEY, 'not json');
    expect(loadPrepared(store)).toBeNull();
  });

  it('is dropped if it cannot be shown: an item the data does not have', () => {
    const saved = serialise(pit(['012']));
    saved.stockpile = { unobtainium: 3 };
    const store = memoryStore();
    store.setItem(PREPARED_KEY, JSON.stringify(saved));
    expect(loadPrepared(store)).toBeNull();
  });

  it('clearing it leaves the saved run alone', () => {
    const store = memoryStore();
    store.setItem(PREPARED_KEY, 'x');
    store.setItem(SAVE_KEY, 'a run');
    clearPrepared(store);
    expect(store.data.has(PREPARED_KEY)).toBe(false);
    expect(store.data.get(SAVE_KEY)).toBe('a run');
  });
});
