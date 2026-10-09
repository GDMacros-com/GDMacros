"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { BotState, Embed } from "@/lib/bot/types";

export const inputClass =
  "w-full rounded-lg border border-border bg-bg-deep px-3 py-2.5 text-sm text-text outline-none focus:border-accent disabled:opacity-50";
export const buttonClass =
  "rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50";

export function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-base font-bold">{title}</h2>
      {description && (
        <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
      )}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}
export function Toggle({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {help && (
          <span className="mt-1 block text-xs leading-relaxed text-muted">
            {help}
          </span>
        )}
      </span>
      <span className="relative mt-0.5 h-6 w-11 shrink-0">
        <input
          aria-label={label}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        />
        <span
          aria-hidden="true"
          className="block h-6 w-11 rounded-full border border-border bg-bg-deep transition-colors peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-muted transition-transform peer-checked:translate-x-5 peer-checked:bg-white"
        />
      </span>
    </label>
  );
}
export function TextField({
  label,
  value,
  onChange,
  multiline,
  maxLength,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  maxLength?: number;
  placeholder?: string;
  type?: string;
}) {
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-semibold text-text-dim"
      >
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          className={inputClass + " min-h-28 resize-y"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          placeholder={placeholder}
        />
      ) : (
        <input
          id={id}
          type={type}
          className={inputClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number | "any";
}) {
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-semibold text-text-dim"
      >
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) =>
          onChange(e.target.value === "" ? 0 : Number(e.target.value))
        }
        className={inputClass}
      />
    </div>
  );
}
export function ListField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const id = useId();
  const [text, setText] = useState(value.join(", "));
  const focused = useRef(false);
  const normalized = value.join(", ");
  useEffect(() => {
    if (!focused.current) setText(normalized);
  }, [normalized]);
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-semibold text-text-dim"
      >
        {label}
      </label>
      <input
        id={id}
        className={inputClass}
        value={text}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          setText(normalized);
        }}
        onChange={(e) => {
          setText(e.target.value);
          onChange(
            e.target.value
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
          );
        }}
      />
    </div>
  );
}
export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-semibold text-text-dim"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        className={inputClass}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
export function ChannelField({
  label,
  value,
  onChange,
  state,
  kind = "text",
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  state: BotState;
  kind?: string;
}) {
  const options = state.channels
    .filter((c) => c.kind === kind)
    .map((c) => ({
      value: c.id,
      label: `${kind === "text" ? "#" : ""}${c.name}${c.category ? ` · ${c.category}` : ""}`,
    }));
  if (value && !options.some((o) => o.value === value))
    options.push({ value, label: `Unavailable channel (${value})` });
  return (
    <SelectField
      label={label}
      value={value ?? ""}
      onChange={(v) => onChange(v || null)}
      options={[{ value: "", label: "Choose a channel…" }, ...options]}
    />
  );
}
export function MultiSelect({
  label,
  selected,
  options,
  onChange,
}: {
  label: string;
  selected: string[];
  options: { id: string; name: string; disabled?: boolean }[];
  onChange: (v: string[]) => void;
}) {
  const names = selected.map(
    (id) => options.find((o) => o.id === id)?.name ?? id,
  );
  return (
    <details className="rounded-lg border border-border bg-bg-deep">
      <summary className="cursor-pointer px-3 py-2.5 text-sm">
        <span className="font-medium">{label}</span>
        <span className="ml-2 text-xs text-muted">
          {names.length ? names.join(", ") : "None selected"}
        </span>
      </summary>
      <fieldset className="max-h-52 space-y-2 overflow-y-auto border-t border-border p-3">
        <legend className="sr-only">{label}</legend>
        {options.length === 0 && (
          <p className="text-xs text-muted">
            Connect the bot to load server options.
          </p>
        )}
        {options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-accent"
              checked={selected.includes(o.id)}
              disabled={o.disabled && !selected.includes(o.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, o.id]
                    : selected.filter((v) => v !== o.id),
                )
              }
            />
            <span className={o.disabled ? "text-muted" : ""}>
              {o.name}
              {o.disabled ? " (unavailable for rewards)" : ""}
            </span>
          </label>
        ))}
      </fieldset>
    </details>
  );
}
export function RoleField({
  label,
  value,
  onChange,
  state,
  rewards = false,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  state: BotState;
  rewards?: boolean;
}) {
  const options = state.roles.map((r) => ({
    id: r.id,
    name: r.name,
    disabled: rewards && !r.reward_safe,
  }));
  for (const id of value)
    if (!options.some((o) => o.id === id))
      options.push({ id, name: `Unavailable role (${id})`, disabled: true });
  return (
    <MultiSelect
      label={label}
      selected={value}
      options={options}
      onChange={onChange}
    />
  );
}
export function EmbedEditor({
  value,
  onChange,
  variables = "{user}, {username}, {server}",
}: {
  value: Embed;
  onChange: (v: Embed) => void;
  variables?: string;
}) {
  const patch = (v: Partial<Embed>) => onChange({ ...value, ...v });
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-4">
        <TextField
          label="Embed title"
          value={value.title}
          maxLength={256}
          onChange={(title) => patch({ title })}
        />
        <TextField
          label="Embed message"
          value={value.description}
          maxLength={3500}
          multiline
          onChange={(description) => patch({ description })}
        />
        <p className="text-xs text-muted">
          Available variables: {variables}. Discord markdown is supported.
        </p>
        <div className="grid grid-cols-[80px_1fr] gap-3">
          <TextField
            label="Color"
            type="color"
            value={value.color}
            onChange={(color) => patch({ color })}
          />
          <TextField
            label="Footer"
            value={value.footer}
            maxLength={256}
            onChange={(footer) => patch({ footer })}
          />
        </div>
        <TextField
          label="Image URL (optional)"
          value={value.image}
          maxLength={500}
          placeholder="https://…"
          onChange={(image) => patch({ image })}
        />
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          Live preview
        </p>
        <div className="rounded-xl border border-border bg-[#313338] p-4 text-[#dbdee1]">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#3b82f6] text-sm font-black text-white">
              G
            </span>
            <span className="text-sm font-semibold text-white">
              GDM Community
            </span>
            <span className="rounded bg-[#5865f2] px-1 text-[10px] text-white">
              APP
            </span>
          </div>
          <div
            className="overflow-hidden rounded-md border-l-4 bg-[#2b2d31] p-4"
            style={{
              borderLeftColor: /^#[a-f0-9]{6}$/i.test(value.color)
                ? value.color
                : "#3b82f6",
            }}
          >
            <p className="break-words text-sm font-bold text-white">
              {value.title || "Untitled embed"}
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed">
              {value.description || "Your message will appear here."}
            </p>
            {value.image && (
              <p className="mt-3 rounded border border-white/10 p-3 text-xs text-[#b5bac1]">
                Image attached • loaded by Discord when sent
              </p>
            )}
            <p className="mt-4 break-words text-[10px] text-[#b5bac1]">
              {value.footer}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
