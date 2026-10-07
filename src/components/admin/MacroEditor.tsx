"use client";

import { useEffect, useState } from "react";
import { editorFields, validateEditor, type EditorFields } from "@/lib/catalog-editor";
import { RECORDERS, type LevelInput } from "@/lib/types";

type Snapshot = { sha: string; levels: LevelInput[] };
const inputClass = "mt-1 w-full min-w-0 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text";
const buttonClass = "rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50";
const labels: Record<keyof EditorFields, string> = {
  name:"Level name", creator:"Level creator", levelId:"Level ID", slug:"Page URL slug",
  description:"Level description", video:"YouTube video", thumbnail:"Thumbnail URL (optional)",
  addedAt:"Level added date", author:"Macro author", recorder:"Recorder", fps:"Recording FPS",
  downloadType:"Download host", downloadLink:"Download URL", testedAt:"Last tested date",
};
const levelKeys = ["name", "creator", "levelId", "slug", "description", "video", "thumbnail", "addedAt"] as const;
const macroKeys = ["author", "recorder", "fps", "downloadType", "downloadLink", "testedAt"] as const;

export default function MacroEditor() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [fields, setFields] = useState<EditorFields | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<"save" | "remove" | null>(null);

  async function load(keepMessage = false) {
    setBusy(true);
    if (!keepMessage) setMessage("");
    try {
      const response = await fetch("/api/admin/macros", { cache:"no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setSnapshot(body); setSelected(null); setFields(null); setFile(null); setConfirm(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load the catalog."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);

  function choose(li: number, mi: number) {
    if (!snapshot || busy) return;
    if (fields && selected) {
      const original = editorFields(snapshot.levels[selected[0]], snapshot.levels[selected[0]].macros![selected[1]]);
      if ((file || JSON.stringify(fields) !== JSON.stringify(original)) && !window.confirm("Discard your unsaved changes?")) return;
    }
    setSelected([li, mi]); setFields(editorFields(snapshot.levels[li], snapshot.levels[li].macros![mi]));
    setFile(null); setConfirm(null); setMessage("");
  }
  function review(operation: "save" | "remove") {
    if (!fields || !snapshot || !selected) return;
    const error = operation === "save" ? validateEditor(fields, snapshot.levels[selected[0]].thumbnail) : null;
    if (error) { setMessage(error); return; }
    setMessage(""); setConfirm(operation);
  }
  async function save() {
    if (!snapshot || !selected || !fields || !confirm || busy) return;
    setBusy(true); setMessage("");
    const form = new FormData();
    form.set("sha", snapshot.sha); form.set("levelIndex", String(selected[0])); form.set("macroIndex", String(selected[1]));
    form.set("operation", confirm); form.set("confirmed", "yes"); form.set("fields", JSON.stringify(fields));
    if (file && confirm === "save") form.set("file", file);
    try {
      const response = await fetch("/api/admin/macros", { method:"POST", body:form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage(body.unchanged ? "Nothing changed." : `Saved. The public site updates after deployment. Commit ${body.commitSha.slice(0, 7)}.`);
      await load(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save. Reload before retrying."); }
    finally { setBusy(false); setConfirm(null); }
  }
  const selectedLevel = selected && snapshot ? snapshot.levels[selected[0]] : null;
  const original = selectedLevel && selected ? editorFields(selectedLevel, selectedLevel.macros![selected[1]]) : null;
  function field(key: keyof EditorFields) {
    if (!fields) return null;
    const change = (value: string) => { setFields({ ...fields, [key]:value }); setConfirm(null); };
    return <label key={key} className={`block text-sm text-text-dim ${["description", "downloadLink", "video", "thumbnail"].includes(key) ? "sm:col-span-2" : ""}`}>
      {labels[key]}
      {key === "description" ? <textarea className={inputClass} rows={3} value={fields[key]} onChange={e => change(e.target.value)} />
        : key === "recorder" ? <select className={inputClass} value={fields[key]} onChange={e => change(e.target.value)}>{RECORDERS.map(r => <option key={r}>{r}</option>)}</select>
        : <input className={inputClass} type={key.endsWith("At") ? "date" : key === "fps" ? "number" : "text"} step={key === "fps" ? "any" : undefined}
          max={key.endsWith("At") ? new Date().toISOString().slice(0,10) : undefined} value={fields[key]} onChange={e => change(e.target.value)} />}
    </label>;
  }
  return <div className="mt-6 space-y-5">
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-0 flex-1 text-sm">Find a macro<input className={inputClass} placeholder="Level, author, recorder or level ID" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <button className={buttonClass} disabled={busy} onClick={() => {
        if (!fields || window.confirm("Reload the catalog and discard any unsaved edits?")) void load();
      }}>Reload catalog</button>
    </div>
    <p aria-live="polite" role="status" className="break-words text-sm text-accent-soft">{busy ? "Working… " : ""}{message}</p>
    {snapshot && <div className="max-h-64 overflow-y-auto rounded-xl border border-border" aria-label="Published macros">
      {snapshot.levels.flatMap((level, li) => (level.macros || []).map((macro, mi) => ({ level, macro, li, mi })))
        .filter(({level, macro}) => `${level.name} ${level.levelId} ${macro.author} ${macro.recorder}`.toLowerCase().includes(query.toLowerCase()))
        .map(({level, macro, li, mi}) => <button key={`${li}-${mi}`} disabled={busy} onClick={() => choose(li,mi)}
          aria-pressed={selected?.[0] === li && selected?.[1] === mi}
          className="block w-full border-b border-border-soft p-3 text-left text-sm hover:bg-surface-2 aria-pressed:bg-surface-2">
          <span className="font-semibold">{level.name}</span> <span className="text-muted">— {macro.author} · {macro.recorder} · {macro.fps} FPS</span>
        </button>)}
    </div>}
    {fields && selectedLevel && <fieldset disabled={busy} className="space-y-6">
      <section className="card p-4 sm:p-5"><h2 className="font-bold">Level details</h2>
        <p className="mt-1 text-sm text-muted">These fields affect all {selectedLevel.macros!.length} macros on this level. Changing the page URL breaks old links; keep it unless correcting a mistake.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">{levelKeys.map(field)}</div>
      </section>
      <section className="card p-4 sm:p-5"><h2 className="font-bold">This macro</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">{macroKeys.map(field)}</div>
        <p className="mt-2 text-xs text-muted">Only set the tested date for a completed playback check. Leave it blank if unknown. Replacing a file does not change this date automatically.</p>
        <label className="mt-4 block text-sm">Replace macro file (optional)
          <input key={selected?.join("-")} className={`${inputClass} overflow-hidden`} type="file" accept={fields.recorder === "zBot" ? ".gdr" : ".gdr2"}
            onChange={e => { setFile(e.target.files?.[0] || null); setConfirm(null); }} />
        </label>
        <p className="mt-2 text-xs text-muted">Up to 2 MB. A replacement supplies a new GitHub download URL. Old files remain available at their existing URLs.</p>
      </section>
      {!confirm ? <div className="flex flex-wrap gap-3">
        <button className={`${buttonClass} bg-accent text-white`} onClick={() => review("save")}>Review changes</button>
        <button className={`${buttonClass} text-red-400`} onClick={() => review("remove")}>Remove from catalog</button>
      </div> : <section className="card space-y-3 p-5" aria-label="Confirm catalog change">
        <h2 className="font-bold">{confirm === "remove" ? "Remove this macro?" : "Confirm changes"}</h2>
        {confirm === "remove" ? <p className="text-sm">Remove {original?.author}&apos;s {original?.recorder} macro from {selectedLevel.name}. {selectedLevel.macros!.length === 1 && "This is the last macro, so its level page will also be removed."} The original download file and Git history remain public.</p>
          : <><dl className="space-y-2 text-sm">{original && (Object.keys(labels) as (keyof EditorFields)[]).filter(k => fields[k] !== original[k]).map(k => <div key={k} className="break-words"><dt className="font-semibold">{labels[k]}</dt><dd><span className="text-muted">{original[k] || "(blank)"}</span> → {fields[k] || "(blank)"}</dd></div>)}</dl>
            {file && <p className="break-all text-sm">Replacement: {file.name} ({file.size.toLocaleString()} bytes). Its GitHub URL replaces the download fields above.</p>}</>}
        <p className="text-xs text-muted">This saves a catalog change and starts a site deployment. It can take a few minutes to appear publicly.</p>
        <div className="flex gap-3"><button className={`${buttonClass} bg-accent text-white`} onClick={() => void save()}>{confirm === "remove" ? "Confirm removal" : "Save changes"}</button>
          <button className={buttonClass} onClick={() => setConfirm(null)}>Cancel</button></div>
      </section>}
    </fieldset>}
  </div>;
}
