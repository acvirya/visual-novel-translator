import { logger } from "./loggerService";

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
  notes?: string; // e.g. "Role: Main, Female"
  selected?: boolean;
}

class VndbService {
  private readonly KANA_API = "https://api.vndb.org/kana";

  /**
   * Search for Visual Novels by title or direct VNDB ID (e.g. "v17" or "Clannad")
   */
  public async searchVn(query: string): Promise<VndbSearchResult[]> {
    const q = query.trim();
    if (!q) return [];

    // Check if user entered direct VNDB ID or URL (e.g. "v17" or "https://vndb.org/v17")
    const idMatch = q.match(/(?:vndb\.org\/)?(v\d+)/i);
    const filters = idMatch
      ? ["id", "=", idMatch[1].toLowerCase()]
      : ["search", "=", q];

    logger.info("VNDB", `Searching visual novels with query: "${q}"`);

    try {
      const res = await fetch(`${this.KANA_API}/vn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filters,
          fields: "id, title, alttitle, released, image.url",
          results: 10,
        }),
      });

      if (!res.ok) {
        throw new Error(`VNDB API HTTP ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
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
      logger.error("VNDB", `Failed to search VN: ${err?.message || err}`);
      throw err;
    }
  }

  /**
   * Fetch all characters associated with a Visual Novel ID
   */
  public async fetchCharacters(vnId: string): Promise<VndbCharacterResult[]> {
    const cleanId = vnId.trim().toLowerCase().match(/v\d+/)?.[0] || vnId.trim().toLowerCase();
    logger.info("VNDB", `Fetching characters for Visual Novel ID: ${cleanId}`);

    try {
      const res = await fetch(`${this.KANA_API}/character`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filters: ["vn", "=", ["id", "=", cleanId]],
          fields: "id, name, original, aliases, sex, vns.role, vns.id",
          results: 100,
        }),
      });

      if (!res.ok) {
        throw new Error(`VNDB API HTTP ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
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

        // Pack role & gender together into the character's Notes field
        const roleLabel = vnRole ? `Role: ${vnRole.charAt(0).toUpperCase() + vnRole.slice(1)}` : "";
        const notesArr = [roleLabel, genderLabel].filter(Boolean);
        const notes = notesArr.join(", ");

        return {
          id: c.id,
          name: romajiName || kanjiName,
          original: kanjiName || romajiName,
          aliases: c.aliases || [],
          role: vnRole || "side",
          gender: genderLabel || undefined,
          notes,
          selected: vnRole === "main" || vnRole === "primary", // Pre-select main and primary characters
        };
      });
    } catch (err: any) {
      logger.error("VNDB", `Failed to fetch characters for ${vnId}: ${err?.message || err}`);
      throw err;
    }
  }
}

export const vndbService = new VndbService();
