"use client";
import { useEffect, useState } from "react";
import type { BotCase } from "@/lib/bot/types";
import { botApi, dateTime } from "./api";
import { Card, SelectField, TextField, buttonClass } from "./Fields";

export default function Cases() {
  const [target, setTarget] = useState("");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [sort, setSort] = useState("newest");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ cases: BotCase[]; total: number }>();
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<BotCase>();
  useEffect(() => {
    let alive = true;
    setData(undefined);
    setError("");
    botApi<{ cases: BotCase[]; total: number }>(
      `cases?${query}${query ? "&" : ""}page=${page}`,
    )
      .then((v) => {
        if (alive) setData(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [query, page]);
  return (
    <div className="space-y-5">
      <Card
        title="Find a case"
        description="Filter by the affected user or channel, the moderator, and action. Voided warnings remain in the permanent history."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(
              new URLSearchParams({ target, actor, action, sort }).toString(),
            );
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <TextField
            label="Affected user or channel ID"
            value={target}
            onChange={setTarget}
            maxLength={40}
          />
          <TextField
            label="Moderator user ID"
            value={actor}
            onChange={setActor}
            maxLength={40}
          />
          <TextField
            label="Action (optional)"
            value={action}
            onChange={setAction}
            placeholder="warn, ban, purge…"
            maxLength={50}
          />
          <SelectField
            label="Order"
            value={sort}
            onChange={setSort}
            options={[
              { value: "newest", label: "Newest first" },
              { value: "oldest", label: "Oldest first" },
            ]}
          />
          <button className={buttonClass}>Search cases</button>
        </form>
      </Card>
      {error && (
        <p role="alert" className="text-sm text-rose">
          {error}
        </p>
      )}
      <Card
        title={data ? `${data.total.toLocaleString()} cases` : "Loading cases…"}
      >
        <div className="space-y-2">
          {data?.cases.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected(c)}
              className="flex w-full items-start justify-between gap-4 rounded-lg border border-border bg-bg-deep p-4 text-left hover:border-accent"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  <span className="mr-2 text-accent-soft">#{c.id}</span>
                  {c.action}
                  {!!c.voided && (
                    <span className="ml-2 text-xs text-amber">Voided</span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-muted">
                  User / channel: {c.target_id} • Moderator: {c.actor_id}
                </p>
                <p className="mt-2 break-words text-sm text-text-dim">
                  {c.reason.slice(0, 140)}
                </p>
              </div>
              <time className="shrink-0 text-[10px] text-muted">
                {dateTime(c.created_at)}
              </time>
            </button>
          ))}
          {data && !data.cases.length && (
            <p className="text-sm text-muted">No cases match these filters.</p>
          )}
        </div>
        <div className="flex items-center justify-between text-xs text-muted">
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
      </Card>
      {selected && (
        <Card title={`Case #${selected.id} • ${selected.action}`}>
          <p className="whitespace-pre-wrap break-words text-sm">
            {selected.reason}
          </p>
          <dl className="space-y-3 text-xs">
            {Object.entries({
              "Affected user / channel": selected.target_id,
              Moderator: selected.actor_id,
              Created: dateTime(selected.created_at),
              ...selected.details,
            }).map(([k, v]) => (
              <div key={k} className="grid gap-1 sm:grid-cols-[160px_1fr]">
                <dt className="text-muted">{k}</dt>
                <dd className="break-all">
                  {typeof v === "object" ? JSON.stringify(v) : String(v)}
                </dd>
              </div>
            ))}
          </dl>
          <button
            className="text-sm text-muted"
            onClick={() => setSelected(undefined)}
          >
            Close details
          </button>
        </Card>
      )}
    </div>
  );
}
