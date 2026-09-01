import { describe, it, expect } from "vitest";
import {
  filterPersonalityTraits,
  formatCharacterNotes,
  DEFAULT_VNDB_TRAIT_FILTERS,
} from "../vndbTraitFilter";

describe("vndbTraitFilter", () => {
  const sampleTraits = [
    // Personality traits to keep
    { group_name: "Personality", name: "Brother Complex" },
    { group_name: "Personality", name: "Cheerful" },
    { group_name: "Personality", name: "Deredere" },
    { group_name: "Personality", name: "Distrustful" },
    { group_name: "Personality", name: "Family Oriented" },
    { group_name: "Personality", name: "Jealous" },
    { group_name: "Personality", name: "Lucky" },
    { group_name: "Personality", name: "Mischievous" },
    { group_name: "Personality", name: "Protective" },
    { group_name: "Personality", name: "Smart" },

    // Talking Patterns (to filter out by default)
    { group_name: "Personality", name: "Watashi" },
    { group_name: "Personality", name: "Boku" },
    { group_name: "Personality", name: "Third Person" },
    { group_name: "Personality", name: "Made-up Words" },
    { group_name: "Personality", name: "Desu" },
    { group_name: "Personality", name: "Keigo" },

    // Dialects (to filter out by default)
    { group_name: "Personality", name: "Kansai-ben" },
    { group_name: "Personality", name: "Japanese Dialect" },

    // Religious (to filter out by default)
    { group_name: "Personality", name: "Atheist" },

    // Non-personality traits (Role, Clothes, Sexual)
    { group_name: "Role", name: "Singer" },
    { group_name: "Role", name: "Student Council Vice President" },
    { group_name: "Clothes", name: "Pleated Skirt" },
    { group_name: "Engages in (Sexual)", name: "French Kiss" },
  ];

  it("filters out non-personality, talking patterns, dialects, and religious traits by default", () => {
    const result = filterPersonalityTraits(sampleTraits, DEFAULT_VNDB_TRAIT_FILTERS);

    // Non-personality should not be present
    expect(result).not.toContain("Singer");
    expect(result).not.toContain("Pleated Skirt");
    expect(result).not.toContain("French Kiss");

    // Talking patterns should be filtered
    expect(result).not.toContain("Watashi");
    expect(result).not.toContain("Boku");
    expect(result).not.toContain("Third Person");
    expect(result).not.toContain("Made-up Words");
    expect(result).not.toContain("Desu");
    expect(result).not.toContain("Keigo");

    // Dialects should be filtered
    expect(result).not.toContain("Kansai-ben");
    expect(result).not.toContain("Japanese Dialect");

    // Religious should be filtered
    expect(result).not.toContain("Atheist");

    // Kept personality traits
    expect(result).toEqual([
      "Brother Complex",
      "Cheerful",
      "Deredere",
      "Distrustful",
      "Family Oriented",
      "Jealous",
      "Lucky",
      "Mischievous",
      "Protective",
      "Smart",
    ]);
  });

  it("retains talking patterns when filterTalkingPatterns is false", () => {
    const result = filterPersonalityTraits(sampleTraits, {
      filterTalkingPatterns: false,
      filterDialects: true,
      filterReligiousBeliefs: true,
    });

    expect(result).toContain("Watashi");
    expect(result).toContain("Third Person");
    expect(result).not.toContain("Kansai-ben");
    expect(result).not.toContain("Atheist");
  });

  it("formats character notes correctly", () => {
    const notes = formatCharacterNotes("main", "Female", ["Deredere", "Protective", "Smart"]);
    expect(notes).toBe("Role: Main | Female | Personality: Deredere, Protective, Smart");
  });

  it("handles missing role or personality gracefully", () => {
    const notesWithoutPersonality = formatCharacterNotes("side", "Male", []);
    expect(notesWithoutPersonality).toBe("Role: Side | Male");

    const notesWithoutRole = formatCharacterNotes(undefined, "Female", ["Kind"]);
    expect(notesWithoutRole).toBe("Female | Personality: Kind");
  });
});
