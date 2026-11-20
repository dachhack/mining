// The text `npm run play -- --help` prints: how to drive the tool, how to
// read a view, and the rules of the game as it plays today.
//
// The Newcomer playtester reads only this, so it has to stand alone. It
// states rules, in the order a player meets them. Every number in it is read
// from src/data, so the text cannot drift from the game when one is tuned.

import { ACTION_COSTS, BLOCKS, FIELD_RECIPES, SHIFT, SURFACE, TELLS, WORLD } from '../../src/data';
import { stackListText } from '../../src/app/text/describe';

export function helpText(): string {
  const recipes = FIELD_RECIPES.map(
    (recipe) => `    ${recipe.name}: from ${stackListText(recipe.inputs)}`,
  ).join('\n');
  const lastX = WORLD.size.x - 1;
  const lastY = WORLD.size.y - 1;
  const traceSteps = TELLS.mineralTraces.distance;
  const cutYield = stackListText(SURFACE.cutTree.yields);
  const lowestMineCost = BLOCKS.dirt.mineCost ?? 0;
  const highestMineCost = BLOCKS.hardRock.mineCost ?? 0;
  const rubbleCost = BLOCKS.rubble.mineCost ?? 0;

  return `Mining game: text play interface

USAGE (one command per step)
  npm run play -- --seed 7 --log run.json       start a run, save it in run.json, print the first view
  npm run play -- --log run.json                print the current view again (changes nothing)
  npm run play -- --log run.json --do "mine 3,4"
                                                mine the top block of the square x 3, y 4
  npm run play -- --log run.json --do "cut 5,4" cut the tree on the square x 5, y 4
  npm run play -- --log run.json --do "cut 5,4, mine 5,4, craft-fuel, end"
                                                several choices in a row. It stops at the first
                                                choice that is refused and says which, and why.
  npm run play -- --seed 7 --interactive        type choices at a prompt (add --log to save the run)
  npm run play -- --replay run.json             replay a log; print the final state hash and outcome
  npm run play -- --help                        this text

  --loadout ID the starting kit (default: standard)

CHOICES
  There is no miner to move. You act on the map by naming a square:
    mine X,Y                 mine the top block of the square x X, y Y ("mine 3,4")
    cut X,Y                  cut down the tree on that square
  Any square of the map may be named; nothing has to be near anything. A square that cannot be
  mined or cut is refused with the reason, and nothing is done.
  Everything else you may do is a line of the action list, with a number and a name. --do and
  the prompt take either:
    craft-fuel, craft-support, ...     craft; the list shows each name
    leave                    leave the mine (ends the run alive)
    end (or 0)               end the shift
  - A NAME means the same at every step. In a chain, use names.
  - A NUMBER is the line's place in the list, which changes as you gain and use materials. In a
    chain, each number is read against the list as it stands at that moment.
  Choices in a chain are separated by commas (the comma inside "mine 3,4" is not a break) or by
  semicolons.

READING A VIEW
  After you act, the view opens with one line starting ">" for each choice taken: what you did
  and what came of it (what you got, what the square shows now). Read them; nothing else
  reports it. Then come your gauges and what you have.
  The map is the whole surface seen from above: x grows to the east (right), y grows to the
  south (down the page). The two lines over it give each column's x (tens over ones); each row
  starts with its y. Every square is two characters:
  - the first is what is on top: "Y" a tree, otherwise the square's top block ("d" dirt, "#"
    stone, "c" coal, ...); the legend under the map names every character on it, with what the
    block costs to mine;
  - the second is the square's depth: how many blocks have been taken from it. Blank is ground
    level, then 1 to 9, then letters (a is 10, b is 11, ...). At ground level a "," there marks
    a stump. Straight after a tree's "Y" it is blank (the ground under it is hidden), or the
    block you saw there before the tree grew back.
  Under the map: the legend, and notes on stumps. Then known hazards and what ending the shift
  now would do. A line starting "Not possible now:" says what costs more AP than you have left.
  Last comes how to mine and cut, with how many squares can be mined and trees cut now, and
  the list of everything else you may do, each with its number, its name and its cost in AP.

THE GAME
  You look down on a cube of rock ${WORLD.size.x} squares by ${WORLD.size.y} and ${WORLD.size.z} blocks deep (x 0 to ${lastX}, y 0 to ${lastY}),
  and mine it from the top: you choose a square and its top block is taken. There is no miner
  on the map and nothing walks. Collect what the rock gives. The run ends alive only when you
  choose to leave. It is lost if you run out of fuel.

  Shifts and action points (AP)
  - Time passes in shifts. Each shift you get ${SHIFT.apPerShift} AP. Each action costs AP; one you cannot afford
    this shift is refused (or is not on the list). End the shift to get fresh AP.
  - Unspent AP is lost when the shift ends. It is not carried over and does not turn into fuel.

  Fuel
  - When a shift ends: if you have no fuel, the run ends. Otherwise the shift uses up ${SHIFT.fuelPerShift} fuel.
    Nothing refills fuel except crafting it. The "If you end the shift now" line says exactly
    what will happen, including when it would end the run. So with fuel at 0 you may still play
    one shift: that line warns you ("FUEL WILL BE 0") at the end of the shift before it.

  Mining
  - Only a square's top block can be mined. Mining it takes the block, gives what the block
    yields, and makes the square 1 deeper; the block under it is then the top block, and you
    see it.
  - THE LEVEL RULE: a square may be mined only when none of the four squares beside it (north,
    east, south, west; not the diagonals) is higher than it. So after a mine the square is at
    most 1 deeper than each neighbour. To go deep you dig a terraced pit: every level down
    needs a wider ring of squares dug round it first. The edge of the map does not count as a
    neighbour. A refused mine names the neighbours that are too high, with their depths.
  - A square with a tree on it cannot be mined: cut the tree first.
  - Each kind of rock costs its own AP (from ${lowestMineCost} for dirt to ${highestMineCost} for hard rock; the legend gives each),
    and a block is mined in one action: if it costs more AP than you have left, it waits for
    the next shift.
  - Under the surface there can be open spaces. If the block you mine was the roof of one, the
    space falls in: the square still goes down by exactly 1, and its new top is rubble, which
    costs ${rubbleCost} AP and gives nothing.
  - Harder rock and different ores lie deeper. Timber-root grows only in the upper layers;
    the trees on the surface are the other source of timber.
  - A square mined all the way down shows the bedrock floor and cannot be mined further.

  The forest
  - Most of the surface is forest. The rest is open ground (meadow, dirt paths, stone
    outcrops), where you see the top block from the start. Some coal always shows on open
    ground at the start.
  - A tree hides the ground under it: you see that block only once the tree is cut.
  - Cut any tree (${SURFACE.cutTree.ap} AP) for ${cutYield}. It leaves a stump, and the block under it is then the
    square's top block.
  - A tree grows back on a stump ${SURFACE.regrowShifts} shifts after the cut (the shift of the cut counts), at the
    end of a shift. The block under it stays on your map, drawn after the "Y". Once a square
    has been mined, no tree ever grows on it again. The "If you end the shift now" line says
    where a tree will grow back.

  What you can see
  - Every square's top block and depth, always, except the ground under a tree that has not
    been cut. Nothing below a top block: you learn what is under a block by mining it.
  - Mineral traces: rock that lies within ${traceSteps} steps of iron ore, copper ore or crystal (counted
    through the rock, down as well as sideways) shows mineral traces. On the map traced rock
    has a character for each kind of rock, so you still see what it is and what it costs: "D"
    is dirt, "%" is stone and "h" is hard rock with traces (plain: "d", "#", "H").
    They say ore is near, not which ore or which way. Once noticed they stay on the map, also
    after the ore is mined, so an old mark can point at ore that is gone. Traces you first
    notice are always from ore still in the rock: if you notice some just after mining ore,
    other ore is near. Coal and timber-root give no traces.

  What you have
  - Everything you mine, cut or craft is yours at once, wherever it came from. There is no
    carry limit in this version of the game, and nothing is picked up or dropped.

  Crafting (${ACTION_COSTS.craft} AP each)
${recipes}
    Supports can be made but have no use yet in this version of the game. Fuel is the one
    that matters.

  Leaving
  - "leave" is always on the list and costs nothing. It ends the run alive, with what you have
    gathered (the game calls this a "salvage" run). There is no other way to finish alive.

  Not in this version of the game
  - Hazards (pit walls that slump, water, lava, gas), supports that hold a wall, camps and
    contracts are not built yet. Nothing hurts the crew today except running out of fuel.
`;
}
