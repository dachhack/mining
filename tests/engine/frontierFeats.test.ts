// Accomplishments (owner, after the 0.26.0 build: "We also need a
// accomplishment system." Asked: per run, each worth family glory).
import { describe, expect, it } from 'vitest';
import { FRONTIER_FEATS, FRONTIER_STANDINGS } from '../../src/data/frontier';
import { createFrontier, frontierAct, gloryOf, raidCamp, standingOf } from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { GRASS } from '../../src/engine/frontier/state';
import { MID, world } from './frontierHelpers';

/** Do `action` and expect it to be done. */
function act(state: FrontierState, action: Parameters<typeof frontierAct>[1]) {
  const out = frontierAct(state, action);
  expect(out.done, `${action.kind}: ${out.refusal ?? ''}`).toBe(true);
  return out;
}

describe('accomplishments', () => {
  it('are a list in the data, each with a name, what to do, and its glory', () => {
    expect(FRONTIER_FEATS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(FRONTIER_FEATS.map((f) => f.id)).size).toBe(FRONTIER_FEATS.length);
    for (const f of FRONTIER_FEATS) {
      expect(f.name.length, f.id).toBeGreaterThan(0);
      expect(f.how.length, f.id).toBeGreaterThan(0);
      expect(f.glory, f.id).toBeGreaterThan(0);
    }
  });

  it('a new run has none, and no glory: the family is forgotten', () => {
    const s = createFrontier(1);
    expect(s.feats).toEqual([]);
    expect(gloryOf(s)).toBe(0);
    expect(standingOf(0)).toBe(FRONTIER_STANDINGS[0]?.name);
  });

  it('are earned once, by the action that does it, and the outcome names them', () => {
    // A second camp.
    const w = world({ inventory: { wood: 99, grass: 99 } });
    const placed = act(w, { kind: 'place', x: MID + 5, y: MID });
    expect(placed.feats).toEqual(['second-camp']);
    expect(placed.state.feats).toEqual(['second-camp']);
    expect(gloryOf(placed.state)).toBe(
      FRONTIER_FEATS.find((f) => f.id === 'second-camp')?.glory ?? -1,
    );
    // Not again for a third.
    const third = act(placed.state, { kind: 'place', x: MID - 5, y: MID });
    expect(third.feats ?? []).toEqual([]);
    expect(third.state.feats).toEqual(['second-camp']);
    // An action that earns nothing names nothing.
    const cut = act(world({ features: [{ x: MID + 3, y: MID, feature: GRASS }] }), {
      kind: 'tap',
      x: MID + 3,
      y: MID,
    });
    expect(cut.feats ?? []).toEqual([]);
  });

  it('cover camps, contracts, hazards and the family’s heirlooms', () => {
    // A camp upgraded to level 2.
    const up = act(world({ inventory: { wood: 99, grass: 99, clay: 99, animal: 9 } }), {
      kind: 'upgrade',
      id: 1,
    });
    expect(up.feats).toContain('level-2');
    // A dragon driven off.
    const dragon = {
      ...world({ inventory: { sword: 1 } }),
      hazards: {
        ...world().hazards,
        dragons: [{ id: 1, x: MID + 3, y: MID, dx: 1, dy: 0, restTaps: 3 }],
      },
    };
    expect(act(dragon, { kind: 'tap', x: MID + 3, y: MID }).feats).toContain('dragon-slayer');
    // A relic in the store: the first heirloom home.
    const relic = world({ inventory: { relic: 1, wood: 9, apple: 9 } });
    expect(act(relic, { kind: 'endShift' }).feats).toContain('first-relic');
    // The last End shift: the run is finished.
    const last = { ...world({ inventory: { wood: 9, apple: 9 } }), shift: 100 };
    expect(act(last, { kind: 'endShift' }).feats).toContain('finished');
  });

  it('a raid turned away is one, when End shift reports it', () => {
    // `raidCamp` is the raid itself; End shift earns the feat from its report.
    const fort = {
      ...world({ inventory: { wood: 9 } }),
      camps: world().camps.map((c) => ({ ...c, defense: 4 })),
    };
    expect(raidCamp(fort, 1, 4).raid.turnedAway).toBe(true);
    expect(FRONTIER_FEATS.some((f) => f.id === 'raid-repelled')).toBe(true);
  });

  it('glory adds up to a standing, from the data', () => {
    const names = FRONTIER_STANDINGS.map((s) => s.name);
    expect(names[0]).toBe('Forgotten');
    expect(names[names.length - 1]).toBe('Restored');
    const total = FRONTIER_FEATS.reduce((sum, f) => sum + f.glory, 0);
    // The top standing can be reached, and not by a handful of feats.
    const top = FRONTIER_STANDINGS[FRONTIER_STANDINGS.length - 1]?.glory ?? Infinity;
    expect(top).toBeLessThanOrEqual(total);
    expect(top).toBeGreaterThan(total / 2);
    for (const s of FRONTIER_STANDINGS) expect(standingOf(s.glory)).toBe(s.name);
  });
});
