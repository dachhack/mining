// Contract stages (owner, after the 0.25.0 build: "A player won't have spare
// sheep or crops until later early game or mid game. Let's stay heavy on
// clay stone wood and hay in early game. Then coal and common ores mix in.
// Then crops, sheep, syrup mix in. Then more refined ore products and larger
// contracts. Then special ores and items."). Asked: each stage opens with a
// milestone and a number of contracts delivered, both needed.
import { describe, expect, it } from 'vitest';
import { FRONTIER_BOARD, FRONTIER_CONTRACTS, FRONTIER_STAGES } from '../../src/data/frontier';
import { contractBoard, contractStage, createFrontier, isMarketDay } from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { world } from './frontierHelpers';

/** A store holding plenty of everything any contract asks for. */
const PLENTY: Record<string, number> = {};
for (const c of FRONTIER_CONTRACTS) {
  for (const a of c.asks) PLENTY[a.item] = Math.max(PLENTY[a.item] ?? 0, a.count * 10);
}

/** A world whose first camp is `level` (with a smelter if asked), `delivered` contracts done, on market day `shift`. */
function at(
  level: number,
  delivered: number,
  opts: {
    smelter?: boolean;
    deep?: boolean;
    inventory?: Record<string, number>;
    shift?: number;
  } = {},
): FrontierState {
  const w = world({ inventory: opts.inventory ?? {} });
  const s = {
    ...w,
    shift: opts.shift ?? 30,
    contractsDone: [delivered, 0, 0],
    camps: w.camps.map((c) => ({
      ...c,
      level,
      smelter: opts.smelter ?? false,
      deep: opts.deep ?? false,
    })),
  };
  return { ...s, marketOpen: isMarketDay(s) };
}

const ITEMS_BY_STAGE: Record<number, string[]> = {
  1: ['clay', 'stone', 'wood', 'hay'],
  2: ['coal', 'rawIronOre', 'rawCopperOre', 'apple', 'lumber'],
  3: ['wheat', 'corn', 'carrot', 'potato', 'animal', 'syrup', 'mushroom'],
};

