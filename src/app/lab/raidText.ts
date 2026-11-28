// The night's line about a raid (owner, after the 0.28.0 build: "Show
// strength vs defense in the night message"). What marauders take depends on
// how far their strength is above the raided camp's defense level (the
// engine's raids.ts), so the line gives both numbers and the gap.

import { ITEMS } from '../../data';
import type { ItemId } from '../../data';
import type { Raid } from '../../engine/frontier/raids';

/** An item's name in lower case, for a sentence. */
function nameOf(item: string): string {
  return (item in ITEMS ? ITEMS[item as ItemId].name : item).toLowerCase();
}

/** One sentence (with a leading space, as the night's other lines) for `raid`. */
export function raidText(raid: Raid): string {
  const versus = `strength ${raid.strength} against ${
    raid.defense === 0 ? 'no defenses' : `defense ${raid.defense}`
  }`;
  if (raid.turnedAway) {
    return ` Marauders 🏴 came for camp ${raid.campId} (${versus}): its defenses turned them away.`;
  }
  const short = raid.strength - raid.defense;
  const took: string[] = [];
  if (raid.stolen.length > 0) {
    took.push(`stole ${raid.stolen.map((st) => `${st.count} ${nameOf(st.item)}`).join(', ')}`);
  }
  if (raid.upgradesLost > 0) {
    took.push(
      `tore down ${raid.upgradesLost === 1 ? 'an upgrade' : `${raid.upgradesLost} upgrades`}`,
    );
  }
  const what = took.length === 0 ? 'took nothing' : took.join(' and ');
  return ` Marauders 🏴 raided camp ${raid.campId} (${versus}: ${short} short) and ${what}. A camp with defense ${raid.strength} 🛡 would have turned them away.`;
}
