import { getAllLevels } from "./macros";
import { parseFps } from "./fps";
import { site } from "./site";
import { RECORDERS, type Level, type Macro } from "./types";

// Only public catalog fields cross this boundary. Never spread database rows.
function recording(macro: Macro) {
  return {
    author: macro.author, recorder: macro.recorder, fps: macro.fps,
    testedAt: macro.testedAt ?? null,
    downloadType: macro.downloadType, downloadUrl: macro.downloadLink,
  };
}

function levelData(level: Level) {
  return {
    levelId: String(level.levelId), name: level.name, creator: level.creator,
    slug: level.slug, url: `${site.url}/macro/${encodeURIComponent(level.slug)}`,
    description: level.description ?? null, videoUrl: level.video ?? null,
    thumbnailUrl: level.thumbnailLargeUrl
      ? new URL(level.thumbnailLargeUrl, site.url).href : null,
    addedAt: level.addedAt ?? null,
  };
}

class InvalidQuery extends Error {}

function parameters(url: URL, allowed: string[]) {
  for (const key of url.searchParams.keys()) {
    if (!allowed.includes(key)) throw new InvalidQuery(`Unknown query parameter: ${key}.`);
    if (url.searchParams.getAll(key).length !== 1) throw new InvalidQuery(`Repeat parameter ${key} only once.`);
  }
}

function positiveInteger(value: string | null, fallback: number, max: number, name: string) {
  if (value === null) return fallback;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) {
    throw new InvalidQuery(`${name} must be an integer between 1 and ${max}.`);
  }
  return Number(value);
}

function filters(url: URL) {
  parameters(url, ["search", "recorder", "fps", "page", "limit"]);
  const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
  if (search.length > 100) throw new InvalidQuery("search must be at most 100 characters.");
  const recorder = url.searchParams.get("recorder");
  if (recorder !== null && !RECORDERS.some(value => value === recorder)) {
    throw new InvalidQuery(`recorder must be one of: ${RECORDERS.join(", ")}.`);
  }
  const rawFps = url.searchParams.get("fps");
  const fps = rawFps === null ? null : parseFps(rawFps);
  if (rawFps !== null && fps === null) throw new InvalidQuery("fps must be a positive finite number.");
  return {
    search, recorder, fps,
    page: positiveInteger(url.searchParams.get("page"), 1, 1_000_000, "page"),
    limit: positiveInteger(url.searchParams.get("limit"), 20, 100, "limit"),
  };
}

function paginate<T>(items: T[], page: number, limit: number) {
  return {
    data: items.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total: items.length, totalPages: Math.ceil(items.length / limit) },
  };
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "If-None-Match",
  "X-Content-Type-Options": "nosniff",
};

function json(request: Request, value: unknown, status = 200) {
  const body = JSON.stringify(value);
  const headers = new Headers({ ...cors, "Content-Type": "application/json; charset=utf-8" });
  headers.set("Cache-Control", status === 200
    ? "public, max-age=0, s-maxage=300, stale-while-revalidate=60" : "no-store");
  // Do not emit ETags: Vercel's CDN-generated 304 responses strip CORS
  // headers. CDN caching still applies; browser clients receive JSON 200s.
  return new Response(request.method === "HEAD" ? null : body, { status, headers });
}

export function apiOptions() {
  return new Response(null, { status: 204, headers: { ...cors, Allow: "GET, HEAD, OPTIONS" } });
}

export function apiMethodNotAllowed(request: Request) {
  const response = json(request, { error: { code: "METHOD_NOT_ALLOWED", message: "Use GET, HEAD or OPTIONS." } }, 405);
  response.headers.set("Allow", "GET, HEAD, OPTIONS");
  return response;
}

export function apiNotFound(request: Request) {
  return json(request, { error: { code: "NOT_FOUND", message: "API endpoint not found." } }, 404);
}

type Resource = "index" | "levels" | "level" | "macros" | "stats";

/** No auth, upstream fetches, secrets or private submission data are used here. */
export function publicApi(request: Request, resource: Resource, levelId?: string) {
  try {
    const url = new URL(request.url);
    if (resource === "index") {
      parameters(url, []);
      return json(request, { data: {
        version: "v1", endpoints: {
          levels: "/api/v1/levels", level: "/api/v1/levels/{levelId}",
          macros: "/api/v1/macros", stats: "/api/v1/stats",
        },
      } });
    }
    if (resource === "levels" || resource === "macros") {
      const { search, recorder, fps, page, limit } = filters(url);
      const matchesRecording = (macro: Macro) =>
        (recorder === null || macro.recorder === recorder) && (fps === null || macro.fps === fps);
      const levels = getAllLevels();
      if (resource === "levels") {
        const items = levels.filter(level => level.searchIndex.includes(search)
          && level.macros.some(matchesRecording))
          // Return all recordings for each matching level, not a partial level.
          .map(level => ({ ...levelData(level), macros: level.macros.map(recording) }));
        return json(request, paginate(items, page, limit));
      }
      const items = levels.flatMap(level => level.macros.filter(macro => matchesRecording(macro)
        && [level.name, level.creator, String(level.levelId), macro.author, macro.recorder]
          .join(" ").toLowerCase().includes(search))
        .map(macro => ({ ...recording(macro), level: levelData(level) })));
      return json(request, paginate(items, page, limit));
    }
    parameters(url, []);
    if (resource === "level") {
      if (!levelId || !/^\d{1,12}$/.test(levelId)) throw new InvalidQuery("levelId must contain 1 to 12 digits.");
      const level = getAllLevels().find(item => String(item.levelId) === levelId);
      if (!level) return json(request, { error: { code: "NOT_FOUND", message: "Level not found." } }, 404);
      return json(request, { data: { ...levelData(level), macros: level.macros.map(recording) } });
    }
    const levels = getAllLevels();
    const macros = levels.flatMap(level => level.macros);
    return json(request, { data: {
      levels: levels.length, macros: macros.length,
      recorders: RECORDERS.map(recorder => ({ recorder, macros: macros.filter(macro => macro.recorder === recorder).length })),
    } });
  } catch (error) {
    if (error instanceof InvalidQuery) {
      return json(request, { error: { code: "INVALID_QUERY", message: error.message } }, 400);
    }
    console.error("[public-api] Catalog response failed");
    return json(request, { error: { code: "INTERNAL_ERROR", message: "The catalog is temporarily unavailable." } }, 500);
  }
}