describe('contract stages', () => {
  it('put every contract in a stage, 1 to 5, and the early stages ask only for their own goods', () => {
    for (const c of FRONTIER_CONTRACTS) {
      expect([1, 2, 3, 4, 5], c.id).toContain(c.stage);
      const allowed = Object.entries(ITEMS_BY_STAGE)
        .filter(([stage]) => Number(stage) <= c.stage)
        .flatMap(([, items]) => items);
      if (c.stage <= 3) for (const a of c.asks) expect(allowed, c.id).toContain(a.item);
    }
    // Stage 1 is heavy on clay, stone, wood and hay; each early stage brings its own goods.
    for (const [stage, items] of Object.entries(ITEMS_BY_STAGE)) {
      for (const item of items) {
        expect(
          FRONTIER_CONTRACTS.some(
            (c) => c.stage === Number(stage) && c.asks.some((a) => a.item === item),
          ),
          `${item} at stage ${stage}`,
        ).toBe(true);
      }
    }
    expect(FRONTIER_CONTRACTS.filter((c) => c.stage === 1).length).toBeGreaterThanOrEqual(6);
    // Stage 4: ingots and the bigger contracts; stage 5: crystal, rare ore, relics and the keystone.
    const four = FRONTIER_CONTRACTS.filter((c) => c.stage === 4);
    expect(four.some((c) => c.asks.some((a) => a.item === 'ironIngot'))).toBe(true);
    expect(four.every((c) => c.tier >= 1)).toBe(true);
    expect(FRONTIER_CONTRACTS.filter((c) => c.tier === 2).every((c) => c.stage === 4)).toBe(true);
    expect(FRONTIER_CONTRACTS.filter((c) => c.tier === 3).every((c) => c.stage === 5)).toBe(true);
  });

  it('open with a milestone and contracts delivered, both needed', () => {
    expect(FRONTIER_STAGES.map((s) => s.delivered)).toEqual([2, 5, 9, 14]);
    expect(contractStage(at(1, 0))).toBe(1);
    expect(contractStage(at(1, 20))).toBe(1); // no level-2 camp
    expect(contractStage(at(2, 1))).toBe(1); // 1 delivered, not 2
    expect(contractStage(at(2, 2))).toBe(2);
    expect(contractStage(at(3, 4))).toBe(2);
    expect(contractStage(at(3, 5))).toBe(3);
    expect(contractStage(at(3, 9))).toBe(3); // no smelter
    expect(contractStage(at(3, 9, { smelter: true }))).toBe(4);
    expect(contractStage(at(3, 14, { smelter: true }))).toBe(4); // no steel drill, no deep camp
    expect(contractStage(at(3, 14, { smelter: true, inventory: { steelDrill: 1 } }))).toBe(5);
    expect(contractStage(at(3, 14, { smelter: true, deep: true }))).toBe(5);
    // Stages go in order: a smelter and 9 delivered without a level-3 camp is stage 2.
    expect(contractStage(at(2, 9, { smelter: true }))).toBe(2);
  });

  it('offer only what the stage has opened, and always something of the newest stage', () => {
    for (const [level, delivered, opts] of [
      [1, 0, {}],
      [2, 2, {}],
      [3, 5, {}],
      [3, 9, { smelter: true }],
      [3, 14, { smelter: true, deep: true }],
    ] as const) {
      for (let shift = 30; shift <= 120; shift += 30) {
        const s = at(level, delivered, { ...opts, inventory: PLENTY, shift });
        const stage = contractStage(s);
        const board = contractBoard(s);
        expect(board.length, `stage ${stage}, shift ${shift}`).toBeGreaterThan(0);
        for (const c of board) expect(c.stage, c.id).toBeLessThanOrEqual(stage);
        expect(
          board.some((c) => c.stage === stage),
          `stage ${stage}, shift ${shift}`,
        ).toBe(true);
      }
    }
    expect(FRONTIER_BOARD.perStage).toBe(4);
  });
});

describe('clay and stone on every board', () => {
  // Owner, after the 0.26.0 build: "There are no clay or stone contracts but I
  // am at the phase of the game where I should be filling a lot of them."
  // Asked: a clay and a stone contract on every board, through stage 4.
  const asks = (c: { asks: { item: string }[] }, item: string): boolean =>
    c.asks.some((a) => a.item === item);

  it('through stage 4 every board has a clay and a stone contract (stone from a level-2 camp)', () => {
    for (let seed = 1; seed <= 6; seed += 1) {
      const start = createFrontier(seed);
      for (const [level, delivered, smelter] of [
        [2, 0, false],
        [2, 2, false],
        [3, 5, false],
        [3, 9, true],
      ] as const) {
        for (let shift = 3; shift <= 60; shift += 3) {
          const s = {
            ...start,
            shift,
            marketOpen: true,
            contractsDone: [delivered, 0, 0],
            camps: start.camps.map((c) => ({ ...c, level, smelter })),
          };
          const board = contractBoard(s);
          const at = `seed ${seed}, stage ${contractStage(s)}, shift ${shift}`;
          expect(
            board.some((c) => asks(c, 'clay')),
            at,
          ).toBe(true);
          expect(
            board.some((c) => asks(c, 'stone')),
            at,
          ).toBe(true);
          expect(board.length, at).toBeLessThanOrEqual(FRONTIER_BOARD.offers[1]);
        }
      }
      // A level-1 camp cannot mine stone: clay only.
      const one = { ...start, shift: 10, marketOpen: true };
      expect(contractBoard(one).some((c) => asks(c, 'clay'))).toBe(true);
      expect(contractBoard(one).some((c) => asks(c, 'stone'))).toBe(false);
    }
  });
});
