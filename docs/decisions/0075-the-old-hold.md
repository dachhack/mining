# 0075: The back story is the Old Hold

Asked for back stories, the owner was given five (a Crown charter, the Old
Hold, a debt, a lantern guild, the dragon's ground) and chose: "Let's go with
old hold. On your grandpa's death bed he relates the story of lost treasures
and beseeches you to reclaim the lost glory of the family."

- The owner then rewrote the first draft's words: floods buried the valley
  (not dragons and marauders driving the family out), and the player starts
  with "a rusty shovel". The pages are the owner's text.
- The story is in `src/app/lab/story.ts` (`STORY_PAGES`): words for the
  screen, not rules, so it is not in src/data and the engine knows nothing of
  it. Its two numbers (the relics, the run's shifts) are read from the data.
- It is told when a brand-new run starts as the game: the first launch, and
  after New run. Not when a saved run is carried on, not in Lab 2, and not
  when the address names a seed.
- Open: tier-3 contracts still ask the player to hand over the family's
  relics and keystones for coins, and the score is coins. Whether heirlooms
  brought home should count for the score, and what the run's end says, is
  for the owner (owner-questions.md).
