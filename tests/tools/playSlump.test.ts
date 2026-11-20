// The play interface and pit walls that slump (design doc v0.2 sections 6.1
// and 11; issue #94): "support x,y", the warning before a mine that would
// make squares unstable, cracks and slumps in the view, and that none of it
// tells anything hidden.

import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../../src/data';
import { endShift, hashState } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { setBlock } from '../../src/engine/state';
import { describeEvents } from '../../src/app/text/describe';
import { listedChoices, newSession } from '../../src/app/text/log';
import type { Session } from '../../src/app/text/log';
import { mineChoice, supportChoice } from '../../src/app/text/squares';
import { buildView, renderView } from '../../src/app/text/view';
import { resolveChoice, splitChoices, takeChoices } from '../../tools/play/cli';
import { buildState, terrainLayers } from '../engine/helpers';
import type { BuildStateOptions } from '../engine/helpers';

/** A pit drawn from above (see `terrainLayers`). `materials` defaults to stone. */
function pit(
  depths: string[],
  materials?: string[],
  options: Omit<BuildStateOptions, 'layers'> = {},
): GameState {
  return buildState({ layers: terrainLayers(depths, materials), ...options });
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

describe('"support x,y"', () => {
  it('places a support on the named square, and the view shows it', () => {
    const session = sessionOn(pit(['012'], ['ddd'], { stockpile: { support: 1 } }));
    const result = takeChoices(session, ['support 0,0']);
    expect(result.refused).toBeNull();
    expect(result.lines).toEqual([
      '> Place a support on x0 y0: it holds that square against slumping, and is lost if the ' +
        'square is mined. Placed a support.',
    ]);
    expect(session.log.actions).toEqual([{ type: 'placeSupport', x: 0, y: 0, ap: 1 }]);
    const text = viewText(session.state);
    expect(text).toContain('On x0 y0: a support');
    expect(text).toContain('You have none: craft-support makes one.');
  });

  it('says how many supports there are, and is not a line of the list', () => {
    const state = pit(['000', '000'], undefined, { stockpile: { support: 2 } });
    const text = viewText(state);
    expect(text).toContain('support X,Y  [1] Place a support on square x X, y Y');
    expect(text).toContain('You have 2.');
    expect(buildView(state, { deepestDepth: 0 }).squares?.supports).toBe(6);
    // Six squares could take one, but none of them is a numbered line.
    expect(listedChoices(state).some((entry) => entry.type === 'placeSupport')).toBe(false);
  });

  it('is refused with the reason', () => {
    expect(supportChoice(pit(['00']), 0, 0).refusal).toBe(
      'You have no support to place: craft one first ("craft-support").',
    );
    const state = buildState({
      layers: [['##.#']],
      surface: ['T...'],
      supports: [{ x: 1, y: 0, z: 0 }],
      stockpile: { support: 1 },
    });
    expect(supportChoice(state, 0, 0).refusal).toContain('A tree stands on x0 y0');
    expect(supportChoice(state, 1, 0).refusal).toContain('Something is already placed on x1 y0');
    expect(supportChoice(state, 2, 0).refusal).toContain('no block left to support');
    expect(supportChoice(state, 7, 0).refusal).toContain('not a square of the map');
    expect(supportChoice({ ...state, ap: 0 }, 3, 0).refusal).toBe(
      'Placing a support costs 1 AP and you have 0 left this shift.',
    );
    expect(supportChoice(state, 3, 0).entry).toEqual({ type: 'placeSupport', x: 3, y: 0, ap: 1 });
  });

  it('is kept whole when a chain is split at its commas', () => {
    expect(splitChoices('support 1,2, mine! 3,4,end')).toEqual(['support 1,2', 'mine! 3,4', 'end']);
  });
});

describe('the warning before a mine that would make squares unstable (design doc 11)', () => {
  // Dirt at depths 0 1 1: mining x=2 makes the slope fall 2 from x=0.
  const risky = (): GameState => pit(['011'], ['ddd']);

  it('names the squares, and the mine is not done at the first asking', () => {
    const state = risky();
    const choice = mineChoice(state, 2, 0);
    expect(choice.entry).toEqual({ type: 'mine', x: 2, y: 0, ap: 1 });
    expect(choice.makesUnstable.map((square) => [square.x, square.y])).toEqual([[0, 0]]);
    expect(choice.warning).toBe(
      'Mining x2 y0 would make x0 y0 (Dirt, at the top of a slope that would fall 2) unstable. ' +
        'It would crack when the shift ends and slump into the pit later, unless it is ' +
        'supported or the slope is made gentler first.',
    );

    const before = hashState(state);
    const session = sessionOn(state);
    const result = takeChoices(session, ['mine 2,0', 'end']);
    expect(result.taken).toBe(0);
    expect(result.refused).toContain('would make x0 y0');
    expect(result.refused).toContain('To mine it all the same, type "mine! 2,0".');
    expect(hashState(session.state)).toBe(before);
  });

  it('"mine! x,y" does it all the same', () => {
    const session = sessionOn(risky());
    const result = takeChoices(session, ['mine! 2,0']);
    expect(result.refused).toBeNull();
    expect(session.log.actions).toEqual([{ type: 'mine', x: 2, y: 0, ap: 1 }]);
  });

  it('a mine that makes nothing unstable needs no "!" (and may have one)', () => {
    const state = risky();
    expect(mineChoice(state, 0, 0).warning).toBeNull();
    expect(resolveChoice(state, 'mine 0,0').entry).toEqual({ type: 'mine', x: 0, y: 0, ap: 1 });
    expect(resolveChoice(state, 'mine! 0,0').entry).toEqual({ type: 'mine', x: 0, y: 0, ap: 1 });
    // In stone the same pit holds: no warning for x=2.
    expect(mineChoice(pit(['011']), 2, 0).warning).toBeNull();
  });

  it('a refused mine is still refused with "!"', () => {
    // x=1 is lower than x=0: the level rule forbids it.
    expect(resolveChoice(pit(['01'], ['dd']), 'mine! 1,0').refusal).toContain('The level rule');
  });
});

describe('cracks and slumps in the view', () => {
  it('before the crack: the forecast says which squares will crack', () => {
    const text = viewText(pit(['012'], ['ddd']));
    expect(text).toContain('Hazards: none known');
    expect(text).toContain(
      'New cracks (unstable squares): x0 y0; each falls at the end of the shift after next ' +
        'unless it is supported or made stable.',
    );
  });

  it('a cracked square: its countdown, when it falls and where its block lands', () => {
    const one = endShift(pit(['012'], ['ddd']));
    expect(describeEvents(one.state, one.events)).toContain(
      'x0 y0 is cracked (Dirt): it falls at the end of the next shift, unless it is made stable ' +
        'or supported first.',
    );
    const text = viewText(one.state);
    expect(text).toContain('On x0 y0: a crack, countdown 2');
    expect(text).toContain(
      'Hazards: x0 y0 is cracked: it falls at the end of the next shift, onto x2 y0',
    );

    const two = endShift(one.state);
    const due = viewText(two.state);
    expect(due).toContain('On x0 y0: a crack, countdown 1');
    expect(due).toContain('x0 y0 is cracked: it falls at the end of this shift, onto x2 y0');
    expect(due).toContain('THE PIT WALL SLUMPS: x0 y0 onto x2 y0.');

    const three = endShift(two.state);
    expect(describeEvents(three.state, three.events)).toContain(
      'The pit wall slumped: the Dirt on x0 y0 slid down onto x2 y0 and lies there as rubble.',
    );
    expect(viewText(three.state)).toContain('Hazards: none known');
  });

  it('a stopped countdown says so', () => {
    const state = pit(['011'], ['ddd'], { cracks: [{ pos: { x: 0, y: 0, z: 0 }, timer: 1 }] });
    expect(viewText(state)).toContain(
      'x0 y0 is cracked, countdown stopped at 2: the square is stable or held now',
    );
  });

  it('says when a slump hurt the crew and when a support was lost', () => {
    const state = pit(['02'], ['dd'], {
      cracks: [{ pos: { x: 0, y: 0, z: 0 }, timer: 0 }],
      supports: [{ x: 1, y: 0, z: 2 }],
      worked: [{ x: 1, y: 0 }],
    });
    const { state: after, events } = endShift(state);
    const lines = describeEvents(after, events);
    expect(lines).toContain(
      'The support on x1 y0 was buried or carried off by a slump and is lost.',
    );
    expect(lines.some((line) => line.includes('lost 3 health to a slumping pit wall'))).toBe(true);
  });

  it('tells nothing hidden: the same text and warnings whatever lies under the tops', () => {
    // The same pit twice, with a crack running; in the second every block
    // below a top block is another kind of rock.
    const build = (): GameState =>
      endShift(pit(['0123', '0112'], ['dd##', 'dddd'], { stockpile: { support: 1 } })).state;
    const one = build();
    const two = build();
    for (let y = 0; y < two.size.y; y += 1) {
      for (let x = 0; x < two.size.x; x += 1) {
        let top = 0;
        while (two.blocks[x + two.size.x * (y + two.size.y * top)] === BLOCKS.air.code) {
          top += 1;
        }
        for (let z = top + 1; z < two.size.z; z += 1) {
          setBlock(two, { x, y, z }, BLOCKS.hardRock.code);
        }
      }
    }
    expect(viewText(one)).toContain('is cracked');
    expect(viewText(two)).toBe(viewText(one));
    for (let y = 0; y < one.size.y; y += 1) {
      for (let x = 0; x < one.size.x; x += 1) {
        expect(mineChoice(two, x, y)).toEqual(mineChoice(one, x, y));
        expect(supportChoice(two, x, y)).toEqual(supportChoice(one, x, y));
      }
    }
  });
});
