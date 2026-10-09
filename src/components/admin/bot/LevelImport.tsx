"use client";
import { useState } from "react";
import { botApi } from "./api";
import { Card, SelectField, buttonClass } from "./Fields";

type Preview = {
  count: number;
  mismatches: {
    user_id: string;
    exported_level: number;
    calculated_level: number;
  }[];
  rows: {
    user_id: string;
    username: string;
    xp: number;
    messages: number;
    level: number;
  }[];
  truncated_preview: boolean;
};

export default function LevelImport({
  revision,
  dirty,
  notice,
}: {
  revision: number;
  dirty: boolean;
  notice: (s: string, error?: boolean) => void;
}) {
  const [data, setData] = useState<unknown>();
  const [preview, setPreview] = useState<Preview>();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("merge_larger");
  async function load(file?: File) {
    if (!file) return;
    setPreview(undefined);
    setData(undefined);
    setBusy(true);
    try {
      if (file.size > 2 * 1024 * 1024)
        throw new Error("The export limit is 2 MB.");
      const json = JSON.parse(await file.text());
      const result = await botApi<Preview>("import", {
        method: "POST",
        data: { export: json, revision, apply: false },
      });
      setData(json);
      setPreview(result);
      notice(
        `Preview ready: ${result.count} members. No data has been imported.`,
      );
    } catch (error) {
      notice(
        error instanceof Error
          ? error.message
          : "The export could not be read.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (
      !preview ||
      !window.confirm(
        `Import ${preview.count} members using ${mode === "merge_larger" ? "the larger XP and message totals" : "the values in this file"}? Members absent from the export keep their data. No historical level-up DMs will be sent.`,
      )
    )
      return;
    setBusy(true);
    try {
      const result = await botApi<{ imported: number }>("import", {
        method: "POST",
        data: { export: data, revision, mode, apply: true, confirmed: true },
      });
      setPreview(undefined);
      setData(undefined);
      notice(
        `Imported ${result.imported} members. Use “Sync saved rewards with members” to assign their roles.`,
      );
    } catch (error) {
      notice(
        error instanceof Error
          ? error.message
          : "The import could not be confirmed.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card
      title="Import Lurkr data"
      description="Save your XP curve first, then upload the original JSON export. The preview checks every row before anything is written."
    >
      <label className="block text-sm font-medium">
        Lurkr JSON export
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy || dirty}
          onChange={(e) => void load(e.target.files?.[0])}
          className="mt-2 block w-full rounded-lg border border-border bg-bg-deep p-3 text-xs file:mr-3 file:rounded file:border-0 file:bg-surface-3 file:px-3 file:py-2 file:text-text"
        />
      </label>
      {dirty && (
        <p className="text-xs text-amber">
          Save your settings before previewing an import.
        </p>
      )}
      {preview && (
        <>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-lg bg-accent/10 px-3 py-2">
              {preview.count} members
            </span>
            <span
              className={`rounded-lg px-3 py-2 ${preview.mismatches.length ? "bg-rose/10 text-rose" : "bg-green/10 text-green"}`}
            >
              {preview.mismatches.length
                ? "XP curve mismatch — fix the curve before importing"
                : "XP curve matches exported levels"}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-2">Member</th>
                  <th>Level</th>
                  <th>XP</th>
                  <th>Messages</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.user_id} className="border-t border-border">
                    <td className="py-2">
                      {r.username}
                      <span className="mt-1 block text-[10px] text-muted">
                        {r.user_id}
                      </span>
                    </td>
                    <td>{r.level}</td>
                    <td>{r.xp.toLocaleString()}</td>
                    <td>{r.messages.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.truncated_preview && (
            <p className="text-xs text-muted">
              Showing the first 100 members. All members in the file were
              validated.
            </p>
          )}
          <SelectField
            label="Import behavior"
            value={mode}
            onChange={setMode}
            options={[
              {
                value: "merge_larger",
                label: "Keep the larger XP and message totals (recommended)",
              },
              {
                value: "replace_imported",
                label: "Replace totals only for members in this file",
              },
            ]}
          />
          <button
            type="button"
            className={buttonClass}
            disabled={
              busy || dirty || !preview.count || !!preview.mismatches.length
            }
            onClick={() => void apply()}
          >
            {busy ? "Importing…" : "Confirm and import"}
          </button>
        </>
      )}
    </Card>
  );
}
