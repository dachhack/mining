// UI lab 1 (issue #116): the lab's shadows and taps, without a browser.
import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../../src/data';
import { depthAt, hashState } from '../../src/engine';
import type { DepthMap } from '../../src/engine';
import { labTap, labWorldFromState, newLabWorld } from '../../src/app/lab/labWorld';
import { shadowEdges } from '../../src/app/lab/shadows';
import { buildState } from '../engine/helpers';

/** A depth map from rows of digits, y = 0 first: '010' is a row whose middle square is 1 down. */
function depthMap(rows: string[]): DepthMap {
  const depths: number[] = [];
  for (const row of rows) {
    for (const char of row) {
      depths.push(Number(char));
    }
  }
  return { width: rows[0]?.length ?? 0, height: rows.length, depths };
}

describe('shadowEdges', () => {
  it('shades a pit square on every edge', () => {
    const map = depthMap(['000', '010', '000']);
    expect(shadowEdges(map, 1, 1)).toEqual(['north', 'east', 'south', 'west']);
  });

  it('shades only the edges that face a higher neighbour', () => {
    // A trench along the middle row, open to the east wall; one step down at its west end.
    const map = depthMap(['0000', '1122', '0011']);
    expect(shadowEdges(map, 0, 1)).toEqual(['north', 'south']);
    // (2, 1) is 2 down: north (0) and west (1) are higher; south (1) is higher; east (2) is level.
    expect(shadowEdges(map, 2, 1)).toEqual(['north', 'south', 'west']);
    // (2, 2) is 1 down: only west (0) is higher; north (2) is lower.
    expect(shadowEdges(map, 2, 2)).toEqual(['west']);
    expect(shadowEdges(map, 3, 2)).toEqual([]);
  });

  it('casts no shadow on a higher square or from the side walls', () => {
    const map = depthMap(['000', '010', '000']);
    expect(shadowEdges(map, 0, 0)).toEqual([]);
    expect(shadowEdges(map, 1, 0)).toEqual([]);
    expect(shadowEdges(depthMap(['1']), 0, 0)).toEqual([]);
  });
});

/** A 3 x 3 cube: dirt over iron ore in the middle, stone everywhere else. */
function smallWorld() {
  return labWorldFromState(
    1,
    buildState({
      layers: [
        ['ddd', 'ddd', 'ddd'],
        ['###', '#i#', '###'],
        ['###', '###', '###'],
      ],
    }),
  );
}

describe('labTap', () => {
  it('a tap on a legal square lowers it by 1 and adds its yield', () => {
    let world = smallWorld();
    // Dig the whole top layer: dirt yields nothing, but every tap counts.
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        const tap = labTap(world, x, y);
        expect(tap.result.mined).toBe(true);
        world = tap.world;
      }
    }
    expect(world.mined).toBe(9);
    expect(world.counts.size).toBe(0);

    // The middle is now iron ore, and no neighbour is higher.
    const tap = labTap(world, 1, 1);
    expect(tap.result.mined).toBe(true);
    expect(tap.result.block).toBe(BLOCKS.ironOre.code);
    expect(depthAt(tap.world.state, 1, 1)).toBe(2);
    expect(tap.world.depths.depths[1 + 3 * 1]).toBe(2);
    const [stack] = BLOCKS.ironOre.yields;
    expect(stack).toBeDefined();
    expect(tap.world.counts.get(stack?.item ?? '')).toBe(stack?.count);
    expect(tap.world.mined).toBe(10);
    // The world it came from is untouched.
    expect(world.counts.size).toBe(0);
    expect(depthAt(world.state, 1, 1)).toBe(1);
  });

  it('a tap on a refused square changes nothing', () => {
    const first = labTap(smallWorld(), 1, 1).world;
    const before = hashState(first.state);
    // (1, 1) is now 1 down with four higher neighbours: the level rule refuses.
    const tap = labTap(first, 1, 1);
    expect(tap.result.mined).toBe(false);
    expect(tap.result.refusal).toBe('neighbourHigher');
    expect(tap.world).toBe(first);
    expect(hashState(first.state)).toBe(before);
    expect(first.mined).toBe(1);
    expect(first.depths.depths[4]).toBe(1);
  });

  it('keeps the depth table equal to the cube', () => {
    let world = newLabWorld(7);
    for (const [x, y] of [
      [5, 5],
      [6, 5],
      [5, 6],
      [6, 6],
      [5, 5],
      [5, 5],
    ] as const) {
      world = labTap(world, x, y).world;
    }
    for (let y = 0; y < world.depths.height; y += 1) {
      for (let x = 0; x < world.depths.width; x += 1) {
        expect(world.depths.depths[x + world.depths.width * y]).toBe(depthAt(world.state, x, y));
      }
    }
  });
});
