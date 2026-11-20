// The play interface and gas, unstable ore and explosives (design doc v0.2
// sections 6.5, 6.6 and 11; issue #103): the map and its notes show gas,
// charges and armed ore, the Hazards line and the forecast say what will go
// off and which squares it covers, "explosive x,y" places a charge, a mine
// that would arm ore asks first, and none of it tells anything hidden.

import { describe, expect, it } from 'vitest';
import { BLOCKS, HAZARDS } from '../../src/data';
import { endShift } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { setGasOn, setLavaOn } from '../../src/engine/standing';
import { armCharge, setBlock, setGas, setStructure } from '../../src/engine/state';
import { STRUCTURES } from '../../src/data';
import { describeEvents } from '../../src/app/text/describe';
import { newSession } from '../../src/app/text/log';
import type { Session } from '../../src/app/text/log';
import { explosiveChoice, mineChoice, parseSquareChoice } from '../../src/app/text/squares';
import { buildView, renderView } from '../../src/app/text/view';
import { runCli, splitChoices, takeChoices } from '../../tools/play/cli';
import { buildState, terrainLayers } from '../engine/helpers';
import type { BuildStateOptions } from '../engine/helpers';

/** A pit drawn from above (see `terrainLayers`); shift 3, so lava does not flow. */
function pit(
  depths: string[],
  options: Omit<BuildStateOptions, 'layers'> = {},
  materials?: string[],
): GameState {
  return buildState({
    layers: terrainLayers(depths, materials, 6),
    fuel: 10,
    shift: 3,
    ...options,
  });
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

/** Put a placed, armed explosive on the square (x, y), as the action does. */
function plant(state: GameState, x: number, y: number, depth: number): void {
  setStructure(state, { x, y, z: depth }, STRUCTURES.explosive.code);
  armCharge(state, { x, y, z: depth }, 'explosive');
}

describe('the map and its notes', () => {
  it('draws gas as "*", with the depth, and notes the units and the block under it', () => {
    const state = pit(['2222']);
    setGasOn(state, 1, 0, 7);
    const view = buildView(state, { deepestDepth: 2 });
    expect(view.map.rows).toEqual(['#2*2#2#2']);
    expect(view.notes).toContain('On x1 y0: 7 gas, over Stone (2 AP)');
    expect(view.legend.join(' | ')).toContain(
      '* gas stands on the square: it takes 1 health if the crew works there',
    );
  });

  it('a pit with no gas has no "*" in its legend', () => {
    expect(buildView(pit(['2222']), { deepestDepth: 2 }).legend.join(' | ')).not.toContain('*');
  });

  it('notes a placed explosive and armed unstable ore, and lists both under Hazards', () => {
    const state = pit(['111'], { armed: [{ pos: { x: 2, y: 0, z: 1 }, kind: 'unstableOre' }] }, [
      '##U',
    ]);
    plant(state, 0, 0, 1);
    const view = buildView(state, { deepestDepth: 1 });
    expect(view.notes).toContain('On x0 y0: an explosive: it goes off when this shift ends');
    expect(view.notes).toContain('On x2 y0: ARMED unstable ore: it goes off when this shift ends');
    expect(view.hazards).toEqual([
      'the explosive on x0 y0 goes off at the end of this shift: its blast covers x0 y0 and x1 y0',
      'the unstable ore on x2 y0 is ARMED and goes off at the end of this shift ' +
        '(mine it first and it does not): its blast covers x2 y0 and x1 y0',
    ]);
  });
});

describe('armed ore that sealant has buried (review of PR #105)', () => {
  it('leaves the Hazards line: the player is not told of a blast that will not happen', () => {
    const state = pit(
      ['111', '111'],
      { armed: [{ pos: { x: 1, y: 0, z: 1 }, kind: 'unstableOre' }], stockpile: { sealant: 1 } },
      ['#U#', '###'],
    );
    expect(buildView(state, { deepestDepth: 1 }).hazards.join(' ')).toContain(
      'the unstable ore on x1 y0 is ARMED',
    );
    const session = sessionOn(state);
    expect(takeChoices(session, ['seal 1,0']).refused).toBeNull();
    const view = buildView(session.state, { deepestDepth: 1 });
    expect(view.hazards).toEqual([]);
    expect(view.forecast ?? '').not.toContain('GOES OFF');
    expect(view.notes.join(' ')).not.toContain('ARMED');
  });
});

describe('the forecast says what gas and charges will do (design doc 11)', () => {
  it('names the squares gas will reach, and then says that it did', () => {
    const state = pit(['222']);
    setGasOn(state, 1, 0, 9);
    expect(forecastOf(state)).toContain('GAS WILL SPREAD onto: x2 y0 (3), x0 y0 (3).');
    const { state: after, events } = endShift(state);
    expect(describeEvents(after, events)).toContain('Gas spread onto: x2 y0 (3), x0 y0 (3).');
  });

  it('says nothing of gas that only shifts between squares it already covers', () => {
    const state = pit(['22']);
    setGasOn(state, 0, 0, 6);
    setGasOn(state, 1, 0, 2);
    expect(forecastOf(state)).not.toContain('GAS');
    const { state: after, events } = endShift(state);
    expect(describeEvents(after, events).join(' ')).not.toContain('Gas spread');
  });

  it('says that a charge goes off, what its blast covers, and then what it destroyed', () => {
    const state = pit(['111'], { supports: [{ x: 2, y: 0, z: 1 }] }, ['#c#']);
    plant(state, 1, 0, 1);
    const forecast = forecastOf(state);
    expect(forecast).toContain(
      'THE EXPLOSIVE on x1 y0 GOES OFF: its blast covers x1 y0, x0 y0, x2 y0 and destroys ' +
        'their top blocks, with no yield.',
    );
    expect(forecast).toContain('The explosion will destroy the support on x2 y0.');
    expect(forecast).not.toContain('THE CREW');

    const { state: after, events } = endShift(state);
    const told = describeEvents(after, events);
    expect(told).toContain(
      'THE EXPLOSIVE on x1 y0 WENT OFF: its blast covered x1 y0, x0 y0, x2 y0.',
    );
    expect(told).toContain(
      'Destroyed, with no yield: Coal seam on x1 y0, Stone on x0 y0, Stone on x2 y0.',
    );
    expect(told).toContain('The support on x2 y0 was destroyed by an explosion.');
  });

  it('warns when the crew worked in the blast, and how much it loses', () => {
    const state = pit(['111'], { worked: [{ x: 0, y: 0 }] });
    plant(state, 1, 0, 1);
    expect(forecastOf(state)).toContain(
      'THE CREW LOSES 6 health: the blast on x0 y0, where it worked this shift.',
    );
    const { state: after, events } = endShift(state);
    expect(describeEvents(after, events)).toContain(
      'The crew lost 6 health to an explosion where it worked this shift (crew health is now 4).',
    );
  });

  it('says when gas will explode, and then that it did', () => {
    const state = pit(['112'], { worked: [{ x: 1, y: 0 }] });
    setLavaOn(state, 0, 0, 1, false);
    setGasOn(state, 2, 0, 3);
    // Lava at x0 is two squares from the gas: nothing yet.
    expect(forecastOf(state)).not.toContain('GAS EXPLODES');
    setGasOn(state, 1, 0, 1);
    expect(forecastOf(state)).toContain(
      'GAS EXPLODES on x1 y0, x2 y0: the gas burns off, and what is placed on those squares ' +
        'and beside them is destroyed.',
    );
    expect(forecastOf(state)).toContain(
      'THE CREW LOSES 3 health: a gas explosion at or beside x1 y0, where it worked this shift.',
    );
    const { state: after, events } = endShift(state);
    expect(describeEvents(after, events)).toContain(
      'GAS EXPLODED on x1 y0, x2 y0: the gas there burnt off.',
    );
  });

  it('a relic in the blast "may be destroyed"; afterwards the tool says which it was', () => {
    const state = pit(['00'], {}, ['r#']);
    plant(state, 1, 0, 0);
    expect(forecastOf(state)).toContain(
      'The Relic on x0 y0 is in the blast: it may be destroyed (50 chances in 100), and is ' +
        'otherwise left in place.',
    );
    const { state: after, events } = endShift(state);
    const told = describeEvents(after, events).join(' ');
    const survived = told.includes('The Relic on x0 y0 was in the blast and survived');
    const destroyed = told.includes('Relic on x0 y0');
    expect(survived || destroyed).toBe(true);
  });

  it('says when a blast destroys a tree, and a camp', () => {
    const state = pit(['0000000', '0000000', '0000000'], {
      surface: ['.......', '.....T.', '.......'],
      camps: [{ pos: { x: 1, y: 1, z: 0 }, foundedShift: 1 }],
    });
    plant(state, 4, 1, 0);
    const forecast = forecastOf(state);
    expect(forecast).toContain('THE EXPLOSION DESTROYS THE CAMP at x1 y1.');
    expect(forecast).toContain('The explosion will destroy the tree on x5 y1.');
    const { state: after, events } = endShift(state);
    const told = describeEvents(after, events);
    expect(told).toContain('The blast destroyed the tree on x5 y1: no timber, and no stump.');
    expect(told.join(' ')).toContain('THE CAMP at x1 y1 IS DESTROYED: an explosion reached it.');
  });
});

describe('"explosive x,y" places a charge', () => {
  it('is read as a square choice, alone and in a chain', () => {
    expect(parseSquareChoice('explosive 3,4')).toEqual({
      kind: 'explosive',
      confirmed: false,
      x: 3,
      y: 4,
    });
    expect(splitChoices('explosive 3,4, end')).toEqual(['explosive 3,4', 'end']);
  });

  it('places it, says so, and the charge goes off at the end of the shift', () => {
    const session = sessionOn(pit(['000', '000', '000'], { stockpile: { explosive: 1 } }));
    const placed = takeChoices(session, ['explosive 1,1']);
    expect(placed.refused).toBeNull();
    expect(placed.lines.join(' ')).toContain('Placed an explosive.');
    expect(session.log.actions).toEqual([{ type: 'placeExplosive', x: 1, y: 1, ap: 1 }]);
    const ended = takeChoices(session, ['end']);
    expect(ended.lines.join(' ')).toContain('THE EXPLOSIVE on x1 y1 WENT OFF');
    expect(buildView(session.state, { deepestDepth: 0 }).map.rows).toEqual([
      '# #1#',
      '#1#1#1',
      '# #1#',
    ]);
  });

  it('the how-to lines say how many there are', () => {
    const none = viewText(pit(['000']));
    expect(none).toContain('explosive X,Y [1] Place an explosive on square x X, y Y');
    expect(none).toContain('You have none: a camp makes them.');
    expect(viewText(pit(['000'], { stockpile: { explosive: 2 } }))).toContain('You have 2.');
  });

  it('a refused one says why', () => {
    const none = pit(['00']);
    expect(explosiveChoice(none, 0, 0).refusal).toContain('You have no explosive to place');

    const state = pit(['00', '10'], { stockpile: { explosive: 1 }, surface: ['T.', '..'] });
    setLavaOn(state, 0, 1, 1, false);
    expect(explosiveChoice(state, 0, 0).refusal).toBe(
      'A tree stands on x0 y0: nothing is placed on a tree.',
    );
    expect(explosiveChoice(state, 0, 1).refusal).toBe(
      'Lava stands on x0 y1: nothing is placed on lava.',
    );
    expect(explosiveChoice(state, 5, 5).refusal).toContain('is not a square of the map');
    expect(explosiveChoice({ ...state, ap: 0 }, 1, 0).refusal).toBe(
      'Placing an explosive costs 1 AP and you have 0 left this shift.',
    );
    plant(state, 1, 1, 0);
    expect(explosiveChoice(state, 1, 1).refusal).toBe(
      'Something is already placed on x1 y1: a square holds one thing.',
    );
  });
});

describe('a mine that would arm unstable ore asks first (design doc 6.6 and 11)', () => {
  it('warns with the ore, its blast and the ways out; "mine!" takes it', () => {
    const state = pit(['000'], {}, ['#U#']);
    const choice = mineChoice(state, 0, 0);
    expect(choice.entry).not.toBeNull();
    expect(choice.armsOre).toEqual([{ x: 1, y: 0 }]);
    expect(choice.warning).toBe(
      'Mining x0 y0 would ARM the unstable ore on x1 y0 (its blast covers x1 y0, x0 y0 and ' +
        'x2 y0): it goes off when this shift ends, and x0 y0 is in the blast, so the crew ' +
        'would lose 6 health. To avoid it, mine the ore itself first (it yields, and never ' +
        'goes off when mined) or place a support on its square before mining beside it.',
    );

    const session = sessionOn(state);
    const first = takeChoices(session, ['mine 0,0']);
    expect(first.refused).toContain('would ARM the unstable ore on x1 y0');
    expect(first.refused).toContain('type "mine! 0,0"');
    expect(session.log.actions).toEqual([]);

    const second = takeChoices(session, ['mine! 0,0']);
    expect(second.refused).toBeNull();
    expect(second.lines.join(' ')).toContain(
      'MINING BESIDE IT ARMED THE UNSTABLE ORE on x1 y0: it goes off when this shift ends',
    );
    const ended = takeChoices(session, ['end']);
    expect(ended.lines.join(' ')).toContain('THE UNSTABLE ORE on x1 y0 WENT OFF');
  });

  it('mining the ore itself, or beside braced ore, needs no confirmation', () => {
    const state = pit(['000'], {}, ['#U#']);
    expect(mineChoice(state, 1, 0).warning).toBeNull();
    const braced = pit(['000'], { supports: [{ x: 1, y: 0, z: 0 }] }, ['#U#']);
    expect(mineChoice(braced, 0, 0).warning).toBeNull();
  });

  it('ore the player has not seen gives no warning: nothing hidden is told', () => {
    const state = pit(['000'], { surface: ['.T.'] }, ['#U#']);
    const choice = mineChoice(state, 0, 0);
    expect(choice.warning).toBeNull();
    expect(choice.armsOre).toEqual([]);
  });
});

describe('nothing below a top leaks', () => {
  it('a gas pocket, a cavern or ore under the pit changes nothing the view prints', () => {
    function build(hidden: boolean): GameState {
      const state = pit(['1111'], { stockpile: { explosive: 1 } });
      if (hidden) {
        // More than 1 step below every top block, so that no tell shows.
        setBlock(state, { x: 1, y: 0, z: 3 }, BLOCKS.air.code);
        setGas(state, { x: 1, y: 0, z: 3 }, HAZARDS.gas.pocketUnitsPerCell);
        setBlock(state, { x: 2, y: 0, z: 3 }, BLOCKS.air.code);
        setBlock(state, { x: 3, y: 0, z: 2 }, BLOCKS.unstableOre.code);
      }
      setGasOn(state, 0, 0, 5);
      plant(state, 2, 0, 1);
      return state;
    }
    expect(viewText(build(true))).toBe(viewText(build(false)));
  });
});

describe('the rules text', () => {
  it('explains gas, unstable ore and explosives, and no longer says they do nothing', () => {
    const help = runCli(['--help']).output;
    expect(help).toContain('Gas, unstable ore and explosives');
    expect(help).toContain('It is heavier than air');
    expect(help).toContain('with 9 units and 2 such neighbours, 3 go to each and 3 stay');
    expect(help).toContain('ARMS it');
    expect(help).toContain('explosive X,Y');
    expect(help).toContain('Placing an explosive is not work on that square');
    expect(help).toContain('"~" water, "!" lava, "*" gas');
    expect(help).not.toContain('it does not spread');
    expect(help).not.toContain('Unstable ore does not explode yet');
  });
});
