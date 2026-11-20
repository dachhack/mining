// A prepared game state with every mark of the phone map on one screen
// (issue #110): water, lava and a source, gas, a vent, a pump, supports,
// cracks (running and stopped), a placed explosive, armed and unarmed
// unstable ore, a camp, scan marks, every tell, and worked squares.
//
// It is a real run's surface (`createRun`, so the forest round the pit is
// what a player sees) with a 14 x 14 patch in the middle drawn by hand. The
// e2e tests put it in the browser through `PREPARED_KEY` (see
// src/app/previewSession.ts), and tests/e2e/marks.spec.ts photographs it.
//
// Like the scenario tests' `buildState` (tests/engine/helpers.ts), this
// writes the state's arrays directly: it is a drawing, not a played run.

import {
  BLOCKS,
  CONTRACT_IDS,
  DEFAULT_LOADOUT_ID,
  STRUCTURES,
  SURFACE,
  WORLD,
} from '../../src/data';
import type { BlockId } from '../../src/data';
import { createRun, serialise } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { markWorked } from '../../src/engine/crew';
import { updateReveal } from '../../src/engine/reveal';
import { setGasOn, setLavaOn, setWaterOn } from '../../src/engine/standing';
import {
  addCamp,
  armCharge,
  setBlock,
  setCrackTimer,
  setGas,
  setLava,
  setRevealed,
  setStructure,
  setWater,
} from '../../src/engine/state';
import { setSurfaceKind } from '../../src/engine/surface/state';
import { updateMineralTraces } from '../../src/engine/tells';

/** The square of the map at the patch's top-left corner. */
export const PATCH_X = 9;
export const PATCH_Y = 9;

// The patch from above: how deep each square is. Row 0 is y = 9, and the
// first character of a row is x = 9.
const DEPTHS = [
  '00000000000000', // y 9
  '01111111111110', // y 10: a row of sample blocks
  '01111112222210', // y 11: the camp (x11-13), the gas basin (x16-20)
  '01111112222210', // y 12
  '01111112222210', // y 13
  '01111111111110', // y 14
  '01111111111110', // y 15: the charges
  '01111111111110', // y 16
  '01222211122210', // y 17: the water basin (x11-14), the lava basin (x18-20)
  '01222321122210', // y 18: a sump at x14
  '01222211122210', // y 19
  '01222211122210', // y 20
  '01111111111110', // y 21
  '00000000000000', // y 22
];

// What each column of the patch is made of: '#' stone, 'd' dirt, and so on
// (the letters of tests/engine/helpers.ts).
const MATERIALS = [
  '##############',
  '#ciuxHdtRSrk##',
  '#############d', // x22 y11: dirt at the top of a slope: cracked
  '#############d', // x22 y12: the same, about to fall
  '#############d', // x22 y13: the same, held by a support
  '##############',
  '###########U##', // y 15: unstable ore at x20
  '#####U########', // y 16: unstable ore at x14, armed below
  '##############',
  '##############',
  '##############',
  '##############',
  '##############',
  '##############',
];

const BLOCK_CHARS: Record<string, BlockId> = {
  '#': 'stone',
  d: 'dirt',
  c: 'coalSeam',
  i: 'ironOre',
  u: 'copperOre',
  x: 'crystal',
  H: 'hardRock',
  t: 'timberRoot',
  R: 'rubble',
  S: 'sealed',
  r: 'relic',
  k: 'keystone',
  U: 'unstableOre',
};

