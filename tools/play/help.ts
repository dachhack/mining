// The text `npm run play -- --help` prints: how to drive the tool, how to
// read a view, and the rules of the game as it plays in M1.
//
// The Newcomer playtester reads only this, so it has to stand alone. It
// states rules, in the order a player meets them. Every number in it is read
// from src/data, so the text cannot drift from the game when one is tuned.

import { ACTION_COSTS, AVATAR, BLOCKS, FIELD_RECIPES, SHIFT, TELLS, WORLD } from '../../src/data';
import { stackListText } from './describe';
import { DEFAULT_LAYERS, DEFAULT_RADIUS } from './view';

export function helpText(): string {
  const recipes = FIELD_RECIPES.map(
    (recipe) => `    ${recipe.name}: from ${stackListText(recipe.inputs)}`,
  ).join('\n');
  const safeDrop = AVATAR.maxChosenDropBlocks;
  const uncontrolledPerBlock = AVATAR.uncontrolledFallDamagePerBlock;
  const bottomLayer = WORLD.size.z - 1;
  const traceSteps = TELLS.mineralTraces.distance;
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
    mine-n, mine-ne, ...     mine the block that way on your layer (n ne e se s sw w nw)
    mine-down                mine the block you stand on
    mine-n-down, ...         mine the block that way, one layer down
    ladder-here, ladder-n, ladder-up, ladder-down, ...     place a ladder; torch-... the same
    craft-ladder, craft-torch, craft-fuel, ...             craft; the list shows each name
    take-here-stone, take-n-coal, ...                      pick up: where from, then what
    drop-stone, drop-all-stone                             drop one, or the whole stack. With one
                                                           carried only drop-stone is listed;
                                                           drop-all-stone then does the same
                                                           (and nothing else is read that way)
    leave                    leave the cube (on the surface only)
    end (or 0)               end the shift
  Mine choices that differ only in direction share one line of the list, for example
    [2] Mine Stone, gives 1 Stone: 7. mine-e  11. mine-se-down  13. mine-nw-down
  Each of them is still a choice of its own, with its own number and name. The two drops of an
  item share a line in the same way:
    [0] Drop Stone (one, or all 3): 15. drop-stone  16. drop-all-stone

READING A VIEW
  After you act, the view opens with one line starting ">" for each choice taken: what you did
  and what came of it (a fall, lost health, what you got). Read them; nothing else reports it.
  Then come your gauges. The map shows your layer with the layers above and below it
  beside it, each seen from above: x grows to the east (right), y grows to the south (down the
  page). "@" is you; "?" is a cell you have not seen, which may be rock or open space. While you
  stand on the surface the map is layer 0 alone, all of it, with "@" drawn on the block you
  stand on (the surface itself is open air everywhere and is not drawn; --radius N draws it
  beside layer 0). Underground
  the map reaches ${DEFAULT_RADIUS} cells each way, and is then trimmed: rows and columns at its edge that are
  unseen are left out. If you have seen cells below the top layer that are off the map, the
  "Map:" line says which --radius shows it all. It says nothing about the top layer, which you
  know all of from the start and which always goes on beyond a small map. The legend
  under the map names every other character in it. Then come known hazards and what ending the
  shift now would do. A line starting "Not on the list:" says why something you might look for
  is not offered: the drop is too long; you have not seen what is under the cell; you are in a
  pit with nothing to step up onto; there is no rock where a step up would be; or it costs more
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
    down off the bottom of a ladder) is free. A fall you did not choose as a move is not: if you
    mine the block you stand on and no ladder holds you, you lose your footing and it costs
    health from the first block.
  - What a fall of that kind costs: ${uncontrolledPerBlock} health for each of the first ${AVATAR.freeFallBlocks} blocks, ${AVATAR.fallDamagePerBlock} health for each
    block beyond that, and a fall of ${AVATAR.fatalFallBlocks} or more kills. So digging straight down under your own
    feet costs ${uncontrolledPerBlock} health a layer. Nothing in this version of the game gives health back.
  - A ladder in your own cell holds you: place a ladder in your cell, then mine below, and you do
    not fall. That, or cutting steps sideways, is the safe way down.
  - The action list says what mining the block you stand on will cost: how far you will fall and
    the health you will lose, as far as you have seen the cells below. "1 block" means you have
    seen where you land and what is under it. "1 block or more" means the cell under your
    landing is unseen (the list names it): in a shaft one cell wide your lamp shows the floor,
    not what is under the floor. "FATAL" means it will kill you.
  - After a fall you may stand in a pit with no move on the list: rock on all four sides, too
    high to step onto. A ladder in your cell and one in the cell above let you climb up.

  Mining
  - Your pick reaches the 8 cells around you on your own layer (diagonals too) and the 9 cells
    of the layer below under those and under you. You cannot mine the block over your head, or
    anything else on the layer above.
  - Each kind of rock costs its own AP (from ${lowestMineCost} for dirt to ${highestMineCost} for hard rock), shown in the list,
    and a block is mined in one action: if it costs more AP than you have left it is not on the
    list, a "Not on the list:" line names it with its cost, and it waits for the next shift.
  - What the block gives goes into your pack. If that would put you over your carry limit, it
    is left lying in the hole instead.
  - Harder rock and different ores lie deeper. Timber-root, the only source of timber, grows
    only in the upper layers.

  What you can see
  - You know the whole top layer from the start. Below it you know what your lamp has shown.
    Light spreads from you a few steps through open cells: round corners, never through rock.
    You see every lit cell and every cell touching one.
  - While your lamp is lit you also know the cells your pick can reach and the cell over your
    head, and you can look over an edge: beside a drop, or on a ladder, you see far enough down
    to judge the drop.
  - Daylight does not shine down a hole: from the surface you see that a hole is there, not
    what is at its bottom.
  - What you have seen stays on the map. An unseen cell is "?" whether it is rock or open.
  - A torch lights the cells around it for good, the way your lamp does, and it needs no oil.
    Place it in your own cell or an open cell touching yours. A cell holds one thing: a ladder
    or a torch, not both.
  - Mineral traces: rock that lies within ${traceSteps} steps of iron ore, copper ore or crystal shows
    mineral traces. On the map traced rock has a character for each kind of rock, so you still
    see what it is and what it costs: "D" is dirt, "%" is stone and "h" is hard rock with traces
    (plain: "d", "#", "H"). The mine list names them too ("Stone, mineral traces").
    They say ore is near, not which ore or which way. You notice them only on rock your light
    touches; once noticed they stay on the map, also after the ore is mined: rock uncovered
    by mining ore can show traces of the ore you have just taken. Coal and timber-root give no
    traces. With the lamp out you notice none by touch: only a torch's light or daylight shows
    new ones.

  In the dark (lamp oil 0)
  - You learn only the six cells touching yours: north, east, south, west, above and below.
    Nothing new diagonally, nothing new around the cell below you, and you cannot look down a
    drop. On the surface daylight still shows you the top layer.
  - You can mine any block you know. In the dark that is the walls beside you and the floor
    under you, plus anything you saw earlier or a torch shows: diagonal blocks you saw while
    the lamp was lit are still on the list.
  - A move is on the list only when you know every cell it depends on. In the dark you cannot
    walk into a cell unless you know what is under it, step up onto a cell you have not seen,
    or climb down off the foot of a ladder into a drop you have not seen. So you can go back
    the way you came, but a cell you have just dug open beside you cannot be entered: you do
    not know its floor.
  - Digging straight down still works, but in the dark you do not know what is under the block
    you stand on: the list says "N blocks or more" with the least health it will cost, and names
    the unseen cell. The fall may be longer and cost more. A ladder in your own cell holds you while
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
