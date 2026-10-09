"use client";
import { useEffect, useState } from "react";
import { site } from "@/lib/site";
import type { Leaderboard } from "@/lib/bot/types";

export default function CommunityLeaderboard() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Leaderboard>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    setData(undefined);
    setError(false);
    fetch(`/api/discord/leaderboard?page=${page}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [page]);
  return (
    <div className="mx-auto max-w-[960px] px-4 py-10 sm:px-6 sm:py-14">
      <div className="relative overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/15 via-surface to-bg-deep p-6 sm:p-9">
        <p className="text-[10px] font-bold uppercase tracking-[.2em] text-accent-soft">
          GDM Community
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Every conversation counts.
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-text-dim">
          Hang out, share what you&apos;re playing, and get to know the
          community. Earn XP in eligible Discord channels and unlock role
          rewards along the way.
        </p>
        <a
          href={site.discord}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex rounded-lg bg-accent px-5 py-3 text-sm font-bold text-white hover:bg-accent-hover"
        >
          Join the community ↗
        </a>
      </div>
      <div className="mb-4 mt-9 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Community leaderboard</h2>
        <span className="text-xs text-muted">
          {data?.available
            ? `${data.total.toLocaleString()} ranked members`
            : "Discord leveling"}
        </span>
      </div>
      {!data && !error && (
        <div className="card p-8 text-sm text-muted">Loading ranks…</div>
      )}
      {(error || (data && !data.available)) && (
        <div className="card p-8">
          <p className="font-semibold">
            The leaderboard is unavailable right now.
          </p>
          <p className="mt-2 text-sm text-muted">
            You can still hang out with us on Discord. Ranks will appear here
            when public leveling is enabled.
          </p>
        </div>
      )}
      {data?.available && (
        <>
          <div className="card overflow-hidden">
            {data.entries.map((r, i) => (
              <div
                key={r.user_id}
                className={`flex items-center gap-3 px-4 py-5 sm:gap-5 sm:px-6 ${i ? "border-t border-border-soft" : ""}`}
              >
                <span
                  className={`w-8 shrink-0 text-center text-lg font-extrabold tabular-nums ${r.position === 1 ? "text-amber" : r.position <= 3 ? "text-accent-soft" : "text-muted"}`}
                >
                  {r.position}
                </span>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-sm font-bold text-accent-soft">
                  {r.username.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold sm:text-base">
                    {r.username}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    {r.messages.toLocaleString()} XP-earning messages
                  </p>
                  <div
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3"
                    aria-label={`${Math.round(r.progress * 100)}% to next level`}
                  >
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${r.progress * 100}%` }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-accent-soft">
                    Level {r.level}
                  </p>
                  <p className="mt-1 text-[11px] tabular-nums text-muted">
                    {r.xp.toLocaleString()} XP
                  </p>
                </div>
              </div>
            ))}
            {!data.entries.length && (
              <p className="p-8 text-sm text-muted">
                No ranks on this page yet. The next conversation could be yours.
              </p>
            )}
          </div>
          <div className="mt-5 flex items-center justify-between text-xs text-muted">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-border px-4 py-2.5 disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              Page {page} of {Math.max(1, Math.ceil(data.total / 25))}
            </span>
            <button
              disabled={page * 25 >= data.total || page >= 400}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-border px-4 py-2.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </>
      )}
      <p className="mt-6 text-xs leading-relaxed text-muted">
        Use /rank in Discord to see your progress. /privacy lets you hide or
        erase your rank. Tickets and private conversations don&apos;t earn XP.
        Macro requests and website support stay on the website.
      </p>
    </div>
  );
}
