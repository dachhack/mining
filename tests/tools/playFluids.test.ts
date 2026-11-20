// The play interface and water and lava (design doc v0.2 sections 4.2, 6.3,
// 6.4 and 11; issue #99): the map and its notes show what stands on squares,
// the forecast says where it will flow, a refused mine says why, and none of
// it tells anything hidden.

import { describe, expect, it } from 'vitest';
import { endShift } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { setLavaOn, setWaterOn } from '../../src/engine/standing';
import { describeEvents } from '../../src/app/text/describe';
import { newSession } from '../../src/app/text/log';
import type { Session } from '../../src/app/text/log';
import { mineChoice, supportChoice } from '../../src/app/text/squares';
import { buildView, renderView } from '../../src/app/text/view';
import { runCli, takeChoices } from '../../tools/play/cli';
import { buildState, terrainLayers } from '../engine/helpers';
import type { BuildStateOptions } from '../engine/helpers';

/** A stone pit drawn from above (see `terrainLayers`). Shift 2 is a lava shift. */
function pit(depths: string[], options: Omit<BuildStateOptions, 'layers'> = {}): GameState {
  return buildState({ layers: terrainLayers(depths), fuel: 10, ...options });
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

/** The "If you end the shift now" line of a state's view. */
function forecastOf(state: GameState): string {
  return buildView(state, { deepestDepth: 0 }).forecast ?? '';
}

describe('the map and its notes', () => {
  it('draws water as "~" and lava as "!", with the depth, and notes what is under them', () => {
    const state = pit(['2222']);
    setWaterOn(state, 0, 0, 2);
    setLavaOn(state, 2, 0, 1, true);
    const view = buildView(state, { deepestDepth: 2 });
    expect(view.map.rows).toEqual(['~2#2!2#2']);
    expect(view.notes).toContain('On x0 y0: 2 water, over Stone (2 AP)');
    expect(view.notes).toContain(
      'On x2 y0: 1 lava (a source: it keeps pouring), over Stone (2 AP)',
    );
    const legend = view.legend.join(' | ');
    expect(legend).toContain('~ water stands on the square: mining it costs 1 AP more');
    expect(legend).toContain('! lava stands on the square: it cannot be mined');
  });

  it('a dry pit has neither character in its legend', () => {
    const legend = buildView(pit(['2222']), { deepestDepth: 2 }).legend.join(' | ');
    expect(legend).not.toContain('~');
    expect(legend).not.toContain('!');
  });
});

describe('the forecast says where water and lava will flow (design doc 11)', () => {
  it('names each move, and agrees with what ending the shift then does', () => {
    // Two pits with ground between them: water in the north one, lava in
    // the south one.
    const state = pit(['44', '00', '43'], { shift: 2 });
    setWaterOn(state, 0, 0, 4);
    setLavaOn(state, 0, 2, 3, false);
    const forecast = forecastOf(state);
    // 4 units at level 0 beside a dry square at level 4: two move across.
    expect(forecast).toContain('WATER WILL FLOW: x0 y0 to x1 y0 (2 units).');
    expect(forecast).toContain('LAVA WILL FLOW: x0 y2 to x1 y2.');

    const { state: after, events } = endShift(state);
    const told = describeEvents(after, events);
    expect(told).toContain('Water flowed: x0 y0 to x1 y0 (2 units).');
    expect(told).toContain('Lava flowed: x0 y2 to x1 y2.');
  });

  it('says nothing of lava in a shift in which it does not flow', () => {
    const state = pit(['12'], { shift: 3 });
    setLavaOn(state, 0, 0, 1, false);
    expect(forecastOf(state)).not.toContain('LAVA WILL FLOW');
    state.shift = 2;
    expect(forecastOf(state)).toContain('LAVA WILL FLOW: x0 y0 to x1 y0.');
  });

  it('says what a source will pour, what will drain, and where stone will form', () => {
    const state = pit(['030', '000'], { shift: 2 });
    setLavaOn(state, 1, 0, 3, true); // full: what it pours is over the brim
    // One sentence for a full source, not "will pour" and then "will drain" (issue #110).
    expect(forecastOf(state)).toContain(
      'The lava source on x1 y0 is full to ground level: the 1 lava it pours will drain away.',
    );
    expect(forecastOf(state)).not.toContain('will pour 1 more lava');
    // A source with room pours as before.
    const room = pit(['030', '000'], { shift: 2 });
    setLavaOn(room, 1, 0, 1, true);
    expect(forecastOf(room)).toContain('The lava source on x1 y0 will pour 1 more lava.');

    const meeting = pit(['3'], { shift: 3 });
    setWaterOn(meeting, 0, 0, 1);
    setLavaOn(meeting, 0, 0, 1, false);
    expect(forecastOf(meeting)).toContain(
      'Water will meet lava on x0 y0: they turn to stone, and the square comes up 1 level.',
    );
    const { state: after, events } = endShift(meeting);
    expect(describeEvents(after, events)).toContain(
      'Water met lava on x0 y0: they turned to stone, and the square came up 1 level.',
    );
  });

  it('says which support the lava will destroy, and then that it did', () => {
    const state = pit(['12'], { shift: 2, supports: [{ x: 1, y: 0, z: 2 }] });
    setLavaOn(state, 0, 0, 1, false);
    expect(forecastOf(state)).toContain('The support on x1 y0 will be destroyed by lava.');
    const { state: after, events } = endShift(state);
    expect(describeEvents(after, events)).toContain('The support on x1 y0 was destroyed by lava.');
  });

  it('says when water will destroy a camp, and then that it did', () => {
    // A camp on a floor 2 deep (x 0..2); a full hole 3 deep east of it.
    const state = pit(['2220', '2223', '2220'], {
      camps: [{ pos: { x: 1, y: 1, z: 2 }, foundedShift: 1 }],
    });
    setWaterOn(state, 3, 1, 3);
    expect(forecastOf(state)).toContain('THE WATER DESTROYS THE CAMP at x1 y1.');
    const { state: after, events } = endShift(state);
    expect(after.camps).toEqual([]);
    expect(describeEvents(after, events).join(' ')).toContain('water entered one of its squares');
  });

  it('a dry pit forecasts no flow', () => {
    expect(forecastOf(pit(['121']))).not.toContain('FLOW');
  });
});

describe('mining and placing with water or lava on the square', () => {
  it('a mine on a lava square is refused with the reason', () => {
    const state = pit(['11', '11']);
    setLavaOn(state, 0, 0, 1, false);
    const choice = mineChoice(state, 0, 0);
    expect(choice.entry).toBeNull();
    expect(choice.refusal).toContain(
      'Lava stands on x0 y0: a square with lava on it cannot be mined.',
    );
    // Through the tool: refused, and nothing is done.
    const session = sessionOn(state);
    const result = takeChoices(session, ['mine 0,0']);
    expect(result.refused).toContain('Lava stands on x0 y0');
    expect(session.log.actions).toEqual([]);
  });

  it('a mine on a flooded square costs 1 AP more, and a refusal for AP says why', () => {
    const state = pit(['11', '11']);
    setWaterOn(state, 0, 0, 1);
    expect(mineChoice(state, 0, 0).entry).toEqual({ type: 'mine', x: 0, y: 0, ap: 3 });
    expect(mineChoice(state, 1, 0).entry).toEqual({ type: 'mine', x: 1, y: 0, ap: 2 });
    expect(mineChoice({ ...state, ap: 2 }, 0, 0).refusal).toBe(
      'Mining x0 y0 costs 3 AP (1 of it because water stands on the square) and you have 2 ' +
        'left this shift.',
    );
  });

  it('nothing is placed on lava', () => {
    const state = pit(['11'], { stockpile: { support: 1 } });
    setLavaOn(state, 0, 0, 1, false);
    expect(supportChoice(state, 0, 0).refusal).toBe(
      'Lava stands on x0 y0: nothing is placed on lava.',
    );
    expect(supportChoice(state, 1, 0).entry).not.toBeNull();
  });
});

describe('nothing below a top leaks', () => {
  it('a pocket under the pit changes nothing the view prints', () => {
    // The same pit twice; one has a water pocket and a lava pocket under it,
    // more than 2 steps below every top block (so that no tell shows).
    const layers = [['....'], ['####'], ['####'], ['####'], ['#..#'], ['####']];
    const dry = buildState({ layers, fuel: 10, shift: 2 });
    const wet = buildState({
      layers,
      fuel: 10,
      shift: 2,
      water: [{ x: 1, y: 0, z: 4 }],
      lavaSources: [{ x: 2, y: 0, z: 4 }],
    });
    for (const state of [dry, wet]) {
      setWaterOn(state, 0, 0, 1);
    }
    expect(viewText(wet)).toBe(viewText(dry));
  });
});

describe('the rules text', () => {
  it('explains water and lava', () => {
    const help = runCli(['--help']).output;
    expect(help).toContain('Water and lava');
    expect(help).toContain('WATER FLOWS when a shift ends');
    expect(help).toContain(
      'LAVA flows by the same rule (across a drop of 2 or more), but only at the end of even-numbered',
    );
    expect(help).toContain('A square with lava on it cannot be');
    expect(help).toContain('one unit of each turns into a block of');
    expect(help).toContain('"~" water, "!" lava');
  });
});
