"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Transcript } from "@/lib/bot/types";
import { botApi, dateTime } from "./api";

function attachmentUrl(value: string): string | null {
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      ["cdn.discordapp.com", "media.discordapp.net"].includes(u.hostname) &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}

export default function TranscriptView({ number }: { number: number }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Transcript>();
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setData(undefined);
    setError("");
    botApi<Transcript>(`transcripts/${number}?page=${page}`)
      .then((v) => {
        if (alive) setData(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [number, page]);
  return (
    <div className="mx-auto max-w-[920px] px-4 py-10 sm:px-6">
      <Link
        href="/admin/bot-panel/tickets"
        className="text-xs text-muted hover:text-text"
      >
        ← Ticket dashboard
      </Link>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Ticket #{number} transcript</h1>
        <span className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs text-accent-soft">
          Website admins only
        </span>
      </div>
      {error && (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-rose/30 bg-rose/10 p-4 text-sm"
        >
          {error}
        </p>
      )}
      {!data && !error && (
        <p className="mt-6 text-sm text-muted">Loading transcript…</p>
      )}
      {data && (
        <>
          <div className="my-6 rounded-xl border border-border bg-surface p-4 text-xs leading-relaxed text-muted">
            <p>
              Panel: {data.panel_id} • Owner: {data.owner_id}
            </p>
            <p>
              Closed: {dateTime(data.closed_at)} • Expires:{" "}
              {dateTime(data.expires_at)}
            </p>
            <p className="mt-2">
              {data.total_messages.toLocaleString()} messages. Attachment links
              are served by Discord and may expire sooner. Message text is
              displayed as plain text.
            </p>
          </div>
          <div className="space-y-3">
            {data.messages.map((m) => (
              <article key={m.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <strong className="break-all text-sm">{m.author}</strong>
                  <span className="text-[10px] text-muted">{m.author_id}</span>
                  <time className="text-[10px] text-muted">
                    {new Date(m.created_at).toLocaleString()}
                    {m.edited_at ? " • edited" : ""}
                  </time>
                </div>
                {m.content && (
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {m.content}
                  </p>
                )}
                {m.embeds.map((e, i) => (
                  <div
                    key={i}
                    className="mt-3 rounded-lg border-l-2 border-accent bg-bg-deep p-3 text-xs"
                  >
                    <p className="font-semibold">{e.title}</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-text-dim">
                      {e.description}
                    </p>
                    {e.fields?.map((f, j) => (
                      <div key={j} className="mt-2">
                        <strong>{f.name}</strong>
                        <p className="whitespace-pre-wrap break-words">
                          {f.value}
                        </p>
                      </div>
                    ))}
                  </div>
                ))}
                {m.attachments.map((a, i) => {
                  const href = attachmentUrl(a.url);
                  return (
                    <div key={i} className="mt-3 text-xs">
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          referrerPolicy="no-referrer"
                          className="break-all text-accent-soft hover:underline"
                        >
                          ↗ {a.name}
                        </a>
                      ) : (
                        <span>{a.name} (link unavailable)</span>
                      )}
                      <span className="ml-2 text-muted">
                        {Math.ceil(a.size / 1024)} KB
                      </span>
                    </div>
                  );
                })}
              </article>
            ))}
          </div>
          <div className="mt-6 flex items-center justify-between text-xs">
            <button
              disabled={page === 1}
              className="rounded border border-border px-4 py-2 disabled:opacity-40"
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span className="text-muted">
              Page {page} of {Math.max(1, Math.ceil(data.total_messages / 100))}
            </span>
            <button
              disabled={page * 100 >= data.total_messages}
              className="rounded border border-border px-4 py-2 disabled:opacity-40"
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
