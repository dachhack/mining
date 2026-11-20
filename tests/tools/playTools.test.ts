// The play interface and the camp-made tools (design doc v0.2 sections 4.1,
// 6.3, 7.2 and 11; owner question 93; issue #104): "pump X,Y", "seal X,Y" and
// "scan X,Y" are taken by name like a mine, a refusal says why, the notes
// say where pumps stand and what is known under the tops, "look X,Y" lists a
// square's known blocks, and none of it tells anything a scan did not show.

import { describe, expect, it } from 'vitest';
import { endShift } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { setLavaOn, setWaterOn } from '../../src/engine/standing';
import { describeEvents } from '../../src/app/text/describe';
import { newSession } from '../../src/app/text/log';
import type { Session } from '../../src/app/text/log';
import { pumpChoice, scanChoice, sealChoice } from '../../src/app/text/squares';
import { buildView, lookLines, renderView } from '../../src/app/text/view';
import { resolveChoice, runCli, splitChoices, takeChoices } from '../../tools/play/cli';
import { buildState, terrainLayers } from '../engine/helpers';
import type { BuildStateOptions } from '../engine/helpers';

/** A stone pit drawn from above (see `terrainLayers`). Shift 3: lava does not flow. */
function pit(depths: string[], options: Omit<BuildStateOptions, 'layers'> = {}): GameState {
  return buildState({ layers: terrainLayers(depths), fuel: 10, shift: 3, ...options });
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

/** Iron ore, then a 1-cell water pocket, under the middle of a 3 x 3 surface. */
function prospect(options: Omit<BuildStateOptions, 'layers'> = {}): GameState {
  return buildState({
    layers: [
      ['###', '###', '###'],
      ['###', '#i#', '###'],
      ['###', '#.#', '###'],
      ['###', '###', '###'],
      ['###', '###', '###'],
    ],
    water: [{ x: 1, y: 1, z: 2 }],
    stockpile: { scannerCharge: 1 },
    ...options,
  });
}

describe('pump X,Y', () => {
  it('places a pump, and the view then says where it stands and what it does', () => {
    const session = sessionOn(pit(['222'], { stockpile: { pump: 1 } }));
    const result = takeChoices(session, ['pump 1,0']);
    expect(result.refused).toBeNull();
    expect(result.lines.join('\n')).toContain('Placed a pump.');
    const view = buildView(session.state, { deepestDepth: 2 });
    expect(view.notes).toContain('On x1 y0: a pump');
    expect(view.notes.join('\n')).toContain(
      'Pumps on x1 y0: each takes up to 3 water a shift from the squares within 2 steps of it',
    );
  });

  it('is on offer only while a pump is held', () => {
    expect(viewText(pit(['222']))).not.toContain('pump X,Y');
    expect(viewText(pit(['222'], { stockpile: { pump: 2 } }))).toContain(
      'pump X,Y     [1] Place a pump on square x X, y Y: each shift it takes up to 3 water ' +
        'from the squares within 2 steps. You have 2.',
    );
  });

  it('a refusal says why', () => {
    expect(pumpChoice(pit(['222']), 1, 0).refusal).toContain('You have no pump to place');
    const state = pit(['222'], { stockpile: { pump: 1 }, supports: [{ x: 0, y: 0, z: 2 }] });
    setLavaOn(state, 2, 0, 1, false);
    expect(pumpChoice(state, 0, 0).refusal).toContain('Something is already placed on x0 y0');
    expect(pumpChoice(state, 2, 0).refusal).toContain('Lava stands on x2 y0');
    expect(pumpChoice(state, 9, 0).refusal).toContain('is not a square of the map');
    expect(pumpChoice({ ...state, ap: 0 }, 1, 0).refusal).toContain(
      'Placing a pump costs 1 AP and you have 0 left',
    );
  });

  it('the forecast says what the pumps will take, and the next view that they did', () => {
    const state = pit(['333'], { structures: [{ pos: { x: 0, y: 0, z: 3 }, structure: 'pump' }] });
    setWaterOn(state, 1, 0, 1);
    const forecast = buildView(state, { deepestDepth: 3 }).forecast ?? '';
    expect(forecast).toContain('The pumps will take water: 1 from x1 y0.');
    const { state: after, events } = endShift(state);
    expect(describeEvents(after, events)).toContain('The pumps took water: 1 from x1 y0.');
  });
});

describe('seal X,Y', () => {
  it('seals a square and says what the sealant destroyed', () => {
    const state = pit(['121'], { stockpile: { sealant: 1 } });
    setWaterOn(state, 1, 0, 2);
    const session = sessionOn(state);
    const result = takeChoices(session, ['seal 1,0']);
    expect(result.refused).toBeNull();
    expect(result.lines.join('\n')).toContain(
      'Sealed x1 y0: its top block is now sealed rock (depth 1). The 2 water on it is destroyed.',
    );
    // Sealed rock has its own character on the map.
    expect(buildView(session.state, { deepestDepth: 2 }).map.rows).toEqual(['#1=1#1']);
  });

  it('a refusal says why, and names the deeper squares', () => {
    expect(sealChoice(pit(['121']), 1, 0).refusal).toContain('You have no sealant');
    const state = pit(['0112'], { stockpile: { sealant: 1 } });
    expect(sealChoice(state, 0, 0).refusal).toContain('x0 y0 is at ground level');
    const steep = sealChoice(state, 2, 0);
    expect(steep.refusal).toContain(
      'x2 y0 is at depth 1, and the sealed rock would leave it 2 levels above x3 y0 (depth 2)',
    );
    expect(steep.blockedSquares).toEqual([{ x: 3, y: 0 }]);
    expect(sealChoice(state, 3, 0).entry).toEqual({ type: 'seal', x: 3, y: 0, ap: 1 });
  });
});

describe('scan X,Y and look X,Y', () => {
  it('a scan lists what it showed, square by square, from the top down', () => {
    const session = sessionOn(prospect());
    const result = takeChoices(session, ['scan 1,1']);
    expect(result.refused).toBeNull();
    const told = result.lines.join('\n');
    expect(told).toContain('Scanned round x1 y1: 27 blocks are newly known.');
    expect(told).toContain(
      'under x1 y1: depth 1 Iron ore, damp (gives 1 Raw iron ore); depth 2 open space: 1 water (a pocket); depth 3 Stone, mineral traces, damp',
    );
    // Traces on the scanned rock beside the ore are said once.
    expect(told).toContain('You notice mineral traces');
  });

  it('the notes then mark what lies beneath, and the map itself still shows only tops', () => {
    const before = prospect();
    const session = sessionOn(prospect());
    takeChoices(session, ['scan 1,1']);
    const view = buildView(session.state, { deepestDepth: 0 });
    expect(view.map.rows).toEqual(buildView(before, { deepestDepth: 0 }).map.rows);
    expect(view.notes.join('\n')).toContain(
      'Known under the tops (scanned, or buried after you saw it): ore under x1 y1; a pocket under x1 y1. ' +
        '"look X,Y" lists what you know under a square.',
    );
    // Before the scan there is no such note.
    expect(buildView(before, { deepestDepth: 0 }).notes.join('\n')).not.toContain(
      'Known under the tops',
    );
  });

  it("look lists a square's known blocks; before a scan it knows none", () => {
    const before = prospect();
    expect(lookLines(before, 1, 1)).toEqual([
      'x1 y1 (ground level): Stone (2 AP).',
      '  The top block shows: mineral traces.',
      '  Nothing is known under the top block: only a scan shows what is below.',
    ]);
    const session = sessionOn(prospect());
    takeChoices(session, ['scan 1,1']);
    expect(lookLines(session.state, 1, 1)).toEqual([
      'x1 y1 (ground level): Stone (2 AP).',
      '  The top block shows: mineral traces.',
      '  Known under the top block:',
      '    depth 1: Iron ore, damp (gives 1 Raw iron ore)',
      '    depth 2: open space: 1 water (a pocket)',
      '    depth 3: Stone, mineral traces, damp',
    ]);
  });

  it('a look is not a choice taken: nothing is done, and the chain goes on', () => {
    const session = sessionOn(prospect());
    const before = session.log.actions.length;
    const result = takeChoices(session, ['look 1,1', 'scan 1,1', 'look 1,1']);
    expect(result.refused).toBeNull();
    expect(result.taken).toBe(1);
    expect(session.log.actions.length).toBe(before + 1);
    expect(result.lines.join('\n')).toContain('depth 1: Iron ore');
    expect(resolveChoice(session.state, 'look 9,9').refusal).toContain('is not a square');
  });

  it('a scan is refused without a charge, or with too little AP', () => {
    expect(scanChoice(prospect({ stockpile: {} }), 1, 1).refusal).toContain(
      'You have no scanner charge',
    );
    expect(scanChoice({ ...prospect(), ap: 1 }, 1, 1).refusal).toContain(
      'A scan costs 2 AP and you have 1 left',
    );
  });

  it('the commas inside the new choices are not breaks in a chain', () => {
    expect(splitChoices('pump 3,4, seal 5,6,scan 7,8, look 1,2, end')).toEqual([
      'pump 3,4',
      'seal 5,6',
      'scan 7,8',
      'look 1,2',
      'end',
    ]);
  });
});

describe('the drill', () => {
  it('the mine line and the view say hard rock is cheaper with a drill', () => {
    const state = buildState({
      layers: terrainLayers(['00'], ['H#']),
      stockpile: { drill: 1 },
    });
    expect(viewText(state)).toContain('You have a drill: Hard rock costs 2.');
    const session = sessionOn(state);
    const result = takeChoices(session, ['mine 0,0']);
    expect(result.lines.join('\n')).toContain('(1 AP less: you have a drill)');
    expect(session.state.ap).toBe(state.ap - 2);
  });
});

describe('nothing hidden is told', () => {
  it('what lies under the tops changes nothing the view prints until it is scanned', () => {
    const plain = buildState({
      layers: [['###'], ['###'], ['###'], ['###'], ['###']],
      stockpile: { scannerCharge: 1 },
    });
    // Hard rock and dirt under the tops, and a cavern: no ore, so no tell.
    const other = buildState({
      layers: [['###'], ['H#d'], ['#.#'], ['###'], ['dd#']],
      stockpile: { scannerCharge: 1 },
    });
    expect(viewText(other)).toBe(viewText(plain));
    expect(lookLines(other, 1, 0)).toEqual(lookLines(plain, 1, 0));
    // After the same scan, the two views differ: the scan is what told.
    const scannedPlain = sessionOn(plain);
    const scannedOther = sessionOn(other);
    takeChoices(scannedPlain, ['scan 1,0']);
    takeChoices(scannedOther, ['scan 1,0']);
    expect(lookLines(scannedOther.state, 0, 0)).not.toEqual(lookLines(scannedPlain.state, 0, 0));
    // What lies below the scan's 3 blocks still does not show.
    const deepOnly = buildState({
      layers: [['###'], ['###'], ['###'], ['###'], ['dd#']],
      stockpile: { scannerCharge: 1 },
    });
    const scannedDeep = sessionOn(deepOnly);
    takeChoices(scannedDeep, ['scan 1,0']);
    expect(viewText(scannedDeep.state)).toBe(viewText(scannedPlain.state));
  });
});

describe('--help', () => {
  it('explains the camp tools', () => {
    const help = runCli(['--help']).output;
    expect(help).toContain('Camp tools');
    expect(help).toContain('pump X,Y');
    expect(help).toContain('seal X,Y');
    expect(help).toContain('scan X,Y');
    expect(help).toContain('look X,Y');
    expect(help).toContain(
      'each pump takes up to 3 units of water from the squares within 2 steps',
    );
    expect(help).toContain('This is the only way to see what lies');
    expect(help).toContain('hard rock costs 2 AP to mine instead of 3');
  });
});
