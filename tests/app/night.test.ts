// Night between shifts (owner, after the playtest of PR #146): the moon's
// phase comes from the shift number only, one step a shift.
import { describe, expect, it } from 'vitest';
import { MOON_PHASES, moonPhase, sentencesOf } from '../../src/app/lab/night';

describe('the moon between shifts', () => {
  it('has 8 phases, from new to full and back', () => {
    expect(MOON_PHASES).toHaveLength(8);
    expect(MOON_PHASES[0]).toBe('New moon');
    expect(MOON_PHASES[4]).toBe('Full moon');
  });

  it('steps one phase a shift and comes round every 8 shifts', () => {
    for (let shift = 1; shift <= 40; shift += 1) {
      expect(moonPhase(shift)).toBe((shift - 1) % 8);
      expect(moonPhase(shift + 8)).toBe(moonPhase(shift));
    }
  });
});

describe('what the night brought, one sentence a line', () => {
  it('cuts the summary after each full stop, keeping numbers and emoji whole', () => {
    expect(
      sentencesOf(
        'Shift 3 of 100 over: paid 1 wood. Rain 🌧 washed soil into 4 low squares. Market day: the market 🏪 is open.',
      ),
    ).toEqual([
      'Shift 3 of 100 over: paid 1 wood.',
      'Rain 🌧 washed soil into 4 low squares.',
      'Market day: the market 🏪 is open.',
    ]);
    expect(sentencesOf('')).toEqual([]);
  });
});
