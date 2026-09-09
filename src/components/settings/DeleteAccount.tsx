"use client";

import { useState, useTransition } from "react";
import { deleteOwnAccount } from "@/lib/actions/accountSettings";
import { createClient } from "@/lib/supabase/client";

export default function DeleteAccount({ username }: { username: string }) {
  const phrase = `DELETE ${username}`;
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteOwnAccount(confirmation);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      // The Auth user is gone, so this only clears the browser's local session.
      // Middleware also recognises and clears the now-invalid cookie as backup.
      const supabase = createClient();
      await supabase?.auth.signOut({ scope: "local" });
      window.location.replace("/");
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 rounded-xl border border-rose/40 px-4 py-2.5 text-[13px] font-semibold text-rose transition-[background-color,transform] hover:bg-rose/10 active:scale-95"
      >
        Delete account
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-rose/40 bg-rose/5 p-4">
      <h3 className="text-[14px] font-bold text-rose">Permanently delete this account?</h3>
      <p className="mt-2 text-[12.5px] leading-relaxed text-text-dim">
        Your login, favorites, settings, notifications, support tickets and private account history will be deleted. Published macros stay in the public catalog. This cannot be undone.
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">
        Submissions still in review must be withdrawn first. Administrator accounts cannot be deleted here.
      </p>
      <label htmlFor="delete-account-confirmation" className="mt-4 block text-[12.5px] font-semibold text-text-dim">
        Type <span translate="no" className="notranslate selectable font-mono text-text">{phrase}</span> to confirm
      </label>
      <input
        id="delete-account-confirmation"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        autoComplete="off"
        spellCheck={false}
        className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3.5 font-mono text-[13px] text-text outline-none focus:border-rose"
      />
      {error && <p role="alert" className="mt-2.5 text-[12.5px] text-rose">{error}</p>}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setConfirmation("");
            setError(null);
          }}
          disabled={pending}
          className="rounded-xl border border-border px-4 py-2.5 text-[13px] font-semibold text-text-dim hover:text-text disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={pending || confirmation !== phrase}
          className="rounded-xl bg-rose px-4 py-2.5 text-[13px] font-bold text-white transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Deleting..." : "Delete permanently"}
        </button>
      </div>
    </div>
  );
}
