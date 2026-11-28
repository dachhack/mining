// The back story (owner, after the 0.26.0 build: "Let's go with old hold. On
// your grandpa's death bed he relates the story of lost treasures and
// beseeches you to reclaim the lost glory of the family."). The words are
// the owner's own (after the first draft): floods buried the valley.
//
// A few short pages over the whole screen when a new run starts: a tap turns
// the page, the last tap starts the run, and Skip ends it at once. It is
// words only: it changes nothing in the game, and the page behind takes no
// input while it shows (as the night does, night.ts).

import { FRONTIER_RUN } from '../../data/frontier';
import { element } from './labDom';

/** The story's name, for the screen. */
export const STORY_TITLE = 'The Old Hold';

/** The story, a page at a time; each page is a few short lines. */
export const STORY_PAGES: string[][] = [
  [
    'Your grandfather sent for you on his last night.',
    '“When I was young we lived in the valley past the last town. We found many treasures and valuable ores in that fertile soil.”',
  ],
  [
    '“Then the floods came and washed away the valley, burying everything in soil and rock. We ran with what we could carry.”',
    '“We left the rest in the deep: the family’s relics, and the keystones of the old hall.”',
  ],
  [
    '“It is all still down there. Go back. Light the camps again. Dig until you find what is ours. Bring back our name.”',
  ],
  [
    `You have one camp, a rusty shovel, and ${FRONTIER_RUN.shifts} shifts before winter closes the pass.`,
    'Reclaim your family’s heritage.',
  ],
];

/** A story being shown: `skip` ends it at once. */
export interface Story {
  skip: () => void;
}

/**
 * Show the story over `host`. `page` (the screen behind) takes no input until
 * it is over; `onDone` is called once, when the last page is tapped or Skip is.
 */
export function showStory(
  host: HTMLElement,
  options: { page: HTMLElement; onDone: () => void },
): Story {
  const overlay = element('div', 'lab2-story');
  overlay.dataset['testid'] = 'lab2-story';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', STORY_TITLE);
  const title = element('p', 'lab2-story-title', STORY_TITLE);
  const text = element('div', 'lab2-story-text');
  text.dataset['testid'] = 'lab2-story-text';
  const foot = element('div', 'lab2-story-foot');
  const count = element('span', 'lab2-story-count');
  const tapOn = element('span', 'lab2-story-continue', 'Tap to continue');
  const skip = element('button', 'lab2-story-skip', 'Skip');
  skip.dataset['testid'] = 'lab2-story-skip';
  skip.setAttribute('type', 'button');
  foot.append(count, tapOn, skip);
  overlay.append(title, text, foot);
  host.append(overlay);
  options.page.inert = true;

  let at = 0;
  let done = false;
  const show = (): void => {
    text.replaceChildren(
      ...(STORY_PAGES[at] ?? []).map((line) => element('p', 'lab2-story-line', line)),
    );
    overlay.dataset['page'] = String(at + 1);
    count.textContent = `${at + 1} / ${STORY_PAGES.length}`;
    tapOn.textContent = at === STORY_PAGES.length - 1 ? 'Tap to begin' : 'Tap to continue';
  };
  const finish = (): void => {
    if (done) return;
    done = true;
    overlay.remove();
    options.page.inert = false;
    options.onDone();
  };
  // On the click, at the end of the tap, so the tap's end cannot land on the map behind.
  overlay.addEventListener('click', (event) => {
    event.preventDefault();
    if (at >= STORY_PAGES.length - 1) {
      finish();
      return;
    }
    at += 1;
    show();
  });
  skip.addEventListener('click', (event) => {
    event.stopPropagation();
    finish();
  });
  show();
  return { skip: finish };
}
