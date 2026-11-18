// The text `npm run play -- --help` prints: how to drive the tool, how to
// read a view, and the rules of the game as it plays in M1.
//
// The Newcomer playtester reads only this, so it has to stand alone. It
// states rules, in the order a player meets them. Every number in it is read
// from src/data, so the text cannot drift from the game when one is tuned.

import { ACTION_COSTS, AVATAR, FIELD_RECIPES, SHIFT, WORLD } from '../../src/data';
import { stackListText } from './describe';
import { DEFAULT_LAYERS, DEFAULT_RADIUS } from './view';

export function helpText(): string {
  const recipes = FIELD_RECIPES.map(
    (recipe) => `    ${recipe.name}: from ${stackListText(recipe.inputs)}`,
  ).join('\n');
  const safeDrop = AVATAR.maxChosenDropBlocks;
  const uncontrolledPerBlock = AVATAR.uncontrolledFallDamagePerBlock;
  const bottomLayer = WORLD.size.z - 1;

  return `Mining game: text play interface

USAGE (one command per step)
  npm run play -- --seed 7 --log run.json       start a run, save it in run.json, print the first view
  npm run play -- --log run.json                print the current view again (changes nothing)
  npm run play -- --log run.json --do 3         take choice 3 from the action list, print the new view
  npm run play -- --log run.json --do 3,1,end   several choices in a row. Each number is read against
                                                the list as it stands at that moment, and the list
                                                changes after every action, so only chain choices
                                                whose numbers you are sure of. It stops at the first
                                                choice that is not on the list and says which.
  npm run play -- --seed 7 --interactive        type choices at a prompt (add --log to save the run)
  npm run play -- --replay run.json             replay a log; print the final state hash and outcome
  npm run play -- --help                        this text

  --do takes the numbers from the action list; 0 or "end" ends the shift.
  --radius N   how far the map reaches sideways from you (default ${DEFAULT_RADIUS})
  --layers N   how many layers above and below yours are drawn (default ${DEFAULT_LAYERS})
  --loadout ID the starting kit (default: standard)

READING A VIEW
  After you act, the view opens with one line starting ">" for each choice taken: what you did
  and what came of it (a fall, lost health, what you got). Read them; nothing else reports it.
  Then come your gauges. The map shows your layer with the layers above and below it
  beside it, each seen from above: x grows to the east (right), y grows to the south (down the
  page). "@" is you; "?" is a cell you have not seen, which may be rock or open space. The map is
  trimmed: rows and columns near you that are missing from it are all unseen. The legend
  under the map names every other character in it. Then come known hazards, what ending the
  shift now would do, and the numbered list of everything you may do, each with its cost in AP.

THE GAME
  You are a miner on top of a cube of rock ${WORLD.size.x} by ${WORLD.size.y} wide and ${WORLD.size.z} layers deep. Layer 0 is the top
  layer of rock and layer ${bottomLayer} the bottom; you start on the surface, standing on layer 0. Dig down,
  collect what the rock gives, and come back up. The run ends alive only when you choose to
  leave from the surface. It ends in death if you fall too far or run out of fuel.

  Shifts and action points (AP)
  - Time passes in shifts. Each shift you get ${SHIFT.apPerShift} AP. Each action costs the AP shown beside it;
    an action you cannot afford this shift is not on the list. End the shift to get fresh AP.
  - Unspent AP is not carried over as AP. It is banked: every ${SHIFT.bankedApPerRefund} banked AP turn into ${SHIFT.fuelPerRefund} fuel.

  Fuel and lamp oil
  - When a shift ends: banked AP is turned into fuel first. Then, if you have no fuel, the run
    ends. Otherwise the shift uses up ${SHIFT.fuelPerShift} fuel. The "If you end the shift now" line says exactly
    what will happen, including when it would end the run.
  - The lamp uses oil slowly, a little every few shifts. With no oil the lamp goes out and you
    see only one step around you.

  Moving (${ACTION_COSTS.move} AP each)
  - Walk north, east, south or west into an open cell. There are no diagonal moves.
  - Step up one block onto the rock beside you, if the cell on top of it and the cell over your
    head are both open.
  - You may walk off a ledge only where the drop is at most ${safeDrop} blocks. A drop you choose this
    way does not hurt. The list shows the drop. A longer drop is never offered as a move.
  - Ladders: to climb up, there must be a ladder in your own cell and in the cell above. To climb
    down, there must be a ladder in your own cell, and below it either a ladder or a short drop.
    So a shaft needs a ladder in every cell you want to climb through. You can place a ladder in
    your own cell or in any open cell touching yours, including the ones above and below.
  - Nothing can be placed on the surface itself.

  Falling
  - You are held up by solid rock under you or by a ladder in your own cell. After any action,
    if nothing holds you, you fall until something does. A ladder further down the shaft catches
    you, but the fall still counts.
  - There are two kinds of descent. A drop you choose as a move (walking off a ledge, or climbing
    down off the bottom of a ladder) is free. A fall you did not choose as a move is not: if you
    mine the block you stand on and no ladder holds you, you lose your footing and it costs
    health from the first block.
  - What a fall of that kind costs: ${uncontrolledPerBlock} health for each of the first ${AVATAR.freeFallBlocks} blocks, ${AVATAR.fallDamagePerBlock} health for each
    block beyond that, and a fall of ${AVATAR.fatalFallBlocks} or more kills. So digging straight down under your own
    feet costs ${uncontrolledPerBlock} health a layer. Nothing in this version of the game gives health back.
  - A ladder in your own cell holds you: place a ladder in your cell, then mine below, and you do
    not fall. That, or cutting steps sideways, is the safe way down.
  - The action list says what mining the block you stand on will cost: how far you will fall and
    the health you will lose, as far as you have seen the cells below. "FATAL" means it will
    kill you.

  Mining
  - Your pick reaches the 8 cells around you on your own layer (diagonals too) and the 9 cells
    of the layer below under those and under you. You cannot mine the block over your head, or
    anything else on the layer above.
  - Each kind of rock costs its own AP, shown in the list, and a block is mined in one action:
    if it costs more AP than you have left, wait for the next shift.
  - What the block gives goes into your pack. If that would put you over your carry limit, it
    is left lying in the hole instead.
  - Harder rock and different ores lie deeper. Timber-root, the only source of timber, grows
    only in the upper layers.

  What you can see
  - You know the whole top layer from the start. Below it you know what your lamp has shown.
    Light spreads from you a few steps through open cells: round corners, never through rock.
    You see every lit cell and every cell touching one.
  - You also always know the cells your pick can reach and the cell over your head, and you can
    look over an edge: beside a drop, or on a ladder, you see far enough down to judge the drop.
  - Daylight does not shine down a hole: from the surface you see that a hole is there, not
    what is at its bottom.
  - What you have seen stays on the map. An unseen cell is "?" whether it is rock or open.
  - A torch lights the cells around it for good, the way your lamp does. Place it in your own
    cell or an open cell touching yours. A cell holds one thing: a ladder or a torch, not both.

  Weight and loose items
  - Everything you carry has a weight, shown in brackets after it, and there is a carry limit
    (the "Carry" gauge). Ladders weigh nothing. Fuel and lamp oil are gauges, not carried items.
  - Picking up and dropping are free. You can pick up from your own cell and the six cells
    touching it; you take the whole pile, or as much of it as fits. You drop one item or the
    whole stack into your own cell.
  - Loose items fall straight down until they rest on rock. A ladder does not hold them.

  Crafting (${ACTION_COSTS.craft} AP each, anywhere)
${recipes}
    Supports can be made but not yet placed in this version of the game.

  Leaving
  - While you stand on the surface, "Leave the cube" is on the list and costs nothing. It ends
    the run alive, with whatever you carry (the game calls this a "salvage" run). There is no
    other way to finish alive.
`;
}
