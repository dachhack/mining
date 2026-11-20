// The play interface and camps (design doc v0.2 section 8; issue #100):
// "camp x,y" and why a patch is refused, "rest x,y", "decommission x,y", the
// camp on the map and in the notes, the discount area, and that none of it
// tells anything hidden.

import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../../src/data';
import { hashState } from '../../src/engine';
import type { Camp, GameState } from '../../src/engine';
import { setBlock } from '../../src/engine/state';
import { listedChoices, newSession } from '../../src/app/text/log';
import type { Session } from '../../src/app/text/log';
import { tooLittleApNote } from '../../src/app/text/missing';
import { campChoice, decommissionChoice, mineChoice, restChoice } from '../../src/app/text/squares';
import { buildView, renderView } from '../../src/app/text/view';
import { resolveChoice, splitChoices, takeChoices } from '../../tools/play/cli';
import { helpText } from '../../tools/play/help';
import { buildState } from '../engine/helpers';
import type { BuildStateOptions } from '../engine/helpers';

/** `count` rows of `width` copies of `char`: one layer of a hand-built cube. */
function layer(char: string, width = 7, count = 7): string[] {
  return Array.from({ length: count }, () => char.repeat(width));
}

/** A flat 7 x 7 field of stone with one camp kit in the stockpile. */
function field(options: Partial<BuildStateOptions> = {}): GameState {
  return buildState({
    layers: [layer('#'), layer('#'), layer('#')],
    stockpile: { campKit: 1 },
    ...options,
  });
}

const MIDDLE_CAMP: Camp = { pos: { x: 3, y: 3, z: 0 }, foundedShift: 1 };

/** The field with a camp standing in the middle. */
function campField(options: Partial<BuildStateOptions> = {}): GameState {
  return field({ stockpile: {}, camps: [MIDDLE_CAMP], ...options });
}

/** A session on a hand-made state: a generated run with its state swapped. */
function sessionOn(state: GameState): Session {
  const session = newSession(1, 'none', 'standard');
  session.state = state;
  return session;
}

function viewText(state: GameState): string {
  return renderView(buildView(state, { deepestDepth: 0 }));
}

