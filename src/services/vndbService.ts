import { logger } from "./loggerService";
import {
  VndbTraitFilterOptions,
  DEFAULT_VNDB_TRAIT_FILTERS,
  filterPersonalityTraits,
  formatCharacterNotes,
} from "../utils/vndbTraitFilter";

export type { VndbTraitFilterOptions };
export { DEFAULT_VNDB_TRAIT_FILTERS };

export interface VndbSearchResult {
  id: string; // e.g. "v17"
  title: string;
  alttitle?: string;
  released?: string;
  imageUrl?: string;
}

export interface VndbCharacterResult {
  id: string; // e.g. "c123"
  name: string; // English/Romaji name, e.g. "Sakagami Tomoyo"
  original?: string; // Japanese name, e.g. "坂上 智代"
  aliases?: string[];
  role?: string; // "main" | "primary" | "side" | "appears"
  gender?: string; // "f" | "m" | "both"
  personality?: string[]; // e.g. ["Brother Complex", "Cheerful", "Deredere"]
  notes?: string; // e.g. "Role: Main | Female | Personality: Brother Complex, Cheerful"
  rawTraits?: Array<{ id?: string | number; name: string; group_name?: string; group_id?: string }>;
  selected?: boolean;
}

class VndbService {
  private static readonly KANA_API = "https://api.vndb.org/kana";

  private static async fetchWithRateLimit(endpoint: string, body: any, maxRetries = 2): Promise<any> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const res = await fetch(`${this.KANA_API}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        return await res.json();
      }

      if (res.status === 429) {
        if (attempt < maxRetries) {
          const retryHeader = res.headers.get("Retry-After");
          const waitSec = retryHeader ? parseFloat(retryHeader) : 2;
          const waitMs = Math.max(1500, Math.min(6000, (isNaN(waitSec) ? 2 : waitSec) * 1000));
          logger.warn("VNDB", `Rate limited (HTTP 429). Retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})...`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }
        throw new Error("VNDB API rate limit reached. Please wait a few seconds before searching again.");
      }

      throw new Error(`VNDB API HTTP ${res.status}: ${await res.text()}`);
    }
  }

  /**
   * Search visual novels by title query or direct VNDB ID (e.g. "v17")
   */
  public static async searchVisualNovels(query: string): Promise<VndbSearchResult[]> {
    const q = query.trim();
    if (!q) return [];

    // Check if user entered direct VNDB ID or URL (e.g. "v17" or "https://vndb.org/v17")
    const idMatch = q.match(/(?:vndb\.org\/)?(v\d+)/i);
    const filters = idMatch
      ? ["id", "=", idMatch[1].toLowerCase()]
      : ["search", "=", q];

    logger.info("VNDB", `Searching visual novels with query: "${q}"`);

    try {
      const data = await this.fetchWithRateLimit("/vn", {
        filters,
        fields: "id, title, alttitle, released, image.url",
        results: 10,
      });

      if (!data.results || !Array.isArray(data.results)) {
        return [];
      }

      return data.results.map((r: any) => ({
        id: r.id,
        title: r.title,
        alttitle: r.alttitle || undefined,
        released: r.released || undefined,
        imageUrl: r.image?.url || undefined,
      }));
    } catch (err: any) {
      logger.error("VNDB", `Search failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Fetch characters for a specific VN ID (e.g. "v17") with personality traits
   */
  public static async fetchCharactersForVn(
    vnId: string,
    filterOptions?: Partial<VndbTraitFilterOptions>
  ): Promise<VndbCharacterResult[]> {
    const cleanId = vnId.trim().toLowerCase().replace(/^.*vndb\.org\//, "");
    if (!cleanId) return [];

    const effectiveFilters: VndbTraitFilterOptions = {
      ...DEFAULT_VNDB_TRAIT_FILTERS,
      ...filterOptions,
    };

    logger.info("VNDB", `Fetching characters for VN ID: "${cleanId}"`);

    try {
      const data = await this.fetchWithRateLimit("/character", {
        filters: ["vn", "=", ["id", "=", cleanId]],
        fields: "id, name, original, aliases, sex, vns.role, vns.id, traits.id, traits.name, traits.group_id, traits.group_name, traits.spoiler",
        results: 100,
      });

      if (!data.results || !Array.isArray(data.results)) {
        return [];
      }

      return data.results.map((c: any) => {
        const romajiName = c.name ? String(c.name).trim() : "";
        const kanjiName = c.original ? String(c.original).trim() : "";

        // Extract role for this specific VN
        let vnRole = "";
        if (Array.isArray(c.vns)) {
          const matchedVn = c.vns.find((v: any) => v && v.id === cleanId) || c.vns[0];
          if (matchedVn && matchedVn.role) {
            vnRole = String(matchedVn.role).toLowerCase();
          }
        }

        // Parse gender from VNDB 'sex' property ("f" | "m" | "b" | ["m","f"])
        const rawSex = Array.isArray(c.sex) ? c.sex[0] : (c.sex ?? c.gender);
        let genderLabel = "";
        if (rawSex === "f" || rawSex === "female") {
          genderLabel = "Female";
        } else if (rawSex === "m" || rawSex === "male") {
          genderLabel = "Male";
        } else if (rawSex === "b" || rawSex === "both") {
          genderLabel = "Both";
        } else if (typeof rawSex === "string" && rawSex.trim()) {
          genderLabel = rawSex.trim();
        }

        // Extract filtered personality traits
        const rawTraits = Array.isArray(c.traits) ? c.traits : [];
        const personalityTraits = filterPersonalityTraits(rawTraits, effectiveFilters);

        // Pack role, gender & filtered personality together into the character's Notes field
        const notes = formatCharacterNotes(vnRole, genderLabel, personalityTraits);

        return {
          id: c.id,
          name: romajiName || kanjiName,
          original: kanjiName || romajiName,
          aliases: c.aliases || [],
          role: vnRole || "side",
          gender: genderLabel || undefined,
          personality: personalityTraits,
          notes,
          rawTraits,
          selected: vnRole === "main" || vnRole === "primary", // Pre-select main and primary characters
        };
      });
    } catch (err: any) {
      logger.error("VNDB", `Failed to fetch characters for ${vnId}: ${err?.message || err}`);
      throw err;
    }
  }

  public async searchVn(query: string): Promise<VndbSearchResult[]> {
    return VndbService.searchVisualNovels(query);
  }

  public async fetchCharacters(
    vnId: string,
    filterOptions?: Partial<VndbTraitFilterOptions>
  ): Promise<VndbCharacterResult[]> {
    return VndbService.fetchCharactersForVn(vnId, filterOptions);
  }
}

export const vndbService = new VndbService();
