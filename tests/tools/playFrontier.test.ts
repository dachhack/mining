// The new game's text play interface (plan B2): the play log replays, and
// the one-shot modes work.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FRONTIER_RUN, FRONTIER_SHIFT } from '../../src/data/frontier';
import { ENGINE_VERSION, hashFrontier } from '../../src/engine';
import { replayFrontier } from '../../tools/frontierRun';
import {
  act,
  frontierView,
  logFrom,
  newFrontierSession,
  runFrontierCli,
  stepOf,
} from '../../tools/play/frontierCli';

const SEED = 110;

/** A fresh file path in a new temporary folder. */
function tempLog(): string {
  return join(mkdtempSync(join(tmpdir(), 'play-frontier-')), 'run.json');
}

/** The log in `path`. */
function readLog(path: string): ReturnType<typeof logFrom> {
  return logFrom(readFileSync(path, 'utf8'));
}

/** A lit square near the first camp where a tap does something, on seed 110. */
function usefulSquare(): string {
  const session = newFrontierSession(SEED);
  const camp = session.state.camps[0] ?? { x: 0, y: 0 };
  for (let d = 2; d < 6; d += 1) {
    const step = `tap ${camp.x - d},${camp.y}`;
    if (act(session, step).refused === null) return step;
  }
  throw new Error('nothing to tap near the camp');
}

describe('the new game’s play interface (plan B2)', () => {
  it('prints usage and the rules, with the numbers from the data', () => {
    const help = runFrontierCli(['--help']);
    expect(help.exitCode).toBe(0);
    expect(help.output).toContain('npm run play -- --seed 7 -i');
    expect(help.output).toContain(`A shift has ${FRONTIER_SHIFT.taps} taps`);
    expect(help.output).toContain('The level rule');
  });

  it('shows only what the player may know: fog, the camps, the numbers', () => {
    const view = frontierView(newFrontierSession(SEED));
    expect(view).toContain(
      `Seed ${SEED} · Shift 1/${FRONTIER_RUN.shifts} · Coins 0 · Taps ${FRONTIER_SHIFT.taps}/${FRONTIER_SHIFT.taps}`,
    );
    expect(view).toContain('??'); // fog
    expect(view).toContain('Camp 1 at');
    expect(view).toContain('1) endShift');
  });

  it('reads choices: numbers of listed choices, taps in a few spellings, and words', () => {
    const listed = ['endShift', 'rest 1', 'close'];
    expect(stepOf('1', listed)).toBe('endShift');
    expect(stepOf('tap 3,4', listed)).toBe('tap 3,4');
    expect(stepOf('t 3 4', listed)).toBe('tap 3,4');
    expect(stepOf('place 5, 6', listed)).toBe('place 5,6');
    expect(stepOf('Upgrade 2', listed)).toBe('upgrade 2');
    expect(stepOf('end shift', listed)).toBe('endShift');
    // Rest is at a camp (question 156): "rest" alone only when one camp stands.
    expect(stepOf('rest 1', listed)).toBe('rest 1');
    expect(stepOf('rest', listed)).toBe('rest 1');
    expect(stepOf('rest', ['endShift', 'rest 1', 'rest 2', 'close'])).toBeNull();
    expect(stepOf('smelter 2', listed)).toBe('buildSmelter 2');
    expect(stepOf('make iron-pickaxe', listed)).toBe('make iron-pickaxe');
    expect(stepOf('lantern 2', listed)).toBe('hangLantern 2');
    expect(stepOf('hang lantern 3', listed)).toBe('hangLantern 3');
    expect(stepOf('dig', listed)).toBeNull();
    expect(stepOf('9', listed)).toBeNull();
  });

  it('saves a log, carries it on, and the log replays to the same run', () => {
    const path = tempLog();
    const tap = usefulSquare();
    const first = runFrontierCli(['--seed', String(SEED), '--log', path, '--do', `${tap}; end`]);
    expect(first.exitCode).toBe(0);
    expect(readLog(path)).toEqual({
      engineVersion: ENGINE_VERSION,
      seed: SEED,
      steps: [tap, 'endShift'],
    });
    const second = runFrontierCli(['--log', path, '--do', 'rest']);
    expect(second.output).toContain('Carrying on the run');
    const log = readLog(path);
    expect(log.steps).toEqual([tap, 'endShift', 'rest 1']);
    const replay = runFrontierCli(['--replay', path]);
    expect(replay.output).toContain(`Hash ${hashFrontier(replayFrontier(SEED, log.steps))}`);
  });

  it('takes an undone step out of the log and gives its tap back', () => {
    const path = tempLog();
    const tap = usefulSquare();
    const result = runFrontierCli(['--seed', String(SEED), '--log', path, '--do', `${tap}; undo`]);
    expect(result.output).toContain(`Undone: ${tap}`);
    expect(result.output).toContain(`Taps ${FRONTIER_SHIFT.taps}/${FRONTIER_SHIFT.taps}`);
    expect(readLog(path).steps).toEqual([]);
  });

  it('refuses a choice that does nothing, logs nothing for it, and says why', () => {
    const path = tempLog();
    const result = runFrontierCli(['--seed', String(SEED), '--log', path, '--do', 'tap 0,0']);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('fog');
    expect(readLog(path).steps).toEqual([]);
    expect(runFrontierCli(['--seed', String(SEED), '--do', 'dig 3,4']).output).toContain(
      'is not a choice',
    );
  });

  it('will not carry on a log played on another engine version', () => {
    const path = tempLog();
    writeFileSync(path, JSON.stringify({ engineVersion: '0.0.1', seed: SEED, steps: [] }));
    const result = runFrontierCli(['--log', path, '--do', 'end']);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('played on engine 0.0.1');
  });

  it('answers "look" without spending a tap', () => {
    const session = newFrontierSession(SEED);
    const camp = session.state.camps[0] ?? { x: 0, y: 0 };
    const result = runFrontierCli(['--seed', String(SEED), '--do', `look ${camp.x},${camp.y}`]);
    expect(result.output).toContain(`${camp.x},${camp.y}: depth 0`);
    expect(result.output).toContain("camp 1's ground");
    expect(result.output).toContain(`Taps ${FRONTIER_SHIFT.taps}/${FRONTIER_SHIFT.taps}`);
  });
});

