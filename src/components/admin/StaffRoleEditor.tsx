"use client";

import { useId, useState } from "react";
import { updateStaffRole } from "@/lib/actions/adminUsers";
import { isStaffRole, STAFF_PERMISSIONS, STAFF_ROLE_LABELS, type StaffRole, type StaffRoleAccount } from "@/lib/staffRoles";

export default function StaffRoleEditor({
  account, ownerId, onSaved,
}: {
  account: StaffRoleAccount;
  ownerId: string;
  onSaved: (role: StaffRole | null) => void;
}) {
  const selectId = useId();
  const sliderId = useId();
  const [selected, setSelected] = useState<StaffRole | "none" | "">("");
  const [sure, setSure] = useState(false);
  const [slider, setSlider] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = account.roles.map((role) => STAFF_ROLE_LABELS[role]).join(", ") || "None";
  const role = isStaffRole(selected) ? selected : null;
  const changed = selected !== "" && (role ? account.roles.length !== 1 || account.roles[0] !== role : account.roles.length > 0);

  async function save() {
    if (!changed || !sure || slider !== 100 || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await updateStaffRole(account.user_id, account.roles, role, sure, slider);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSelected("");
      setSure(false);
      setSlider(0);
      onSaved(role);
    } catch {
      setError("The change could not be confirmed. Reload the account to check its current roles.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-border-soft p-4">
      <h3 className="text-[13.5px] font-bold text-text">Staff role for {account.username ?? account.user_id}</h3>
      <p className="mt-1 text-[12.5px] text-muted">Current roles · {current}</p>
      {account.user_id === ownerId ? (
        <p className="mt-2 text-[12.5px] text-muted">Your owner access is protected.</p>
      ) : (
        <>
          <label htmlFor={selectId} className="mt-4 block text-[12.5px] font-semibold text-text-dim">New role</label>
          <select
            id={selectId}
            value={selected}
            disabled={busy}
            onChange={(event) => {
              const next = event.target.value;
              setSelected(isStaffRole(next) || next === "none" ? next : "");
              setSure(false);
              setSlider(0);
              setError("");
            }}
            className="mt-2 h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-[13px] text-text sm:max-w-xs"
          >
            <option value="">Select a role</option>
            {Object.entries(STAFF_ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            {account.roles.length > 0 && <option value="none">Remove staff access</option>}
          </select>
          {selected && (
            <div className="mt-4 rounded-lg bg-surface-2/40 p-3">
              <p className="text-[12.5px] font-semibold text-text">{role ? `${STAFF_ROLE_LABELS[role]} permissions` : "Permissions after removal"}</p>
              <ul className="mt-2 grid gap-x-5 gap-y-1 text-[12px] sm:grid-cols-2">
                {STAFF_PERMISSIONS.map(({ label, roles }) => {
                  const allowed = role !== null && roles.includes(role);
                  return <li key={label} className={allowed ? "text-green" : "text-muted"}>{allowed ? "Yes" : "No"} · {label}</li>;
                })}
              </ul>
            </div>
          )}
          {changed && (
            <div className="mt-4 space-y-3">
              <p className="text-[12.5px] text-text-dim">
                {role ? `Set ${account.username ?? "this account"} to ${STAFF_ROLE_LABELS[role]}?` : `Remove all staff roles from ${account.username ?? "this account"}?`}
              </p>
              {!sure ? (
                <button type="button" onClick={() => setSure(true)} className="rounded-lg border border-border px-3 py-2 text-[12.5px] font-semibold text-text hover:border-accent">
                  I’m sure
                </button>
              ) : (
                <>
                  <label htmlFor={sliderId} className="block text-[12.5px] text-text-dim">Slide all the way right to confirm</label>
                  <input
                    id={sliderId}
                    type="range"
                    min={0}
                    max={100}
                    value={slider}
                    disabled={busy}
                    onChange={(event) => setSlider(event.target.valueAsNumber)}
                    onPointerDown={(event) => {
                      const { left, width } = event.currentTarget.getBoundingClientRect();
                      const thumb = left + 8 + (width - 16) * slider / 100;
                      if (Math.abs(event.clientX - thumb) > 16) event.preventDefault();
                    }}
                    className="block w-full accent-accent sm:max-w-xs"
                  />
                  <button type="button" onClick={save} disabled={busy || slider !== 100} className="rounded-lg bg-accent px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-50">
                    {busy ? "Saving…" : "Apply role change"}
                  </button>
                </>
              )}
            </div>
          )}
          {error && <p role="alert" className="mt-3 text-[12.5px] text-rose">{error}</p>}
        </>
      )}
    </section>
  );
}
