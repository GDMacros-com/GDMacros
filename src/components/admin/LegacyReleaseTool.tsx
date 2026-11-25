"use client";

import { useState } from "react";
import { renameLegacyReleaseBatch } from "@/lib/actions/legacyReleases";

export default function LegacyReleaseTool() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [done, setDone] = useState(false);

  async function rename() {
    setBusy(true);
    setStatus("Renaming releases…");
    let renamed = 0;
    try {
      for (;;) {
        const result = await renameLegacyReleaseBatch();
        if ("error" in result) {
          setStatus(result.error ?? "The rename was interrupted.");
          return;
        }
        renamed += result.renamed;
        setStatus(`${renamed} renamed. ${result.remaining} remaining.`);
        if (result.remaining === 0) {
          setDone(true);
          return;
        }
      }
    } catch {
      setStatus("The rename was interrupted. Try again to resume.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      <button type="button" onClick={rename} disabled={busy || done} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        Rename legacy releases
      </button>
      <p role="status" className="mt-3 text-sm text-muted">{status}</p>
    </div>
  );
}
