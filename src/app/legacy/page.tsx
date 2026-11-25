import type { Metadata } from "next";
import Link from "next/link";
import MacroBrowser from "@/components/MacroBrowser";
import { getAllLevels } from "@/lib/macros";

export const metadata: Metadata = {
  title: "Geometry Dash 2.2081 Macro Archive",
  description: "Browse the archived Geometry Dash 2.2081 macros.",
  alternates: { canonical: "/legacy" },
};

export default function LegacyCatalogPage() {
  return (
    <div className="mx-auto w-full max-w-[940px] px-4 py-7 sm:px-6 sm:py-9">
      <h1 className="text-[26px] font-extrabold tracking-tight text-text">Geometry Dash 2.2081 Macros</h1>
      <p className="mt-2 mb-6 text-sm leading-relaxed text-muted">
        These recordings are archived for Geometry Dash 2.2081. Switch to the{" "}
        <Link href="/" className="font-medium text-accent-soft hover:underline">2.2091 catalog</Link>{" "}
        for new uploads.
      </p>
      <MacroBrowser levels={getAllLevels(true)} legacy />
    </div>
  );
}
