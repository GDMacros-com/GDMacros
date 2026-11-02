import "server-only";

/** Direct Geometry Dash metadata lookups. The historical filename keeps existing
 * callers compatible; no request is made to GDBrowser. Protocol reference:
 * https://boomlings.dev/endpoints/levels/getGJLevels21
 * Server-side only. No player credentials or visitor identity are sent.
 */
const ENDPOINT = "https://www.boomlings.com/database/getGJLevels21.php";
const TIMEOUT_MS = 8000;
export const MAX_QUERY_LENGTH = 60;

export interface GdLevel {
  levelId: string;
  name: string;
  creator: string;
  difficulty: string;
  downloads: number | null;
  likes: number | null;
  length: string;
  stars: number | null;
  songName: string;
  platformer: boolean;
}

export type GdResult<T> = { ok: true; data: T } | { ok: false; reason: GdFailure };

/**
 * Deliberately a small closed set rather than a message. The caller decides the
 * wording, so no upstream text can ever reach a visitor.
 */
export type GdFailure = "not-found" | "bad-request" | "unavailable" | "timeout";

const CACHE_MS = 5 * 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map<string, { at: number; value: unknown }>();

function cached<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

function remember(key: string, value: unknown) {
  // Oldest out first. Map preserves insertion order, so this is enough.
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value });
}


function pairs(value: string, separator = ":"): Record<string, string> {
  const parts = value.split(separator);
  const result: Record<string, string> = Object.create(null);
  if (parts.length % 2) throw new Error("Malformed metadata");
  for (let i = 0; i < parts.length; i += 2) result[parts[i]] = parts[i + 1];
  return result;
}
const number = (value: string | undefined): number | null => {
  if (value === undefined || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const OFFICIAL_SONGS = ["Stereo Madness", "Back On Track", "Polargeist", "Dry Out", "Base After Base", "Cant Let Go", "Jumper", "Time Machine", "Cycles", "xStep", "Clutterfunk", "Theory of Everything", "Electroman Adventures", "Clubstep", "Electrodynamix", "Hexagon Force", "Blast Processing", "Theory of Everything 2", "Geometrical Dominator", "Deadlocked", "Fingerdash", "Dash"];

function parse(body: string): GdLevel[] {
  const sections = body.trim().split("#");
  if (sections.length < 4 || !sections[0]) throw new Error("Malformed search response");
  const creators = new Map(sections[1].split("|").filter(Boolean).map(row => {
    const [id, name] = row.split(":");
    return [id, name] as const;
  }));
  const songs = new Map(sections[2].split("~:~").filter(Boolean).map(row => {
    const fields = pairs(row, "~|~");
    return [fields["1"], fields["2"]] as const;
  }));
  return sections[0].split("|").map(row => {
    const r = pairs(row);
    if (!/^[0-9]{1,12}$/.test(r["1"] ?? "") || !r["2"]?.trim()) throw new Error("Invalid level");
    let difficulty = "N/A";
    if (r["25"] === "1") difficulty = "Auto";
    else if (r["17"] === "1") difficulty = ({ "3": "Easy Demon", "4": "Medium Demon", "0": "Hard Demon", "5": "Insane Demon", "6": "Extreme Demon" } as Record<string, string>)[r["43"]] ?? "Hard Demon";
    else if (Number(r["8"]) > 0) difficulty = ["N/A", "Easy", "Normal", "Hard", "Harder", "Insane"][Math.round(Number(r["9"]) / Number(r["8"]))] ?? "N/A";
    const platformer = r["15"] === "5";
    return {
      levelId: r["1"], name: r["2"].trim(), creator: creators.get(r["6"]) || "Unknown",
      difficulty, downloads: number(r["10"]), likes: number(r["14"]),
      length: ["Tiny", "Short", "Medium", "Long", "XL", "Platformer"][Number(r["15"])] ?? "",
      stars: number(r["18"]), platformer,
      songName: Number(r["35"]) > 0 ? songs.get(r["35"]) || "" : OFFICIAL_SONGS[Number(r["12"])] || "",
    };
  });
}

async function request(query: string): Promise<GdResult<GdLevel[]>> {
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "User-Agent": "", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: "Wmfd2893gb7", gameVersion: "22", binaryVersion: "51", type: "0", str: query, page: "0" }),
      signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store",
    });
    const body = await response.text();
    // HTTP failures and challenges must never be mistaken for deleted levels.
    if (!response.ok) return { ok: false, reason: "unavailable" };
    if (body.trim() === "-1") return { ok: true, data: [] };
    return { ok: true, data: parse(body) };
  } catch (e) {
    return { ok: false, reason: e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "unavailable" };
  }
}

export function extractLevelId(input: string): string | null {
  const t = String(input ?? "").trim();
  if (/^[0-9]{1,12}$/.test(t)) return t;
  return t.match(/([0-9]{3,12})/)?.[1] ?? null;
}

export async function lookupLevel(rawId: string): Promise<GdResult<GdLevel>> {
  const id = extractLevelId(rawId);
  if (!id) return { ok: false, reason: "bad-request" };
  const hit = cached<GdLevel>(`level:${id}`);
  if (hit) return { ok: true, data: hit };
  const result = await request(id);
  if (!result.ok) return result;
  // Numeric searches must resolve the exact ID, never a similarly named level.
  const level = result.data.find(level => level.levelId === id);
  if (!level) return { ok: false, reason: "not-found" };
  remember(`level:${id}`, level);
  return { ok: true, data: level };
}

export async function searchLevels(rawQuery: string): Promise<GdResult<GdLevel[]>> {
  const query = String(rawQuery ?? "").trim();
  if (!query || query.length > MAX_QUERY_LENGTH) return { ok: false, reason: "bad-request" };
  if (/^[0-9]{1,12}$/.test(query)) {
    const result = await lookupLevel(query);
    return result.ok ? { ok: true, data: [result.data] } : result;
  }
  const key = `search:${query.toLowerCase()}`;
  const hit = cached<GdLevel[]>(key);
  if (hit) return { ok: true, data: hit };
  const result = await request(query);
  if (result.ok) remember(key, result.data);
  return result;
}

/** The wording a visitor sees. No upstream text, ever. */
export function gdErrorMessage(reason: GdFailure): string {
  switch (reason) {
    case "not-found":
      return "No Geometry Dash level matched that.";
    case "bad-request":
      return "Enter a level name or a level ID.";
    case "timeout":
      return "The Geometry Dash level lookup timed out. Please try again.";
    default:
      return "We couldn't verify that Geometry Dash level right now. Please try again.";
  }
}
