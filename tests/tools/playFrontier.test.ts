// The new game's text play interface (plan B2): the play log replays, and
// the one-shot modes work.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FRONTIER_SHIFT } from '../../src/data/frontier';
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
      `Seed ${SEED} · Shift 1 · Taps ${FRONTIER_SHIFT.taps}/${FRONTIER_SHIFT.taps}`,
    );
    expect(view).toContain('??'); // fog
    expect(view).toContain('Camp 1 at');
    expect(view).toContain('1) endShift');
  });

  it('reads choices: numbers of listed choices, taps in a few spellings, and words', () => {
    const listed = ['endShift', 'rest', 'close'];
    expect(stepOf('1', listed)).toBe('endShift');
    expect(stepOf('tap 3,4', listed)).toBe('tap 3,4');
    expect(stepOf('t 3 4', listed)).toBe('tap 3,4');
    expect(stepOf('place 5, 6', listed)).toBe('place 5,6');
    expect(stepOf('Upgrade 2', listed)).toBe('upgrade 2');
    expect(stepOf('end shift', listed)).toBe('endShift');
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
    expect(log.steps).toEqual([tap, 'endShift', 'rest']);
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