/** The prepared state. The same every time: nothing here is random. */
export function showcaseState(): GameState {
  const contractId = CONTRACT_IDS[0];
  if (contractId === undefined) {
    throw new Error('the data lists no contract');
  }
  const state = createRun(110, contractId, DEFAULT_LOADOUT_ID);
  const air = BLOCKS.air.code;
  const stone = BLOCKS.stone.code;

  // The patch: every column is dug to its depth and is one material below,
  // with nothing standing in it and no tree on it.
  DEPTHS.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx += 1) {
      const x = PATCH_X + dx;
      const y = PATCH_Y + dy;
      const depth = Number(row.charAt(dx));
      const material = BLOCK_CHARS[MATERIALS[dy]?.charAt(dx) ?? '#'] ?? 'stone';
      // The bottom layer is the cube's bedrock floor and is left alone.
      for (let z = 0; z < state.size.z - 1; z += 1) {
        const pos = { x, y, z };
        let code = stone;
        if (z < depth) code = air;
        else if (z === depth) code = BLOCKS[material].code;
        setBlock(state, pos, code);
        setWater(state, pos, 0);
        setLava(state, pos, 0);
        setGas(state, pos, 0);
        setStructure(state, pos, 0);
        setRevealed(state, pos, false);
      }
      setSurfaceKind(state, { x, y, z: WORLD.surfaceZ }, SURFACE.kinds.meadow.code);
    }
  });
  // A stump, a path and an outcrop on the rim.
  setSurfaceKind(state, { x: 9, y: 14, z: WORLD.surfaceZ }, SURFACE.kinds.stump.code);
  setSurfaceKind(state, { x: 9, y: 15, z: WORLD.surfaceZ }, SURFACE.kinds.path.code);
  setSurfaceKind(state, { x: 9, y: 16, z: WORLD.surfaceZ }, SURFACE.kinds.outcrop.code);

  state.shift = 2; // an even shift: lava flows when it ends
  state.ap = 5;
  state.fuel = 18;
  state.crew.health = 8;
  state.stockpile = {
    stone: 4,
    coal: 3,
    timber: 3,
    support: 2,
    explosive: 1,
    pump: 1,
    vent: 1,
    sealant: 2,
    scannerCharge: 1,
    drill: 1,
  };

  // The camp, on the flat 3 x 3 patch round x12 y12 at depth 1.
  addCamp(state, { x: 12, y: 12, z: 1 });

  // Water in the south-west basin (depth 2), a dry sump beside it, a pump.
  setWaterOn(state, 11, 17, 2);
  setWaterOn(state, 12, 17, 2);
  setWaterOn(state, 11, 18, 2);
  setWaterOn(state, 12, 18, 1);
  setWaterOn(state, 13, 18, 1);
  setStructure(state, { x: 11, y: 20, z: 2 }, STRUCTURES.pump.code);

  // Lava in the south-east basin: a source, and lava round it.
  setLavaOn(state, 20, 19, 2, true);
  setLavaOn(state, 20, 18, 1, false);
  setLavaOn(state, 19, 19, 1, false);

  // Gas in the north-east basin, and a vent that reaches part of it.
  setGasOn(state, 17, 11, 3);
  setGasOn(state, 18, 11, 4);
  setGasOn(state, 17, 12, 2);
  setGasOn(state, 18, 12, 3);
  setGasOn(state, 18, 13, 2);
  setStructure(state, { x: 20, y: 13, z: 2 }, STRUCTURES.vent.code);

  // Cracks on the dirt at the top of the east slope: one falls when this
  // shift ends, one a shift later, one is held by a support (stopped).
  setCrackTimer(state, { x: 22, y: 12, z: 0 }, 0);
  setCrackTimer(state, { x: 22, y: 11, z: 0 }, 1);
  setCrackTimer(state, { x: 22, y: 13, z: 0 }, 1);
  setStructure(state, { x: 22, y: 13, z: 0 }, STRUCTURES.support.code);
  // A support on its own, too.
  setStructure(state, { x: 10, y: 15, z: 1 }, STRUCTURES.support.code);

  // A placed explosive, and unstable ore that a mine beside it has armed.
  setStructure(state, { x: 16, y: 15, z: 1 }, STRUCTURES.explosive.code);
  armCharge(state, { x: 16, y: 15, z: 1 }, 'explosive');
  armCharge(state, { x: 14, y: 16, z: 1 }, 'unstableOre');

  // The squares the crew worked this shift.
  markWorked(state, 15, 14);
  markWorked(state, 15, 15);
  markWorked(state, 16, 15);

  // Hidden things that show as tells on the tops over them:
  // a gas pocket (pitted rock), a lava pocket two below (warm glow), ore
  // (mineral traces), and a water pocket (damp stone).
  setBlock(state, { x: 11, y: 15, z: 2 }, air);
  setGas(state, { x: 11, y: 15, z: 2 }, 4);
  for (const x of [16, 17, 18]) {
    setBlock(state, { x, y: 21, z: 3 }, air);
    setLava(state, { x, y: 21, z: 3 }, 1);
  }
  setBlock(state, { x: 12, y: 21, z: 2 }, BLOCKS.ironOre.code);
  setBlock(state, { x: 14, y: 14, z: 2 }, air);
  setWater(state, { x: 14, y: 14, z: 2 }, 1);

  // What a scan has shown under four tops of row y10... these squares hold
  // sample blocks, so the scanned squares are on row y16: ore, a pocket of
  // water, an empty cavern, and plain rock.
  setBlock(state, { x: 15, y: 16, z: 2 }, BLOCKS.copperOre.code);
  setRevealed(state, { x: 15, y: 16, z: 2 }, true);
  setBlock(state, { x: 16, y: 16, z: 2 }, air);
  setWater(state, { x: 16, y: 16, z: 2 }, 1);
  setRevealed(state, { x: 16, y: 16, z: 2 }, true);
  setBlock(state, { x: 17, y: 16, z: 2 }, air);
  setRevealed(state, { x: 17, y: 16, z: 2 }, true);
  setRevealed(state, { x: 18, y: 16, z: 2 }, true);

  // As the engine does after every step: the tops are seen, and the traces on them.
  updateReveal(state, []);
  updateMineralTraces(state, []);
  return state;
}

/** The prepared state as the text the browser's storage holds. */
export function showcaseText(): string {
  return JSON.stringify(serialise(showcaseState()));
}
