// The text `npm run play -- --help` prints: how to drive the tool, how to
// read a view, and the rules of the game as it plays today.
//
// The Newcomer playtester reads only this, so it has to stand alone. It
// states rules, in the order a player meets them. Every number in it is read
// from src/data, so the text cannot drift from the game when one is tuned.

import {
  ACTION_COSTS,
  BLOCKS,
  CAMPS,
  CAMP_RECIPES,
  CREW,
  FIELD_RECIPES,
  HAZARDS,
  SHIFT,
  SURFACE,
  TELLS,
  WORLD,
} from '../../src/data';
import { stackListText } from '../../src/app/text/describe';

export function helpText(): string {
  const recipes = FIELD_RECIPES.map(
    (recipe) => `    ${recipe.name}: from ${stackListText(recipe.inputs)}`,
  ).join('\n');
  const lastX = WORLD.size.x - 1;
  const lastY = WORLD.size.y - 1;
  const traceSteps = TELLS.mineralTraces.distance;
  const dampSteps = TELLS.hazards.dampStoneDistance;
  const pittedSteps = TELLS.hazards.pittedRockDistance;
  const glowSteps = TELLS.hazards.warmGlowDistance;
  const cutYield = stackListText(SURFACE.cutTree.yields);
  const lowestMineCost = BLOCKS.dirt.mineCost ?? 0;
  const highestMineCost = BLOCKS.hardRock.mineCost ?? 0;
  const rubbleCost = BLOCKS.rubble.mineCost ?? 0;
  // Pit walls slump (design doc 6.1): the numbers of the rule.
  const weakLimit = BLOCKS.dirt.slumpLimit ?? 0;
  const rockLimit = BLOCKS.stone.slumpLimit ?? 0;
  const hardLimit = BLOCKS.hardRock.slumpLimit ?? 0;
  const steepStep = HAZARDS.slump.steepStep;
  const crackCountdown = HAZARDS.slump.crackCountdown;
  // Camps (design doc 8).
  const campRecipes = CAMP_RECIPES.map(
    (recipe) => `    ${recipe.name}: from ${stackListText(recipe.inputs)}`,
  ).join('\n');
  const campSide = 2 * CAMPS.halfWidth + 1;
  const campSquareCount = campSide * campSide;
  const stoneCost = BLOCKS.stone.mineCost ?? 0;
  // Explosions (design doc 6.6): with a reach of 1 a blast covers 5 squares.
  const blastReach = HAZARDS.explosion.blastReach;
  const blastSquareCount = 2 * blastReach * (blastReach + 1) + 1;

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
    support X,Y              place a support on that square (you need one: craft-support)
    explosive X,Y            place an explosive on that square (a camp makes them); it goes
                             off when the shift ends
    mine! X,Y                mine a square although it would make others unstable, or arm
                             unstable ore (see below)
    camp X,Y                 found a camp on the ${campSide} x ${campSide} patch whose centre square is x X, y Y
    rest X,Y                 rest the crew at the camp whose centre square that is
    decommission X,Y         take that camp down
  Any square of the map may be named; nothing has to be near anything. A square that cannot be
  mined, cut, supported or camped on is refused with the reason, and nothing is done. A refused
  "camp X,Y" names the squares of the patch that are in the way.
  A mine that would make other squares unstable, or arm unstable ore, is not done the first
  time: you get a warning that names those squares, and nothing happens. Type it as "mine! X,Y" to do it all the same.
  Everything else you may do is a line of the action list, with a number and a name. --do and
  the prompt take either:
    craft-fuel, craft-support, ...     craft; the list shows each name
    rest X,Y, decommission X,Y         also listed, once for each camp that stands
    close-mine               close the mine (ends the run alive)
    end (or 0)               end the shift
  - A NAME means the same at every step. In a chain, use names.
  - A NUMBER is the line's place in the list, which changes as you gain and use materials. In a
    chain, each number is read against the list as it stands at that moment.
  Choices in a chain are separated by commas (the comma inside "mine 3,4" is not a break) or by
  semicolons.

READING A VIEW
  After you act, the view opens with one line starting ">" for each choice taken: what you did
  and what came of it (what you got, what the square shows now). Read them; nothing else
  reports it. Then come your gauges and the stockpile: everything you have.
  The map is the whole surface seen from above: x grows to the east (right), y grows to the
  south (down the page). The two lines over it give each column's x (tens over ones); each row
  starts with its y. Every square is two characters:
  - the first is what is on top: "Y" a tree, "A" a camp square, "~" water, "!" lava, "*" gas, otherwise
    the square's top
    block ("d" dirt, "#" stone, "c" coal, ...); the legend under the map names every character
    on it, with what the block costs to mine;
  - the second is the square's depth: how many blocks have been taken from it. Blank is ground
    level, then 1 to 9, then letters (a is 10, b is 11, ...). At ground level a "," there marks
    a stump. Straight after a tree's "Y" it is blank (the ground under it is hidden), or the
    block you saw there before the tree grew back.
  Under the map: the legend, then notes: what lies on a square that two characters cannot
  show (water, lava or gas and the block under it, a crack and its countdown, a support, an
  explosive, armed unstable ore), the
  stumps, each camp, and the squares where mining is cheaper because a camp is near. Then
  "Hazards": every cracked
  square, when it falls and where its block will land, and every placed explosive and armed
  unstable ore block with the squares of its blast. Then what ending the shift now would
  do, including which blocks slump, which squares crack, where water and lava flow, where gas
  spreads, and what explodes. A line starting "Not possible now:" says what costs more AP than you have left.
  Last comes how to mine, cut, place a support or an explosive and found a camp, with how many squares can be
  mined and trees cut now, and the list of everything else you may do, each with its number, its name and its cost in AP.

THE GAME
  You look down on a cube of rock ${WORLD.size.x} squares by ${WORLD.size.y} and ${WORLD.size.z} blocks deep (x 0 to ${lastX}, y 0 to ${lastY}),
  and mine it from the top: you choose a square and its top block is taken. There is no miner
  on the map and nothing walks. Collect what the rock gives. The run ends alive only when you
  choose to close the mine. It is lost if you run out of fuel, or if crew health reaches 0.
  The walls of the pit you dig can slump: see "Pit walls slump".

  Shifts and action points (AP)
  - Time passes in shifts. Each shift you get ${SHIFT.apPerShift} AP. Each action costs AP; one you cannot afford
    this shift is refused (or is not on the list). End the shift to get fresh AP.
  - Unspent AP is lost when the shift ends. It is not carried over and does not turn into fuel.

  Fuel
  - When a shift ends: if you have no fuel, the run ends. Otherwise the shift uses up ${SHIFT.fuelPerShift} fuel,
    and each camp uses up ${CAMPS.upkeepFuel} more every ${CAMPS.upkeepEveryShifts} shifts (see "Camps").
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
  - Under the surface there are open spaces: empty caverns, and pockets of water, gas (both in
    the middle layers) or lava (deep down). If the block you mine was the roof of one, the
    whole space falls in at once: the square still goes down by exactly 1, and its new top is
    rubble, which costs ${rubbleCost} AP and gives nothing. What a pocket held comes out and stands on
    the square you mined: the game says how much, and the notes under the map list it. A big
    lava pocket is a source, which keeps pouring.
  - Harder rock and different ores lie deeper. Timber-root grows only in the upper layers;
    the trees on the surface are the other source of timber.
  - A square mined all the way down shows the bedrock floor and cannot be mined further.
  - A square with water on it costs ${HAZARDS.water.floodedMineExtraAp} AP more to mine. A square with lava on it cannot be
    mined at all. See "Water and lava".
  Pit walls slump
  - The level rule lets you dig a slope of 1-level steps, but a slope that is too tall for its
    material does not hold. Picture a loose block on a square: it slides to the lowest square
    beside it (if several are equally low: north first, then east, south, west) as long as
    that one is deeper, and again from there, until it reaches a square with no deeper
    neighbour: the FOOT. The square's FALL is how many levels deeper its foot is.
  - A square is UNSTABLE when its fall is more than its top block holds: dirt and rubble hold a
    fall of ${weakLimit}, most rock and ore ${rockLimit}, hard rock and crystal ${hardLimit}. So in dirt every step down needs
    a level bench before the next step; in stone every second step; in hard rock every third.
    A square ${steepStep} or more levels above a neighbour is unstable whatever it is made of; you cannot
    dig such a step, but a slump can leave one.
  - When a shift ends, each unstable square CRACKS and shows a countdown of ${crackCountdown}. The countdown
    goes down by 1 at the end of each later shift while the square is still unstable. When a
    shift ends with the countdown at 1, the block falls: it slides to the foot and lies there
    as rubble. The square is then 1 deeper and the foot 1 higher. Whatever the block was, ore
    too, is lost. A slump can make other squares unstable; they crack in their turn.
  - If the square stops being unstable (you make the slope gentler, or rubble fills the hole
    below it), its countdown stops where it is. It goes on from there if the square becomes
    unstable again. A stopped crack reads "a crack, stopped at N" in the notes, and the
    Hazards line says its countdown is stopped. Mind one stopped at 1: it falls at the end of
    the shift in which the square becomes unstable again.
  - Mining a cracked block removes it, crack and all, like any other block.
  - A tree holds its square: a square with a tree never cracks. Cutting the tree ends that.
  - A SUPPORT holds the square it is placed on, and only that square: it does not crack, and a
    crack already on it stops counting down. Placing one costs ${ACTION_COSTS.placeSupport} AP and uses up the support.
    A square holds one support; none goes on a tree or on a square with no block left. If you
    mine the square, the support goes with the block and is lost. Rubble that lands on a
    supported square buries the support, and it is lost too.
  - Everything this rule reads is on your map: depths, top blocks, trees and supports. Before
    a mine is done you are told which squares it would make unstable (see CHOICES). The one
    thing you cannot know is what a mine or a cut uncovers: a weaker block than the one that
    was on top may turn out too weak for the slope it now tops, and the ground under a tree
    you cut may be too weak for the pit beside it.

  Water and lava
  - Water and lava stand on squares, in the open, where you see them: on the map "~" is a
    square with water on it and "!" one with lava, and the notes under the map say how many
    units, and which block is under them. Each unit raises the surface by one level: a
    square 3 deep with 2 units on it has its surface 1 below ground level.
  - WATER FLOWS when a shift ends. A square gives one unit to the lowest square beside it
    (if several are equally low: north first, then east, south, west) when that square's
    surface is at least ${HAZARDS.water.flowMinDrop} levels lower than its own, and goes on while that holds. A unit
    moves one square a shift. So water runs downhill and spreads until the pit is level to
    within 1; a single unit on a flat floor stays put. A sump dug lower than where you
    work collects it.
  - Nothing stands above ground level: what a square cannot hold drains away. Water never
    flows onto a square at ground level, or off the map.
  - LAVA flows by the same rule, but only at the end of even-numbered shifts. A big lava
    pocket leaves a SOURCE on the square you broke in on: it gives ${HAZARDS.lava.sourceUnitsPerStep} more lava each time lava
    flows, and that square always keeps lava on it.
  - Lava destroys a support on a square it stands on, and nothing can be placed on lava.
  - Where water and lava come onto the same square, one unit of each turns into a block of
    stone, which raises the square by 1 (never above ground level). A source that turns to
    stone stops.
  - If rubble slumps onto a square with water or lava on it, they are pushed up on top of
    the rubble: none is lost, unless it is then above ground level.
  - The "If you end the shift now" line says where water and lava will flow.

  Camps
  - You start with 1 camp kit. "camp X,Y" founds a camp on the ${campSide} x ${campSide} patch of squares whose
    centre is the square you name. It uses up the kit and takes the rest of the shift: all the
    AP you have left, and at least ${CAMPS.foundMinAp}.
  - The patch must be FLAT: all ${campSquareCount} squares at the same depth, at ground level or on the floor of
    your pit. None may have a tree, water, lava, gas, a support or another camp on it, and the
    whole patch must be on the map. A stump on the patch is cleared for good.
  - While the camp stands, its ${campSquareCount} squares cannot be mined and nothing can be placed on them. They
    are drawn "A" on the map.
  - MINING NEAR A CAMP IS CHEAPER: a mine costs ${CAMPS.mineDiscountAp} AP less (never less than ${CAMPS.mineMinAp}) on a square that
    is within ${CAMPS.mineDiscountSteps} steps of a camp square and no more than ${CAMPS.mineDiscountMaxDeeper} levels deeper than the camp. A step is
    to a square beside (north, east, south, west), so ${CAMPS.mineDiscountSteps} steps is not ${CAMPS.mineDiscountSteps} squares diagonally. So stone
    costs ${stoneCost - CAMPS.mineDiscountAp} instead of ${stoneCost} there, and dirt still costs ${lowestMineCost}. The notes under the map list the squares
    where it applies now. As the pit spreads and deepens away from the camp, the cheap squares
    run out: a camp further down the pit brings them back.
  - "rest X,Y" rests the crew at a camp. It takes the rest of the shift (all the AP left, at
    least ${CAMPS.restMinAp}). When the shift ends, crew health is back to full: after any damage of that shift,
    and only if the crew is still alive and the camp still stands. While the crew rests, the
    camp's squares count as squares it worked this shift (see "Crew health").
  - A camp also gives the camp recipes below, from anywhere on the map.
  - UPKEEP: each camp uses up ${CAMPS.upkeepFuel} fuel at the end of every ${CAMPS.upkeepEveryShifts}th shift, counting the shift it was
    founded in as the first. The camp's note under the map says when it is due.
  - "decommission X,Y" (${ACTION_COSTS.decommissionCamp} AP) takes a camp down: its upkeep, its recipes and its cheaper mining
    end, and its squares can be mined again. The kit is not given back.
  - A camp is DESTROYED, and lost with its kit, if a block slumps from one of its squares or
    comes to rest on one. A cracked camp square, or a cracked square whose block will land on
    the camp, is in the Hazards line; the "If you end the shift now" line says when a slump
    will destroy a camp. A crew resting there is hurt by that slump and gets no rest.
  - Water or lava that flows onto one of a camp's squares destroys it in the same way; the
    "If you end the shift now" line says so beforehand.

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
  - Hazard tells: a top block shows what is hidden close to it. They are listed under the map
    ("Tells on top blocks"), and named when you mine down to a block that has one.
      damp           a water pocket lies directly under or beside the block (within ${dampSteps} step)
      pitted         a gas pocket lies directly under or beside the block (within ${pittedSteps} step)
      warm glow      a lava pocket lies within ${glowSteps} steps
      hairline glow  the block itself is unstable ore
    Steps are counted through the rock, down as well as sideways. So a pocket right under a
    top block shows its tell before the mine that would break into it. An empty cavern gives
    no tell. A tell goes away when its pocket has fallen in.

  The stockpile
  - Everything you mine, cut or craft goes straight into the stockpile, wherever on the map it
    came from. The "Stockpile:" line under the gauges lists it. The stockpile has no limit:
    nothing is carried, picked up or dropped, and nothing weighs anything.
  - Crafting takes its materials from the stockpile.

  Crafting (${ACTION_COSTS.craft} AP each)
${recipes}
    Fuel keeps the run going. A support holds one square of a pit wall: see "Pit walls slump".

  Camp recipes (${ACTION_COSTS.campCraft} AP each; on the list only while a camp stands)
${campRecipes}
    Raw ore is smelted into ingots, and the other recipes take ingots. A camp kit founds another
    camp. An explosive is placed with "explosive X,Y" (see "Gas, unstable ore and
    explosives"). The drill, pump, vent, scanner charge and sealant can be made but do
    nothing yet (see "Not in this version").

  Crew health
  - Your crew starts with ${CREW.startHealth} health ("Crew health" among the gauges). The crew is not on the map.
  - A hazard hurts the crew only where it worked this shift: on a square you mined, cut a tree
    on, or built on since the shift began, and the squares of a camp it is resting at. When the shift ends, each kind of hazard that
    reaches such a square takes health once. Squares you left alone this shift are safe for
    the crew.
  - A slump takes ${CREW.damage.slump} health if the block falls from a square the crew worked this shift, or
    comes to rest on one. Several slumps in one end of shift still take ${CREW.damage.slump} in all. The Hazards
    line says which squares are about to slump and where the blocks will land, so you can
    keep the crew off them in the shift they fall.
  - Resting at a camp brings crew health back to full (see "Camps"). Nothing else restores it.
  - Water takes ${CREW.damage.water} health if it flows onto a square the crew worked this shift. Water that
    already stands on a square you mine does not hurt; it only costs AP.
  - Lava takes ${CREW.damage.lavaOn} health if it stands on a square the crew worked this shift when the shift
    ends, and ${CREW.damage.lavaBeside} if it stands on a square beside one. That is so at the end of every shift, not
    only when lava flows. Breaking into a lava pocket puts lava on the square you just
    worked.
  - Gas takes ${CREW.damage.gas} health if it stands on a square the crew worked this shift when the shift
    ends. Breaking into a gas pocket puts gas on the square you just worked.
  - A gas explosion takes ${CREW.damage.gasExplosion} health if a burning square, or a square beside one, was worked
    this shift. The explosion of a charge or of unstable ore takes ${CREW.damage.explosion} if its blast includes a
    worked square. They are two kinds of hazard: a charge that sets off gas beside the crew
    takes ${CREW.damage.explosion + CREW.damage.gasExplosion}.
  - At 0 crew health the run is lost.

  Gas, unstable ore and explosives
  - GAS stands on squares ("*" on the map; the notes give the units). It is heavier than air:
    it lies in the pit and never climbs. When a shift ends, a square with gas gives an even
    share to each square beside it that is no higher (at the same depth or deeper) and keeps
    the rest: with 9 units and 2 such neighbours, 3 go to each and 3 stay. Thin gas stays:
    a square with fewer units than it has such neighbours plus one gives nothing, and a
    square never gives away its last unit. So gas does not go away by itself. Units go on
    shifting between level squares, but once gas has reached a square it stays there.
  - Gas BURNS if lava stands on its square or on a square beside it, or if a blast covers its
    square or a square beside it. All the gassy squares joined to it through their sides go
    off together, as one explosion: the gas is gone, what is placed on those squares and
    beside them (supports, explosives, a camp) is destroyed, and no block is removed.
  - UNSTABLE ORE shows a hairline glow. Mining it is safe and gives rare ore. But mining the
    block beside it on its own layer ARMS it, if you can see the ore and no support stands on
    its square: it goes off when that shift ends. The ore is destroyed and gives nothing, and
    its blast covers its square and the ${blastSquareCount - 1} squares beside it. To avoid that, mine the ore
    first, or place a support on its square before you mine beside it. A support placed after
    the ore is armed does not disarm it; mining the armed ore out does. A mine that would arm
    ore is not done the first time: you get a warning, and "mine! X,Y" takes it.
  - An EXPLOSIVE is made at a camp and placed on any square with "explosive X,Y" (${ACTION_COSTS.placeExplosive} AP). It
    goes off when that shift ends: it destroys the top block of its square and of the ${blastSquareCount - 1}
    squares beside it, with no yield. The level rule does not bind a blast, so it can leave
    a steep step, which then cracks and slumps like any other. A tree in the blast is
    destroyed (no timber) and the block under it stays.
  - Placing an explosive is not work on that square: the crew pulls back, so the charge alone
    does not hurt it. It does if the blast covers a square you mined, cut or built on in the
    same shift.
  - The blast of a charge or of ore destroys what is placed on its squares (another charge
    there is destroyed and does not go off), destroys a camp on one of its squares or beside
    one, and lights gas on its squares and beside them.
  - A relic or keystone in a blast is destroyed only by chance (${Math.round(HAZARDS.explosion.chanceBlockDestroyed * 100)} in 100); otherwise it is
    left in place.
  - If the block a blast removes was the roof of a cavern or pocket, the space falls in as
    under a mine, and what it held comes out; gas that comes out burns at once.

  Closing the mine
  - "close-mine" is always on the list and costs ${ACTION_COSTS.closeMine} AP. It ends the run at once, alive, with
    what is in the stockpile (the game calls this a "salvage" run). There is no other way to
    finish alive, and a closed mine cannot be opened again.

  Not in this version of the game
  - The other tools made at a camp (drill, pump, vent, scanner charge, sealant) cannot be used
    yet. So nothing takes gas away but burning it.
  - Contracts are not built yet, and relics and keystones are not in the cube yet.
`;
}
