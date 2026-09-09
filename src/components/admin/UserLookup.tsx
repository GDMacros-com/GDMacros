"use client";

import { useState, useTransition } from "react";
import CopyButton from "@/components/CopyButton";
import { lookupAdminUser, type AdminUserView } from "@/lib/actions/adminUsers";
import { banSubmissionEmail, unbanSubmissionEmail } from "@/lib/actions/submissions";
import { unbanSupportTicketUser } from "@/lib/actions/supportTickets";

function date(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border-soft bg-surface-2/40 px-3.5 py-3">
      <p className="text-[11.5px] font-semibold tracking-wide text-muted uppercase">{label}</p>
      <div className="mt-1.5 text-[13.5px] font-semibold text-text">{value}</div>
    </div>
  );
}

export default function UserLookup() {
  const [username, setUsername] = useState("");
  const [account, setAccount] = useState<AdminUserView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banReason, setBanReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function load(name = username) {
    setError(null);
    setBusy("lookup");
    const result = await lookupAdminUser(name);
    setBusy(null);
    if (!result.ok) {
      setAccount(null);
      setError(result.error);
      return;
    }
    setAccount(result.account);
    setUsername(result.account.username);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(() => load());
  }

  function updateSubmissionBan(block: boolean) {
    if (!account) return;
    setError(null);
    setBusy("submission-ban");
    startTransition(async () => {
      const result = block
        ? await banSubmissionEmail(account.email, banReason)
        : await unbanSubmissionEmail(account.email);
      if (!result.ok) setError(result.error);
      else {
        setBanReason("");
        await load(account.username);
      }
      setBusy(null);
    });
  }

  function removeSupportBan() {
    if (!account?.supportBan) return;
    setError(null);
    setBusy("support-ban");
    startTransition(async () => {
      const result = await unbanSupportTicketUser(account.supportBan!.id);
      if (!result.ok) setError(result.error);
      else await load(account.username);
      setBusy(null);
    });
  }

  return (
    <>
      <form onSubmit={submit} className="card mt-6 p-4 sm:p-5">
        <label htmlFor="account-username" className="text-[12.5px] font-semibold text-text-dim">
          Exact username
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="account-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            minLength={3}
            maxLength={20}
            autoComplete="off"
            spellCheck={false}
            placeholder="ToastGD"
            className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3.5 text-[13.5px] text-text outline-none placeholder:text-muted focus:border-accent"
          />
          <button
            type="submit"
            disabled={busy !== null || username.trim().length < 3}
            className="h-11 rounded-xl bg-accent px-5 text-[13.5px] font-bold text-white transition-[background-color,transform] hover:bg-accent-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "lookup" ? "Looking up..." : "Look up account"}
          </button>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          This is an exact lookup, not an account directory. The email is shown only on this admin page.
        </p>
      </form>

      {error && <p role="alert" className="mt-3 rounded-xl border border-rose/30 bg-rose/10 px-4 py-3 text-[12.5px] text-rose">{error}</p>}

      {account && (
        <section className="card mt-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-soft pb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 translate="no" className="notranslate text-[19px] font-extrabold text-text">{account.username}</h2>
                {account.isAdmin && <span className="rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10.5px] font-bold text-accent-soft">ADMIN</span>}
              </div>
              <p className="mt-1 selectable text-[13px] text-text-dim">{account.email}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <CopyButton value={account.email} label="Copy email" />
              <CopyButton value={account.id} label="Copy user ID" />
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="Email verified" value={account.emailConfirmedAt ? `Yes · ${date(account.emailConfirmedAt)}` : <span className="text-amber">No</span>} />
            <Stat label="Joined" value={date(account.createdAt)} />
            <Stat label="Last sign-in" value={date(account.lastSignInAt)} />
            <Stat label="Submissions in review" value={account.pendingSubmissions} />
            <Stat label="Published by account" value={account.publishedSubmissions} />
            <Stat label="Support tickets" value={`${account.openSupportTickets} open · ${account.supportTickets} total`} />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border-soft p-4">
              <h3 className="text-[13.5px] font-bold text-text">Macro submissions</h3>
              {account.submissionBan ? (
                <>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-rose">Blocked: {account.submissionBan.reason}</p>
                  <p className="mt-1 text-[11.5px] text-muted">Since {date(account.submissionBan.createdAt)}</p>
                  <button type="button" onClick={() => updateSubmissionBan(false)} disabled={busy !== null} className="mt-3 text-[12.5px] font-semibold text-accent-soft hover:underline disabled:opacity-60">
                    {busy === "submission-ban" ? "Removing..." : "Allow submissions"}
                  </button>
                </>
              ) : account.isAdmin ? (
                <p className="mt-1.5 text-[12.5px] text-muted">Allowed. Admin accounts cannot be blocked.</p>
              ) : (
                <>
                  <p className="mt-1.5 text-[12.5px] text-green">Allowed</p>
                  <input value={banReason} onChange={(event) => setBanReason(event.target.value)} maxLength={500} placeholder="Private reason" className="mt-3 h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-[12.5px] text-text outline-none placeholder:text-muted focus:border-accent" />
                  <button type="button" onClick={() => updateSubmissionBan(true)} disabled={busy !== null || banReason.trim().length < 3} className="mt-2 text-[12.5px] font-semibold text-rose hover:underline disabled:opacity-50">
                    {busy === "submission-ban" ? "Saving..." : "Block submissions"}
                  </button>
                </>
              )}
            </div>

            <div className="rounded-xl border border-border-soft p-4">
              <h3 className="text-[13.5px] font-bold text-text">New support tickets</h3>
              {account.supportBan ? (
                <>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-rose">Blocked: {account.supportBan.reason}</p>
                  <p className="mt-1 text-[11.5px] text-muted">Since {date(account.supportBan.createdAt)}</p>
                  <button type="button" onClick={removeSupportBan} disabled={busy !== null} className="mt-3 text-[12.5px] font-semibold text-accent-soft hover:underline disabled:opacity-60">
                    {busy === "support-ban" ? "Removing..." : "Allow new tickets"}
                  </button>
                </>
              ) : (
                <>
                  <p className="mt-1.5 text-[12.5px] text-green">Allowed</p>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-muted">A support block is applied from one of the person&apos;s tickets, so the moderation reason stays attached to context.</p>
                </>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