describe('"camp x,y"', () => {
  it('founds a camp round the named square, and the view shows it', () => {
    const session = sessionOn(field({ ap: 4 }));
    const result = takeChoices(session, ['camp 3,3']);
    expect(result.refused).toBeNull();
    expect(result.lines).toEqual([
      '> Found a camp round x3 y3 (x2-4, y2-4): uses up 1 camp kit and takes the rest of the ' +
        'shift. The camp stands on x2-4, y2-4 (ground level). Its squares cannot be mined; ' +
        'mining near it is cheaper; camp recipes are on the list; "rest 3,3" restores crew health.',
    ]);
    expect(session.log.actions).toEqual([{ type: 'foundCamp', x: 3, y: 3, ap: 4 }]);

    const view = buildView(session.state, { deepestDepth: 0 });
    // The 9 camp squares are drawn "A"; the rest of the row is stone.
    expect(view.map.rows[1]).toBe('# # # # # # #');
    expect(view.map.rows[2]).toBe('# # A A A # #');
    expect(view.map.rows[3]).toBe('# # A A A # #');
    expect(view.map.rows[4]).toBe('# # A A A # #');
    expect(view.legend).toContain('A camp square (cannot be mined while the camp stands)');
    expect(view.notes).toContain(
      'Camp at x3 y3 (ground level), on x2-4, y2-4: it burns 1 fuel every 4 shifts. ' +
        '"rest 3,3" or "decommission 3,3".',
    );
    const text = renderView(view);
    expect(text).toContain('You have no camp kit.');
  });

  it('says how many centre squares can take a camp, and is not a line of the list', () => {
    const state = field();
    const text = viewText(state);
    expect(text).toContain('camp X,Y     [all AP left] Found a camp on the flat 3 x 3 patch');
    expect(text).toContain('You have 1 camp kit; 25 centre squares can take a camp now.');
    expect(buildView(state, { deepestDepth: 0 }).squares).toMatchObject({
      campKitsHeld: 1,
      campSites: 25,
    });
    expect(listedChoices(state).some((entry) => entry.type === 'foundCamp')).toBe(false);
  });

  it('a refused patch says why, and names the squares in the way', () => {
    // A tree.
    const surface = layer('.');
    surface[2] = '....T..';
    const treed = campChoice(field({ surface }), 3, 3);
    expect(treed.entry).toBeNull();
    expect(treed.refusal).toBe(
      'A camp needs clear ground, and the 3 x 3 patch round x3 y3 (x2-4, y2-4) has a tree on ' +
        'x4 y2. Cut it first.',
    );
    expect(treed.blockedSquares).toEqual([{ x: 4, y: 2 }]);

    // Not flat.
    const top = layer('#');
    top[2] = '##..###';
    const uneven = campChoice(field({ layers: [top, layer('#'), layer('#')] }), 3, 3);
    expect(uneven.refusal).toBe(
      'A camp needs a flat patch: all 9 squares at the same depth. x3 y3 is at depth 0; ' +
        'not level with it: x2 y2 (depth 1) and x3 y2 (depth 1).',
    );
    expect(uneven.blockedSquares).toEqual([
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ]);

    // Over the edge, off the map, no kit, another camp, a structure.
    expect(campChoice(field(), 0, 3).refusal).toContain('would reach over the edge of the map');
    expect(campChoice(field(), 9, 3).refusal).toContain('is not a square of the map');
    expect(campChoice(field({ stockpile: {} }), 3, 3).refusal).toContain('You have no camp kit');
    const second = campChoice(campField({ stockpile: { campKit: 1 } }), 4, 4);
    expect(second.refusal).toBe(
      'Another camp already stands on x3 y3, x4 y3, x3 y4 and x4 y4: camps do not overlap.',
    );
    const built = campChoice(field({ supports: [{ x: 2, y: 3, z: 0 }] }), 3, 3);
    expect(built.refusal).toContain('Something is placed on x2 y3');
  });

  it('refuses a patch with water, lava or gas on it', () => {
    const layers = [layer('.'), layer('#'), layer('#')];
    const here = { x: 4, y: 4, z: 0 };
    expect(campChoice(field({ layers, water: [here] }), 3, 3).refusal).toContain(
      'x4 y4 of the 3 x 3 patch round x3 y3 (x2-4, y2-4) is flooded',
    );
    expect(campChoice(field({ layers, lava: [here] }), 3, 3).refusal).toContain('lava on x4 y4');
    expect(campChoice(field({ layers, gas: [{ pos: here, units: 1 }] }), 3, 3).refusal).toContain(
      'gas on x4 y4',
    );
  });

  it('a refused choice changes nothing', () => {
    const session = sessionOn(field({ stockpile: {} }));
    const before = hashState(session.state);
    const result = takeChoices(session, ['camp 3,3', 'end']);
    expect(result.taken).toBe(0);
    expect(result.refused).toContain('Refused choice 1 of 2 ("camp 3,3"): You have no camp kit');
    expect(hashState(session.state)).toBe(before);
  });

  it('with no AP left says so', () => {
    expect(campChoice(field({ ap: 0 }), 3, 3).refusal).toBe(
      'Founding a camp takes the rest of the shift and needs at least 1 AP; you have 0 left this shift.',
    );
  });
});

