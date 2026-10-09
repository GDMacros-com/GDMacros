"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BOT_MODULES,
  type BotModule,
  type BotSettings,
  type BotState,
} from "@/lib/bot/types";
import { botApi, dateTime } from "./api";
import { buttonClass, Toggle } from "./Fields";
import Modules from "./Modules";
import Cases from "./Cases";
import LevelImport from "./LevelImport";

type TicketSummary = {
  id: number;
  panel_id: string;
  channel_id: string | null;
  owner_id: string;
  claimed_by: string | null;
  status: string;
  created_at: number;
  expires_at: number | null;
};

export default function BotPanel({ section }: { section: string }) {
  const [state, setState] = useState<BotState>();
  const [settings, setSettings] = useState<BotSettings>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const dirty =
    !!state && JSON.stringify(settings) !== JSON.stringify(state.settings);
  const module = BOT_MODULES.find((m) => m.key === section);
  const notice = (s: string, error = false) => {
    setMessage(s);
    setFailed(error);
  };
  async function load() {
    setLoading(true);
    try {
      const next = await botApi<BotState>("state");
      setState(next);
      setSettings(next.settings);
      notice("");
    } catch (error) {
      notice(
        error instanceof Error ? error.message : "The bot could not be loaded.",
        true,
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function save() {
    if (!state || !settings) return;
    setBusy(true);
    try {
      const saved = await botApi<{
        revision: number;
        settings: BotSettings;
        warning?: string;
      }>("settings", {
        method: "PUT",
        data: { revision: state.revision, settings },
      });
      setState({
        ...state,
        revision: saved.revision,
        settings: saved.settings,
      });
      setSettings(saved.settings);
      notice(saved.warning || "Settings saved.");
    } catch (error) {
      notice(
        error instanceof Error
          ? error.message
          : "The save could not be confirmed. Reload before retrying.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }
  async function action(name: string, data = {}) {
    if (
      !window.confirm(
        name === "sync-rewards"
          ? "Synchronize saved role rewards for all ranked members?"
          : "Send or update this message in the saved Discord channel?",
      )
    )
      return;
    setBusy(true);
    try {
      await botApi("actions/" + name, {
        method: "POST",
        data: { ...data, confirmed: true },
      });
      notice(
        name === "sync-rewards"
          ? "Reward sync started. Check the dashboard for any permission errors."
          : "Discord message updated.",
      );
    } catch (error) {
      notice(
        error instanceof Error
          ? error.message
          : "The action could not be confirmed.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }
  const navigation = [
    { key: "overview", title: "Overview", symbol: "◫" },
    ...BOT_MODULES,
    { key: "cases", title: "Moderation cases", symbol: "#" },
  ];
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/admin" className="text-xs text-muted hover:text-text">
        ← Admin panel
      </Link>
      <header className="mb-7 mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[.18em] text-accent-soft">
            GDM Community
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            {module?.title ??
              (section === "cases" ? "Moderation cases" : "Community bot")}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {module?.description ?? "Your server, managed from one place."}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs ${state?.status.connected ? "border-green/25 bg-green/10 text-green" : "border-border bg-surface text-muted"}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${state?.status.connected ? "bg-green" : "bg-muted"}`}
          />
          {state?.status.connected
            ? `Connected · ${state.status.latency_ms ?? "—"} ms`
            : loading
              ? "Connecting…"
              : "Offline"}
        </span>
      </header>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[205px_minmax(0,1fr)]">
        <aside className="min-w-0 lg:sticky lg:top-24">
          <nav
            aria-label="Bot modules"
            className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-2 lg:flex-col"
          >
            {navigation.map((m) => (
              <Link
                key={m.key}
                href={
                  m.key === "overview"
                    ? "/admin/bot-panel"
                    : `/admin/bot-panel/${m.key}`
                }
                onClick={(e) => {
                  if (
                    dirty &&
                    !window.confirm(
                      "Leave this page and discard unsaved settings?",
                    )
                  )
                    e.preventDefault();
                }}
                aria-current={section === m.key ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-medium transition-colors ${section === m.key ? "bg-accent/15 text-accent-soft" : "text-muted hover:bg-surface-2 hover:text-text"}`}
              >
                <span className="w-4 text-center">{m.symbol}</span>
                {m.title}
              </Link>
            ))}
          </nav>
          <div className="mt-3 hidden rounded-xl border border-border p-4 text-[11px] leading-relaxed text-muted lg:block">
            <p className="font-semibold text-text-dim">
              {state?.status.guild_name ?? "GDM Community"}
            </p>
            <p className="mt-1">Website admin access</p>
            <p className="mt-1">Configuration #{state?.revision ?? "—"}</p>
            <button
              type="button"
              className="mt-3 text-accent-soft hover:underline"
              disabled={busy || loading}
              onClick={() => {
                if (
                  !dirty ||
                  window.confirm("Reload and discard unsaved settings?")
                )
                  void load();
              }}
            >
              Refresh connection
            </button>
          </div>
        </aside>
        <main className="min-w-0 space-y-5">
          {message && (
            <p
              role={failed ? "alert" : "status"}
              className={`rounded-xl border p-4 text-sm leading-relaxed ${failed ? "border-rose/30 bg-rose/10 text-rose" : "border-green/25 bg-green/10 text-green"}`}
            >
              {message}
            </p>
          )}
          {loading && (
            <div className="card p-8 text-sm text-muted">
              Loading server settings…
            </div>
          )}
          {!loading && !state && (
            <div className="card p-6">
              <h2 className="font-bold">Connect your bot service</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                The dashboard is ready. Complete the bot setup on your server,
                then refresh this page.
              </p>
              <button
                type="button"
                className={buttonClass + " mt-4"}
                onClick={() => void load()}
              >
                Try again
              </button>
            </div>
          )}
          {state && !loading && settings && (
            <>
              {state.status.problem && (
                <p className="rounded-xl border border-amber/30 bg-amber/10 p-4 text-xs text-amber">
                  {state.status.problem}
                </p>
              )}
              {section === "overview" && <Overview state={state} />}
              {section === "cases" && <Cases />}
              {module && (
                <>
                  <div className="card p-5">
                    <Toggle
                      label={`Enable ${module.title.toLowerCase()}`}
                      checked={settings[module.key].enabled}
                      onChange={(enabled) =>
                        setSettings({
                          ...settings,
                          [module.key]: { ...settings[module.key], enabled },
                        })
                      }
                      help="Changes take effect after you save."
                    />
                  </div>
                  <Modules
                    module={module.key as BotModule}
                    state={state}
                    value={settings}
                    onChange={setSettings}
                    action={(name, data) => void action(name, data)}
                    busy={busy}
                    dirty={dirty}
                  />
                  {module.key === "leveling" && (
                    <LevelImport
                      revision={state.revision}
                      dirty={dirty}
                      notice={notice}
                    />
                  )}
                  {module.key === "tickets" && <TicketList />}
                  <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/95 p-4 shadow-xl backdrop-blur">
                    <span className="text-xs text-muted">
                      {dirty ? "Unsaved changes" : "Settings are up to date"}
                    </span>
                    <button
                      type="button"
                      disabled={busy || !dirty || !state.status.connected}
                      onClick={() => void save()}
                      className={buttonClass}
                    >
                      {busy ? "Saving…" : "Save settings"}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function Overview({ state }: { state: BotState }) {
  const counts = [
    ["Moderation cases", state.status.cases],
    ["Open tickets", state.status.open_tickets],
    ["Ranked members", state.status.ranked_members],
    ["Queued logs", state.status.pending_logs],
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {counts.map(([name, count]) => (
          <div key={name} className="card p-4">
            <p className="text-2xl font-extrabold tabular-nums">{count}</p>
            <p className="mt-1 text-xs text-muted">{name}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {BOT_MODULES.map((m) => (
          <Link
            href={`/admin/bot-panel/${m.key}`}
            key={m.key}
            className="card p-5 transition-colors hover:border-accent/40"
          >
            <div className="flex items-start justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-xl text-accent-soft">
                {m.symbol}
              </span>
              <span
                className={`rounded px-2 py-1 text-[10px] ${state.settings[m.key].enabled ? "bg-green/10 text-green" : "bg-surface-2 text-muted"}`}
              >
                {state.settings[m.key].enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <h2 className="mt-4 font-bold">{m.title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {m.description}
            </p>
            <p className="mt-4 text-xs font-semibold text-accent-soft">
              Configure →
            </p>
          </Link>
        ))}
      </div>
      <div className="card p-5">
        <h2 className="font-bold">Community leaderboard</h2>
        <p className="mt-2 text-sm text-muted">
          Members can use /rank in Discord and browse the public leaderboard
          when leveling is enabled.
        </p>
        <Link
          href="/discord/leaderboard"
          className="mt-4 inline-block text-sm text-accent-soft hover:underline"
        >
          Open leaderboard →
        </Link>
      </div>
    </>
  );
}

function TicketList() {
  const [data, setData] = useState<{
    tickets: TicketSummary[];
    total: number;
  }>();
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    botApi<{ tickets: TicketSummary[]; total: number }>(`tickets?page=${page}`)
      .then((v) => {
        if (alive) setData(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [page]);
  return (
    <section className="card p-5">
      <h2 className="font-bold">Server tickets</h2>
      {error && <p className="mt-3 text-sm text-rose">{error}</p>}
      <div className="mt-4 space-y-2">
        {data?.tickets.map((t) => (
          <div
            key={t.id}
            className="rounded-lg border border-border p-3 text-xs"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <strong>
                #{t.id} · {t.panel_id}
              </strong>
              <span
                className={t.status === "open" ? "text-green" : "text-muted"}
              >
                {t.status}
              </span>
            </div>
            <p className="mt-1 break-all text-muted">
              Owner: {t.owner_id}
              {t.claimed_by ? ` · Claimed by ${t.claimed_by}` : ""}
            </p>
            <p className="mt-1 text-muted">Opened {dateTime(t.created_at)}</p>
            {t.expires_at && (
              <Link
                href={`/admin/bot-panel/transcript-${t.id}`}
                className="mt-2 inline-block text-accent-soft hover:underline"
              >
                View transcript · expires {dateTime(t.expires_at)}
              </Link>
            )}
          </div>
        ))}
        {data && !data.tickets.length && (
          <p className="text-xs text-muted">No tickets yet.</p>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-muted">
        <button
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
          className="rounded border border-border px-3 py-2 disabled:opacity-40"
        >
          Previous
        </button>
        <span>Page {page}</span>
        <button
          disabled={!data || page * 25 >= data.total}
          onClick={() => setPage((p) => p + 1)}
          className="rounded border border-border px-3 py-2 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </section>
  );
}
