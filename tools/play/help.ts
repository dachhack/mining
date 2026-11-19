// The text `npm run play -- --help` prints: how to drive the tool, how to
// read a view, and the rules of the game as it plays in M1.
//
// The Newcomer playtester reads only this, so it has to stand alone. It
// states rules, in the order a player meets them. Every number in it is read
// from src/data, so the text cannot drift from the game when one is tuned.

import {
  ACTION_COSTS,
  AVATAR,
  BLOCKS,
  FIELD_RECIPES,
  SHIFT,
  SURFACE,
  TELLS,
  WORLD,
} from '../../src/data';
import { stackListText } from '../../src/app/text/describe';
import { DEFAULT_LAYERS, DEFAULT_RADIUS } from '../../src/app/text/view';

export function helpText(): string {
  const recipes = FIELD_RECIPES.map(
    (recipe) => `    ${recipe.name}: from ${stackListText(recipe.inputs)}`,
  ).join('\n');
  const safeDrop = AVATAR.maxChosenDropBlocks;
  const uncontrolledPerBlock = AVATAR.uncontrolledFallDamagePerBlock;
  const bottomLayer = WORLD.size.z - 1;
  const traceSteps = TELLS.mineralTraces.distance;
  const cutYield = stackListText(SURFACE.cutTree.yields);
  // The lamp burns oil at the end of every Nth shift of the run, counted from
  // the first shift: with 4, at the end of shifts 4, 8, 12, ...
  const burnEvery = SHIFT.lampOilBurnEveryShifts;
  const firstBurnShift = SHIFT.firstShiftNumber + burnEvery - 1;
  const lowestMineCost = BLOCKS.dirt.mineCost ?? 0;
  const highestMineCost = BLOCKS.hardRock.mineCost ?? 0;

  return `Mining game: text play interface

USAGE (one command per step)
  npm run play -- --seed 7 --log run.json       start a run, save it in run.json, print the first view
  npm run play -- --log run.json                print the current view again (changes nothing)
  npm run play -- --log run.json --do e         take the choice named "e" (go east), print the new view
  npm run play -- --log run.json --do 3         the same by number: choice 3 of the action list
  npm run play -- --log run.json --do mine-e,e,end
                                                several choices in a row. It stops at the first
                                                choice that is not on the list and says which.
  npm run play -- --seed 7 --interactive        type choices at a prompt (add --log to save the run)
  npm run play -- --replay run.json             replay a log; print the final state hash and outcome
  npm run play -- --help                        this text

  --radius N   how far the map reaches sideways from you (default: the whole cube while you
               stand on the surface, ${DEFAULT_RADIUS} underground)
  --layers N   how many layers above and below yours are drawn (default ${DEFAULT_LAYERS})
  --loadout ID the starting kit (default: standard)

CHOICES: NAMES AND NUMBERS
  Every line of the action list has a number and a name. --do and the prompt take either.
  - A NUMBER is the line's place in the list. The list changes after every action, so the same
    number can mean something else one step later. In a chain, each number is read against the
    list as it stands at that moment. Use numbers one at a time.
  - A NAME says what the choice does, seen from where you stand, and means the same at every
    step. In a chain, use names. If a name is not on the list at that moment (say "e" with rock
    to the east), the chain stops there and nothing else is done: a name is never read as some
    other action.
  The names:
    n e s w                  go north, east, south, west (a walk, a step up or a walk off a ledge:
                             the list says which)
    up, down                 climb a ladder
    mine-n, mine-e, mine-s, mine-w     mine the block beside you, that way (no diagonals)
    mine-down                mine the block you stand on (dig down)
    mine-up                  mine the block over your head (only with a support in your cell)
    ladder-here, ladder-n, ladder-up, ladder-down, ...     place a ladder; torch-... the same
    craft-ladder, craft-torch, craft-fuel, ...             craft; the list shows each name
    take-here-stone, take-n-coal, ...                      pick up: where from, then what
    drop-stone, drop-all-stone                             drop one, or the whole stack. With one
                                                           carried only drop-stone is listed;
                                                           drop-all-stone then does the same
                                                           (and nothing else is read that way)
    cut-n, cut-e, cut-s, cut-w                             cut down the tree that way (on the
                                                           surface only)
    leave                    leave the cube (on the surface only)
    end (or 0)               end the shift
  Mine choices that differ only in direction share one line of the list, for example
    [2] Mine Stone, gives 1 Stone: 7. mine-e  9. mine-w  11. mine-down
  Each of them is still a choice of its own, with its own number and name. The two drops of an
  item share a line in the same way:
    [0] Drop Stone (one, or all 3): 15. drop-stone  16. drop-all-stone

READING A VIEW
  After you act, the view opens with one line starting ">" for each choice taken: what you did
  and what came of it (a fall, lost health, what you got). Read them; nothing else reports it.
  Then come your gauges. The map shows your layer with the layers above and below it
  beside it, each seen from above: x grows to the east (right), y grows to the south (down the
  page). "@" is you; "?" is a cell you have not seen, which may be rock or open space. While you
  stand on the surface the map is the whole surface and, beside it, the whole of layer 0, with
  "@" drawn on the block you stand on as well (--radius N draws less of both). On the surface
  "Y" is a tree, "," a stump, ":" a dirt path, '"' a meadow and "^" a stone outcrop. Underground
  the map reaches ${DEFAULT_RADIUS} cells each way, and is then trimmed: rows and columns at its edge that are
  unseen are left out. If you have seen cells of the drawn layers that are off the map, the
  "Map:" line says which --radius shows them. The legend
  under the map names every other character in it. Then come known hazards and what ending the
  shift now would do. A line starting "Not on the list:" says why something you might look for
  is not offered: the drop is too long; you have not seen what is under the cell; you are in a
  pit with nothing to step up onto; there is no rock where a step up would be (said only when
  no move up is on the list); or it costs more
  AP than you have left (those are named, with their cost). Last comes the
  list of everything you may do, each with its number, its name and its cost in AP.

THE GAME
  You are a miner on top of a cube of rock ${WORLD.size.x} by ${WORLD.size.y} wide and ${WORLD.size.z} layers deep. Layer 0 is the top
  layer of rock and layer ${bottomLayer} the bottom; you start on the surface, standing on layer 0. Dig down,
  collect what the rock gives, and come back up. The run ends alive only when you choose to
  leave from the surface. It ends in death if you fall too far or run out of fuel.

  Shifts and action points (AP)
  - Time passes in shifts. Each shift you get ${SHIFT.apPerShift} AP. Each action costs the AP shown beside it;
    an action you cannot afford this shift is not on the list. End the shift to get fresh AP.
  - Unspent AP is lost when the shift ends. It is not carried over and does not turn into fuel.

  Fuel and lamp oil
  - When a shift ends: if you have no fuel, the run ends. Otherwise the shift uses up ${SHIFT.fuelPerShift} fuel.
    Nothing refills fuel except crafting it. The "If you end the shift now" line says exactly
    what will happen, including when it would end the run. So with fuel at 0 you may still play
    one shift: that line warns you ("FUEL WILL BE 0") at the end of the shift before it.
  - The lamp uses ${SHIFT.lampOilPerBurn} oil every ${burnEvery} shifts: at the end of shift ${firstBurnShift}, of shift ${firstBurnShift + burnEvery}, and so on,
    whatever you did in them. With no oil the lamp goes out and you
    work by touch: see "In the dark" below. Crafting lamp oil lights it again at once.

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
    down off the bottom of a ladder) is free. Digging down is safe too when you drop ${AVATAR.safeDigDownBlocks} block onto
    rock: mine the block you stand on and you land on the block that was under it, unhurt. Any
    other fall is not: if you dig down and there is nothing under the block you mined, you lose
    your footing, and the whole fall, from where you stood, costs health from the first block.
  - What a fall of that kind costs: ${uncontrolledPerBlock} health for each of the first ${AVATAR.freeFallBlocks} blocks, ${AVATAR.fallDamagePerBlock} health for each
    block beyond that, and a fall of ${AVATAR.fatalFallBlocks} or more kills. So digging straight down under your own
    feet onto rock costs nothing; into an open space below, it costs from the first block. Nothing in this version of the game gives health back.
  - A ladder in your own cell holds you: place a ladder in your cell, then mine below, and you do
    not fall. That, or cutting steps sideways, is the safe way down.
  - The action list says what mining the block you stand on will do, as far as you know the
    cells below. You know the block you stand on (you touch it), not what is under it. Until you
    have seen that cell the list says "you drop at least 1 block; if there is nothing under it
    you will fall further and be hurt", and names the unseen cell. Once you have seen rock there
    it says "you drop 1 block, no harm". "FATAL" means it will kill you.
  - After a fall you may stand in a pit with no move on the list: rock on all four sides, too
    high to step onto. A ladder in your cell and one in the cell above let you climb up.

  Mining
  - Your pick reaches the blocks that share a face with your cell: north, east, south and west
    of you, and the block you stand on. No diagonals, and nothing on the layer below except the
    block under your feet. The block over your head only with a support in your cell (supports
    cannot be placed yet in this version of the game). To go down, dig the block you stand on;
    to make a stair, mine the block ahead, walk in, dig down, and so on: you can walk back up it.
  - Each kind of rock costs its own AP (from ${lowestMineCost} for dirt to ${highestMineCost} for hard rock), shown in the list,
    and a block is mined in one action: if it costs more AP than you have left it is not on the
    list, a "Not on the list:" line names it with its cost, and it waits for the next shift.
  - What the block gives goes into your pack. If that would put you over your carry limit, it
    is left lying in the hole instead.
  - Harder rock and different ores lie deeper. Timber-root grows only in the upper layers;
    the trees on the surface are the other source of timber.

  The forest
  - Most of the surface is forest. A tree blocks the way: you cannot walk or step up into it.
    Dirt paths, meadows and stone outcrops are open ground; an outcrop stands over stone.
    Some coal always lies in sight of where you start.
  - Cut a tree beside you (north, east, south or west; ${SURFACE.cutTree.ap} AP) for ${cutYield}. It leaves a
    stump, which is open ground. Timber too heavy to carry is left lying on the stump.
  - A tree hides the ground under it: from the surface you see that block only once the tree
    is cut, and you cannot mine down into it from the surface while the tree stands. From
    underground you see and mine it like any other block.
  - A tree grows back on a stump ${SURFACE.regrowShifts} shifts after the cut (the shift of the cut counts), at the
    end of a shift, if the block under the stump is still there; if you or loose items are on
    the stump then, it grows once the stump is clear. The block under it stays on your map.
    The "If you end the shift now" line says where a tree will grow back.

  What you can see
  - At the start you know only what is round you. Everywhere, top layer included, you know
    what your light has shown: on the surface daylight does the lamp's work, lamp oil or not,
    but never under a tree.
    Light spreads from you a few steps through open cells: round corners, never through rock.
    You see every lit cell and every cell touching one: only faces that open space shows.
  - You always know the six cells touching your own (north, east, south, west, above, below).
    Nothing else: not the block behind a wall, not what is under the floor of a cell beside you,
    not the bottom of a drop your light does not reach.
  - On the surface daylight spreads from you like your lamp's light: over open ground and down
    into an open hole near you, a few steps through open cells. It gives no light underground:
    once you are in the rock, only your lamp and torches light it.
  - What you have seen stays on the map. An unseen cell is "?" whether it is rock or open.
  - A torch lights the cells around it for good, the way your lamp does, and it needs no oil.
    Place it in your own cell or an open cell touching yours. A cell holds one thing: a ladder
    or a torch, not both.
  - Mineral traces: rock that lies within ${traceSteps} steps of iron ore, copper ore or crystal shows
    mineral traces. On the map traced rock has a character for each kind of rock, so you still
    see what it is and what it costs: "D" is dirt, "%" is stone and "h" is hard rock with traces
    (plain: "d", "#", "H"). The mine list names them too ("Stone, mineral traces").
    They say ore is near, not which ore or which way. You notice them only on rock your light
    touches; once noticed they stay on the map, also after the ore is mined, so an old mark can
    point at ore that is gone. Traces you first notice are always from ore still in the rock:
    if you notice some just after mining ore, other ore is near. Coal and timber-root give no
    traces. With the lamp out you notice none by touch: only a torch's light or daylight shows
    new ones.

  In the dark (lamp oil 0)
  - You learn only the six cells touching yours: north, east, south, west, above and below.
    Light shows you nothing more, so you see no further down a drop than the cell below you. On
    the surface daylight still lights what is round you, as a lit lamp would.
  - You can mine any block you know that your pick reaches: in the dark that is the walls beside
    you and the floor under you, the same blocks as with the lamp lit.
  - A move is on the list only when you know every cell it depends on. In the dark you cannot
    walk into a cell unless you know what is under it, step up onto a cell you have not seen,
    or climb down off the foot of a ladder into a drop you have not seen. So you can go back
    the way you came, but a cell you have just dug open beside you cannot be entered: you do
    not know its floor.
  - Digging straight down still works, and as with the lamp lit you do not know what is under the
    block you stand on until you have seen it: the list says so and names the unseen cell. A ladder in your own cell holds you while
    you mine below, and from it you can feel the cell underneath.
  - You notice no mineral traces in the dark, even on the rock you touch: feeling a block is
    not seeing it. Traces you noticed earlier stay on the map, and a torch's light still shows
    new ones.
  - What you saw while the lamp was lit stays known, and a torch keeps showing the cells round
    it. A torch placed where you are working, before the oil runs out, lets you carry on there.

  Weight and loose items
  - Everything you carry has a weight, shown in brackets after it, and there is a carry limit
    (the "Carry" gauge). Ladders weigh nothing. Fuel and lamp oil are gauges, not carried items.
  - Picking up and dropping are free. You can pick up from your own cell and the six cells
    touching it; you take the whole pile, or as much of it as fits (the list then says "4 of
    the 5"). You drop one item or the whole stack into your own cell.
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