describe('a camp on the map', () => {
  it('a mine of a camp square is refused, and says how to free it', () => {
    expect(mineChoice(campField(), 4, 4).refusal).toBe(
      'A camp stands on x4 y4: its squares cannot be mined while it stands. ' +
        'To mine there, decommission the camp first ("decommission 3,3").',
    );
  });

  it('lists the squares where mining is cheaper, row by row', () => {
    // A 12 x 3 strip with a camp at its west end (x 0 to 2). The squares 1 to
    // 4 steps east of it are x 3 to 6.
    const strip = buildState({
      layers: [layer('#', 12, 3), layer('#', 12, 3)],
      camps: [{ pos: { x: 1, y: 1, z: 0 }, foundedShift: 1 }],
    });
    const view = buildView(strip, { deepestDepth: 0 });
    expect(view.notes).toContain(
      'Mining costs 1 AP less (never below 1) near a camp: within 4 steps of a camp square and ' +
        'no more than 4 levels below the camp. Those squares now, by row: ' +
        'y0 x3-6; y1 x3-6; y2 x3-6',
    );
  });

  it('a mine near the camp says it is cheaper, and costs less', () => {
    const session = sessionOn(campField({ ap: 5 }));
    const result = takeChoices(session, ['mine 5,3', 'mine 0,0']);
    expect(result.lines[0]).toContain(
      'Mine x5 y3 (ground level): Stone, gives 1 Stone (1 AP less: near a camp)',
    );
    // (0, 0) is 2 + 2 = 4 steps from the camp's corner (2, 2): cheaper too.
    expect(result.lines[1]).toContain('(1 AP less: near a camp)');
    expect(session.state.ap).toBe(3);
    expect(session.log.actions).toEqual([
      { type: 'mine', x: 5, y: 3, ap: 1 },
      { type: 'mine', x: 0, y: 0, ap: 1 },
    ]);
  });

  it('says when upkeep is due, and the forecast counts it', () => {
    const due = campField({ shift: 4, fuel: 9 });
    const view = buildView(due, { deepestDepth: 0 });
    expect(view.notes.join('\n')).toContain('it burns 1 fuel when this shift ends');
    expect(view.forecast).toContain('fuel 9 -> 7 (-1 shift, -1 camp upkeep).');
    const notDue = buildView(campField({ shift: 3, fuel: 9 }), { deepestDepth: 0 });
    expect(notDue.forecast).toContain('fuel 9 -> 8 (-1 shift).');
  });

  it('says when a slump will destroy the camp', () => {
    // A wall 2 levels above the camp's floor, cracked and due this shift.
    const rows = (row: string): string[] => [row, row, row];
    const state = buildState({
      layers: [rows('#....'), rows('#....'), rows('#####'), rows('#####')],
      camps: [{ pos: { x: 2, y: 1, z: 2 }, foundedShift: 1 }],
      cracks: [{ pos: { x: 0, y: 1, z: 0 }, timer: 0 }],
    });
    const view = buildView(state, { deepestDepth: 2 });
    expect(view.forecast).toContain('THE PIT WALL SLUMPS: x0 y1 onto x1 y1.');
    expect(view.forecast).toContain('THE SLUMP DESTROYS THE CAMP at x2 y1.');
    const session = sessionOn(state);
    const result = takeChoices(session, ['end']);
    expect(result.lines[0]).toContain(
      'THE CAMP at x2 y1 IS DESTROYED: a slump reached one of its squares. It is lost, with its kit.',
    );
  });
});

describe('"rest x,y" and "decommission x,y"', () => {
  it('are lines of the list, once for each camp, and can be typed by name', () => {
    const state = campField();
    const names = buildView(state, { deepestDepth: 0 }).choices.map((choice) => choice.name);
    expect(names).toEqual(['rest 3,3', 'decommission 3,3', 'close-mine', 'end']);
    expect(resolveChoice(state, 'rest 3,3').entry).toEqual({ type: 'rest', x: 3, y: 3, ap: 5 });
    expect(resolveChoice(state, 'rest-3,3').entry).toEqual({ type: 'rest', x: 3, y: 3, ap: 5 });
    expect(resolveChoice(state, '1').entry).toEqual({ type: 'rest', x: 3, y: 3, ap: 5 });
    expect(resolveChoice(state, 'decommission 3,3').entry).toEqual({
      type: 'decommissionCamp',
      x: 3,
      y: 3,
      ap: 1,
    });
  });

  it('resting takes the rest of the shift and restores health when it ends', () => {
    const session = sessionOn(campField({ health: 4, ap: 3 }));
    const result = takeChoices(session, ['rest 3,3']);
    expect(result.lines[0]).toContain('> Rest at the camp at x3 y3: takes the rest of the shift');
    expect(result.lines[0]).toContain('The crew rests at the camp at x3 y3');
    expect(session.state.ap).toBe(0);
    const view = buildView(session.state, { deepestDepth: 0 });
    expect(view.forecast).toContain('The crew rests: health 4 -> 10');
    expect(view.notes.join('\n')).toContain('The crew is resting at the camp at x3 y3');

    const ended = takeChoices(session, ['end']);
    expect(ended.lines[0]).toContain('The crew rested: health +6, now 10.');
    expect(session.state.crew.health).toBe(10);
  });

  it('a rest or a decommission that names no camp says which camps there are', () => {
    expect(restChoice(campField(), 1, 1).refusal).toBe(
      'No camp is centred on x1 y1. A camp is named by its centre square: x3 y3.',
    );
    expect(decommissionChoice(field(), 3, 3).refusal).toBe(
      'There is no camp yet: found one first ("camp X,Y").',
    );
    expect(restChoice(campField({ ap: 0 }), 3, 3).refusal).toContain('needs at least 1 AP');
    expect(decommissionChoice(campField({ ap: 0 }), 3, 3).refusal).toContain('costs 1 AP');
  });

  it('decommissioning takes the camp off the map', () => {
    const session = sessionOn(campField());
    const result = takeChoices(session, ['decommission 3,3']);
    expect(result.lines[0]).toContain(
      'The camp at x3 y3 is taken down. Its squares can be mined again.',
    );
    const view = buildView(session.state, { deepestDepth: 0 });
    expect(view.map.rows[3]).toBe('# # # # # # #');
    expect(view.notes).toEqual([]);
  });
});

