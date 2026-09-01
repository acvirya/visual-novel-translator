/**
 * VNDB Trait Filtering Subsystem
 * Curates and filters personality traits to optimize LLM token usage and translation precision.
 */

export interface VndbTraitFilterOptions {
  filterTalkingPatterns: boolean; // Watashi, Boku, Ore, Third Person, Desu, Nano, Keigo, etc.
  filterDialects: boolean; // Kansai-ben, Japanese Dialect, Foreign Accent, etc.
  filterReligiousBeliefs: boolean; // Atheist, Agnostic, Religious, etc.
}

export const DEFAULT_VNDB_TRAIT_FILTERS: VndbTraitFilterOptions = {
  filterTalkingPatterns: true,
  filterDialects: true,
  filterReligiousBeliefs: true,
};

// Talking Patterns & Personal Pronouns (Descendants of VNDB Trait ID 225 & 2196)
export const TALKING_PATTERN_TRAIT_NAMES: ReadonlySet<string> = new Set([
  // Personal Pronouns (ID: 2196)
  "Watashi",
  "Boku",
  "Ore",
  "Watakushi",
  "Atashi",
  "Atakushi",
  "Atashi-sama",
  "Ore-sama",
  "Uchi",
  "Washi",
  "Ware",
  "Waga",
  "Wagahai",
  "Warawa",
  "Jibun",
  "Oira",
  "Ora",
  "Atai",
  "Achishi",
  "Chin",
  "Wachiki",
  "Sessha",
  "Soregashi",
  "Shousei",
  "Yo",
  "Sonata",
  "Personal Pronouns",
  "Switching Personal Pronouns",

  // Verbal Tics, Speech Habits & Mannerisms (ID: 225)
  "Desu",
  "Desu wa",
  "Desu no",
  "De gozaru",
  "Nano",
  "Nanoja",
  "Mon",
  "-ssu",
  "-shi",
  "Ara Ara",
  "Keigo",
  "Third Person",
  "Made-up Words",
  "Word Repetition",
  "Puns",
  "Lisping",
  "Stutter",
  "Loud",
  "Quiet",
  "Laconic Speech",
  "One-Word Vocabulary",
  "Opposite Gender Voiced",
  "Talking Patterns",
]);

// Dialects, Accents & Regional/Subculture Speech Styles
export const DIALECT_TRAIT_NAMES: ReadonlySet<string> = new Set([
  "Kansai-ben",
  "Japanese Dialect",
  "Archaic Dialect",
  "Southern Drawl",
  "Foreign Accent",
  "Foreign Words",
  "Gyaru Speech",
  "Masculine Speech",
  "Animal Speech",
  "Broken Japanese",
]);

// Religious Beliefs (Descendants of VNDB Trait ID 875)
export const RELIGIOUS_TRAIT_NAMES: ReadonlySet<string> = new Set([
  "Atheist",
  "Agnostic",
  "Religious",
  "Religious Belief",
  "Religious Extremist",
]);

/**
 * Filters raw VNDB traits to extract only relevant, high-signal Personality traits.
 */
export function filterPersonalityTraits(
  rawTraits: Array<{ id?: string | number; name: string; group_name?: string; group_id?: string }>,
  options: VndbTraitFilterOptions = DEFAULT_VNDB_TRAIT_FILTERS
): string[] {
  if (!Array.isArray(rawTraits)) return [];

  const unique = new Set<string>();

  for (const t of rawTraits) {
    if (!t || typeof t.name !== "string") continue;
    const name = t.name.trim();
    if (!name) continue;

    // Must belong to Personality group (group_id "i39" or group_name "Personality")
    const isPersonality = t.group_name === "Personality" || t.group_id === "i39";
    if (!isPersonality) continue;

    // Filter out Talking Patterns / Pronouns
    if (options.filterTalkingPatterns && TALKING_PATTERN_TRAIT_NAMES.has(name)) {
      continue;
    }

    // Filter out Dialects / Accents
    if (options.filterDialects && DIALECT_TRAIT_NAMES.has(name)) {
      continue;
    }

    // Filter out Religious Beliefs
    if (options.filterReligiousBeliefs && RELIGIOUS_TRAIT_NAMES.has(name)) {
      continue;
    }

    unique.add(name);
  }

  return Array.from(unique);
}

/**
 * Formats a character's role, gender, and personality traits into a clean notes string for LLM and Glossary.
 */
export function formatCharacterNotes(
  role?: string,
  gender?: string,
  personalityTraits: string[] = []
): string {
  const roleLabel = role ? `Role: ${role.charAt(0).toUpperCase() + role.slice(1)}` : "";
  const genderLabel = gender || "";
  const personalityLabel = personalityTraits.length > 0 ? `Personality: ${personalityTraits.join(", ")}` : "";

  const notesArr = [roleLabel, genderLabel, personalityLabel].filter(Boolean);
  return notesArr.join(" | ");
}
