import type { Leaderboard, LeaderboardEntry } from "./types";

/** Public output uses an explicit field list, even if the private service changes. */
export function publicLeaderboard(value: unknown, page: number): Leaderboard {
  const empty: Leaderboard = { available: false, entries: [], total: 0, page };
  if (!value || typeof value !== "object") return empty;
  const data = value as Record<string, unknown>;
  if (data.available !== true || !Array.isArray(data.entries)) return empty;
  const entries: LeaderboardEntry[] = [];
  for (const row of data.entries.slice(0, 25)) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (
      typeof r.user_id !== "string" ||
      !/^[1-9][0-9]{16,19}$/.test(r.user_id) ||
      typeof r.username !== "string"
    )
      continue;
    const numbers = [r.position, r.xp, r.messages, r.level, r.progress];
    if (
      numbers.some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0)
    )
      continue;
    entries.push({
      user_id: r.user_id,
      username: r.username.slice(0, 100),
      position: Number(r.position),
      avatar:
        typeof r.avatar === "string" && /^(a_)?[a-f0-9]{32}$/.test(r.avatar)
          ? r.avatar
          : null,
      xp: Number(r.xp),
      messages: Number(r.messages),
      level: Math.min(1000, Number(r.level)),
      progress: Math.min(1, Number(r.progress)),
    });
  }
  return {
    available: true,
    entries,
    page,
    total:
      typeof data.total === "number" &&
      Number.isSafeInteger(data.total) &&
      data.total >= 0
        ? data.total
        : 0,
  };
}