describe('camp recipes on the list', () => {
  it('appear only while a camp stands, worded as camp recipes', () => {
    const stockpile = { rawIronOre: 2, coal: 1 };
    const without = buildView(field({ stockpile }), { deepestDepth: 0 });
    expect(without.choices.map((choice) => choice.name)).toEqual([
      'craft-fuel',
      'close-mine',
      'end',
    ]);
    const withCamp = buildView(campField({ stockpile }), { deepestDepth: 0 });
    const smelt = withCamp.choices.find((choice) => choice.name === 'craft-iron-ingot');
    expect(smelt?.text).toBe('At the camp, craft Iron ingot (x2) from 2 Raw iron ore, 1 Coal');
    expect(smelt?.ap).toBe(1);

    const session = sessionOn(campField({ stockpile }));
    const result = takeChoices(session, ['craft-iron-ingot']);
    expect(result.lines[0]).toContain('Crafted Iron ingot (x2). Got 2 Iron ingot.');
  });
});

describe('chains and the "not possible now" line', () => {
  it('a comma inside a camp choice is not a break', () => {
    expect(splitChoices('camp 3,4, end, rest 3,4, decommission 3,4')).toEqual([
      'camp 3,4',
      'end',
      'rest 3,4',
      'decommission 3,4',
    ]);
  });

  it('founding and resting are never listed as missing for want of AP', () => {
    // 1 AP left on a field where every mine costs 1 (stone near the camp).
    // With a full shift's AP a camp or a rest would cost 5, more than the 1
    // AP left, but both cost "what is left", so neither is missing: there is
    // nothing to say.
    const state = campField({ ap: 1, stockpile: { campKit: 1 } });
    expect(tooLittleApNote(state)).toBeNull();
    // On a wider field the far stone (2 AP) is missing, and only that.
    const wide = buildState({
      layers: [layer('#', 12, 3), layer('#', 12, 3)],
      ap: 1,
      camps: [{ pos: { x: 1, y: 1, z: 0 }, foundedShift: 1 }],
    });
    expect(tooLittleApNote(wide)).toBe('15 mines cost more than the 1 AP you have left.');
  });
});

describe('nothing hidden is told', () => {
  it('the view and the refusals are the same whatever lies below the tops', () => {
    const top = layer('#');
    top[1] = '#.#####';
    const plain = campField({
      layers: [top, layer('#'), layer('#'), layer('#')],
      stockpile: { campKit: 1 },
    });
    const rich = campField({
      layers: [top, layer('#'), layer('#'), layer('#')],
      stockpile: { campKit: 1 },
    });
    // Change blocks below the tops of `rich`: ore two layers down everywhere.
    for (let y = 0; y < 7; y += 1) {
      for (let x = 0; x < 7; x += 1) {
        setBlock(rich, { x, y, z: 3 }, BLOCKS.ironOre.code);
      }
    }
    expect(viewText(rich)).toBe(viewText(plain));
    for (let y = 0; y < 7; y += 1) {
      for (let x = 0; x < 7; x += 1) {
        expect(campChoice(rich, x, y)).toEqual(campChoice(plain, x, y));
      }
    }
  });
});

describe('the help text', () => {
  it('states the camp rules', () => {
    const help = helpText();
    expect(help).toContain('camp X,Y                 found a camp on the 3 x 3 patch');
    expect(help).toContain('You start with 1 camp kit.');
    expect(help).toContain('The patch must be FLAT: all 9 squares at the same depth');
    expect(help).toContain(
      'MINING NEAR A CAMP IS CHEAPER: a mine costs 1 AP less (never less than 1)',
    );
    expect(help).toContain('within 4 steps of a camp square and no more than 4 levels deeper');
    expect(help).toContain('each camp uses up 1 fuel at the end of every 4th shift');
    expect(help).toContain('The kit is not given back.');
    expect(help).toContain('A camp is DESTROYED');
    expect(help).toContain('Iron ingot (x2): from 2 Raw iron ore, 1 Coal');
    expect(help).toContain('Camp kit: from 4 Iron ingot, 4 Timber, 2 Copper ingot');
  });
});
