"use client";

import { useState } from "react";
import { DiscordIcon } from "@/components/icons";
import { site } from "@/lib/site";

export default function DiscordCommunity() {
  const [loaded, setLoaded] = useState(false);
  return (
    <section aria-labelledby="discord-community-title" className="card mt-12 overflow-hidden border-[#5865f2]/30 p-5 sm:p-6">
      <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        <div>
          <DiscordIcon className="h-9 w-9 text-[#5865f2]" />
          <h2 id="discord-community-title" className="mt-4 text-2xl font-bold tracking-tight text-text">Join our community</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-text-dim">Come hang out with the GDM Community!</p>
          <p className="mt-3 text-sm leading-relaxed text-muted">Macro requests and website support stay here on GDMacros.</p>
          <a href={site.discord} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#5865f2] px-4 py-3 text-sm font-semibold text-white hover:bg-[#4752c4]">
            Join the Discord<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface-2">
          {loaded ? (
            <iframe title="GDM Community Discord server" src={site.discordWidget} width="350" height="500"
              className="block h-[500px] w-full border-0" sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts" referrerPolicy="no-referrer" />
          ) : (
            <div className="flex min-h-[300px] flex-col items-center justify-center p-6 text-center">
              <DiscordIcon className="h-12 w-12 text-[#5865f2]" />
              <p className="mt-4 text-sm text-text-dim">Take a look inside the server.</p>
              <button type="button" onClick={() => setLoaded(true)} className="mt-4 min-h-11 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-text hover:border-[#5865f2]">Load Discord widget</button>
              <p className="mt-3 text-xs leading-relaxed text-muted">Loading the widget connects your browser to Discord.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