describe('the market and the run’s end in the play interface (progression PR 1)', () => {
  /** A session on a market day, holding `inventory`. */
  function marketSession(inventory: Record<string, number>): ReturnType<typeof newFrontierSession> {
    const session = newFrontierSession(SEED);
    const state = { ...session.state, shift: 10, inventory: new Map(Object.entries(inventory)) };
    return { ...session, state, shiftLog: { start: state, actions: [] } };
  }

  it('reads "sell" and "buy" with any letter case of the item', () => {
    expect(stepOf('sell wood 3', [])).toBe('sell wood 3');
    expect(stepOf('Sell RawIronOre 2', [])).toBe('sell rawIronOre 2');
    expect(stepOf('buy animal 1', [])).toBe('buy animal 1');
    expect(stepOf('buy wood 1', [])).toBeNull(); // the market does not sell wood
  });

  it('shows the market’s prices on a market day, and when it opens next otherwise', () => {
    expect(frontierView(newFrontierSession(SEED))).toContain('Market: opens on shift 10');
    const open = frontierView(marketSession({ wood: 10 }));
    expect(open).toContain('Market: OPEN this shift');
    expect(open).toContain('Coins 0');
  });

  it('sells for coins, for 1 tap, and says why a trade is refused', () => {
    const sold = act(marketSession({ wood: 10 }), 'sell wood 2');
    expect(sold.refused).toBeNull();
    expect(sold.session.state.tapsLeft).toBe(FRONTIER_SHIFT.taps - 1);
    expect(frontierView(sold.session)).toContain('Coins 2');
    expect(act(newFrontierSession(SEED), 'sell wood 1').refused).toContain('not open');
  });
});

describe('planting in the play interface (progression PR 3)', () => {
  it('reads "plant X,Y sapling" and "plant X Y applesapling"', () => {
    expect(stepOf('plant 3,4 sapling', [])).toBe('plant 3,4 sapling');
    expect(stepOf('plant 3 4 applesapling', [])).toBe('plant 3,4 appleSapling');
    expect(stepOf('plant 3,4 wood', [])).toBeNull();
  });

  it('plants for 1 tap and shows the sapling on the map; says why it cannot', () => {
    const start = newFrontierSession(SEED);
    const state = { ...start.state, inventory: new Map([['sapling', 1]]) };
    const session = { ...start, state, shiftLog: { start: state, actions: [] } };
    const camp = state.camps[0] ?? { x: 0, y: 0 };
    expect(act(session, `plant ${camp.x},${camp.y} sapling`).refused).toBe('A camp stands there.');
    let done: ReturnType<typeof act> | null = null;
    for (let d = 2; d < 8 && done === null; d += 1) {
      const tried = act(session, `plant ${camp.x + d},${camp.y} sapling`);
      if (tried.refused === null) done = tried;
    }
    expect(done).not.toBeNull();
    expect(done?.session.state.tapsLeft).toBe(FRONTIER_SHIFT.taps - 1);
    expect(frontierView(done?.session ?? session)).toContain('s0');
  });
});
