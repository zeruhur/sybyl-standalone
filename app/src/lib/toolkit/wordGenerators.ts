/** Random word generators for quick story-idea prompts during solo play. Original curated
 * lists (not ported from any external plugin) — categories chosen to match the shape of
 * common RPG word-generator toolkits: nouns, verbs, adjectives, adverbs, jobs, aspects,
 * town names, and articles. */

export interface WordCategory {
  id: string;
  label: string;
}

export const WORD_CATEGORIES: WordCategory[] = [
  { id: "noun", label: "Noun" },
  { id: "verb", label: "Verb" },
  { id: "adjective", label: "Adjective" },
  { id: "adverb", label: "Adverb" },
  { id: "job", label: "Job" },
  { id: "aspect", label: "Aspect" },
  { id: "town_name", label: "Town name" },
  { id: "article", label: "Article/object" }
];

const WORD_LISTS: Record<string, string[]> = {
  noun: [
    "lantern", "bridge", "ledger", "harbor", "orchard", "shrine", "cellar", "compass",
    "banner", "well", "archive", "furnace", "tower", "market", "quarry", "chapel",
    "workshop", "signal", "border", "vault", "granary", "watchtower", "causeway", "cistern"
  ],
  verb: [
    "abandon", "negotiate", "smuggle", "repair", "betray", "investigate", "flee", "trade",
    "defend", "trespass", "forge", "confess", "hunt", "rebuild", "steal", "warn",
    "bargain", "ambush", "shelter", "expose", "rescue", "sabotage", "recruit", "vanish"
  ],
  adjective: [
    "weathered", "gilded", "hollow", "brittle", "restless", "sunken", "feral", "sacred",
    "forgotten", "fractured", "silent", "corroded", "luminous", "threadbare", "unyielding",
    "crooked", "frostbitten", "gaunt", "overgrown", "tarnished", "watchful", "wretched"
  ],
  adverb: [
    "quietly", "suddenly", "reluctantly", "openly", "carefully", "recklessly", "briefly",
    "secretly", "grimly", "eagerly", "wearily", "deliberately", "nervously", "coldly",
    "hastily", "warily", "defiantly", "silently"
  ],
  job: [
    "blacksmith", "smuggler", "cartographer", "innkeeper", "physician", "scribe", "mercenary",
    "quartermaster", "informant", "gravedigger", "fence", "courier", "tax collector",
    "shipwright", "beekeeper", "watchman", "midwife", "prospector", "tanner", "gatekeeper"
  ],
  aspect: [
    "loyalty", "debt", "grief", "ambition", "suspicion", "pride", "hunger", "duty",
    "envy", "hope", "guilt", "curiosity", "fear", "vengeance", "patience", "isolation",
    "greed", "devotion", "regret", "defiance"
  ],
  town_name: [
    "Millbrook", "Ashford", "Ravenswick", "Thornbury", "Duskhollow", "Fenwater",
    "Grayspire", "Ironhold", "Saltmere", "Cinderfall", "Wolfden", "Brightwell",
    "Marrowgate", "Coldharbor", "Stonewick", "Emberfield", "Foxglove", "Nightcross"
  ],
  article: [
    "rusted key", "sealed letter", "cracked mirror", "worn coin", "torn map", "empty vial",
    "carved idol", "broken compass", "faded photograph", "iron chain", "wax-sealed scroll",
    "chipped locket", "bloodstained glove", "tarnished ring", "weighted die", "burnt journal"
  ]
};

export function generateWord(categoryId: string): string | undefined {
  const list = WORD_LISTS[categoryId];
  if (!list || list.length === 0) return undefined;
  return list[Math.floor(Math.random() * list.length)];
}
