"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { DiscordIcon } from "@/components/icons";
import { site } from "@/lib/site";

const SEEN_KEY = "gdmacros:discord-announcement:2026-10";
let shownThisVisit = false;

export default function DiscordAnnouncement() {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const restoreScroll = useRef<(() => void) | null>(null);

  function dismiss() {
    dialogRef.current?.close();
    restoreScroll.current?.();
    restoreScroll.current = null;
  }

  useEffect(() => {
    // Keep sign-in, account management and support flows uninterrupted.
    const publicPage = ["/", "/about", "/install", "/faq", "/guidelines", "/favorites"].includes(pathname)
      || pathname.startsWith("/macro/");
    if (!publicPage || shownThisVisit) return;
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
    } catch { /* Still show once this visit when storage is unavailable. */ }

    const timer = window.setTimeout(() => {
      const dialog = dialogRef.current;
      if (!dialog || shownThisVisit) return;
      // Another tab may have displayed it during the delay.
      try { if (localStorage.getItem(SEEN_KEY)) return; } catch {}
      dialog.showModal();
      shownThisVisit = true;
      try { localStorage.setItem(SEEN_KEY, "1"); } catch {}
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      restoreScroll.current = () => { document.body.style.overflow = previousOverflow; };
    }, 700);

    return () => {
      window.clearTimeout(timer);
      dialogRef.current?.close();
      restoreScroll.current?.();
      restoreScroll.current = null;
    };
  }, [pathname]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="discord-announcement-title"
      aria-describedby="discord-announcement-description"
      onCancel={(event) => { event.preventDefault(); dismiss(); }}
      onClose={() => { restoreScroll.current?.(); restoreScroll.current = null; }}
      className="discord-announcement m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[460px] overflow-y-auto rounded-3xl border border-[#5865f2]/50 bg-surface p-0 text-text shadow-2xl"
    >
      <div className="relative p-7 text-center sm:p-10">
        <button type="button" onClick={dismiss} aria-label="Close Discord announcement" autoFocus
          className="absolute top-3 right-3 grid h-10 w-10 place-items-center rounded-full text-2xl text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5865f2]">
          <span aria-hidden="true">×</span>
        </button>
        <div className="mx-auto mt-3 grid h-20 w-20 place-items-center rounded-3xl bg-[#5865f2] text-white shadow-lg shadow-[#5865f2]/25">
          <DiscordIcon className="h-11 w-11" />
        </div>
        <p className="mt-6 text-xs font-bold tracking-[0.18em] text-accent-soft uppercase">You’re invited</p>
        <h2 id="discord-announcement-title" className="mt-3 text-3xl font-extrabold leading-tight tracking-tight">We’ve made a Discord server!</h2>
        <p id="discord-announcement-description" className="mt-4 text-lg leading-relaxed text-text-dim">Come hang out with the GDM Community!</p>
        <a href={site.discord} target="_blank" rel="noopener noreferrer" onClick={dismiss}
          className="mt-7 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#5865f2] px-5 py-3 font-bold text-white transition-colors hover:bg-[#4752c4] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5865f2]">
          <DiscordIcon className="h-5 w-5" /> Join the Discord<span className="sr-only"> (opens in a new tab)</span>
        </a>
        <button type="button" onClick={dismiss} className="mt-3 min-h-11 w-full rounded-xl px-4 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5865f2]">Maybe later</button>
      </div>
    </dialog>
  );
}
