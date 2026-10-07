import { fpsLabel } from "@/lib/fps";

export default function FpsBadge({ macros }: { macros: readonly { fps: number }[] }) {
  return <span translate="no" title="Recording frame rate"
    className="notranslate inline-flex max-w-full items-center rounded-lg border border-accent/25 bg-accent/10 px-2.5 py-1 break-all text-right font-mono text-[11px] font-semibold tabular-nums text-accent-soft sm:text-[13px]">
    {fpsLabel(macros)}
  </span>;
}
