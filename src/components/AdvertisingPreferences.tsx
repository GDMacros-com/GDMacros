"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { CHANGED, notifyChanged, STORE_KEYS } from "@/lib/localStore";
import { ShieldIcon, XIcon } from "./icons";

type Choice = "allowed" | "declined";
const choiceKey = STORE_KEYS.advertising;
let temporaryChoice: Choice | null = null;

function getChoice() {
  const { hostname } = window.location;
  const vercelEnvironment = process.env.NEXT_PUBLIC_VERCEL_ENV;
  const isVercelPreview = vercelEnvironment === "preview" || (!vercelEnvironment && hostname.endsWith(".vercel.app"));
  if (!isVercelPreview && process.env.NEXT_PUBLIC_BANNER_AD_PREVIEW !== "1") return "unavailable";

  if (temporaryChoice) return temporaryChoice;
  try {
    const saved = window.localStorage.getItem(choiceKey);
    return saved === "allowed" || saved === "declined" ? saved : null;
  } catch {
    return null;
  }
}

function subscribe(update: () => void) {
  window.addEventListener(CHANGED, update);
  window.addEventListener("storage", update);
  return () => {
    window.removeEventListener(CHANGED, update);
    window.removeEventListener("storage", update);
  };
}

function saveChoice(choice: Choice) {
  try {
    window.localStorage.setItem(choiceKey, choice);
    temporaryChoice = null;
  } catch {
    temporaryChoice = choice;
  }
  notifyChanged(choiceKey);
}

export function useAdvertisingChoice() {
  return useSyncExternalStore(subscribe, getChoice, () => "unavailable" as const);
}

const choiceButton = "min-h-10 rounded-lg border border-accent/55 bg-surface px-3 py-2 text-[13px] font-semibold text-text transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const consentButton = "min-h-14 rounded-xl border border-accent/55 bg-accent/10 px-3 py-3 text-[15px] font-bold text-text transition-colors hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function AdvertisingConsentPopup({ children }: { children: ReactNode }) {
  const choice = useAdvertisingChoice();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [showDeclineNotice, setShowDeclineNotice] = useState(false);
  const needsChoice = choice === null && pathname !== "/privacy";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!needsChoice || !dialog) return;

    dialog.showModal();
    return () => dialog.close();
  }, [needsChoice]);

  function decline() {
    setShowDeclineNotice(true);
    saveChoice("declined");
  }

  if (!needsChoice) {
    if (pathname === "/privacy" || choice !== "declined" || !showDeclineNotice) return children;

    return (
      <aside className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 ml-auto flex max-w-[380px] items-start gap-3 rounded-xl border border-border bg-surface p-4 text-text shadow-xl sm:right-5 sm:bottom-5">
        <div role="status" className="min-w-0 flex-1">
          <p className="text-sm font-bold">You’re browsing without ads</p>
          <p className="mt-1 text-[13px] leading-relaxed text-text-dim">
            Ads help cover the cost of running GDMacros and keeping downloads free. You can change
            your choice any time in <Link href="/privacy#advertising" className="text-accent-soft underline">Ad preferences</Link>.
          </p>
        </div>
        <button
          type="button"
          aria-label="Dismiss advertising notice"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
          onClick={() => setShowDeclineNotice(false)}
        >
          <XIcon className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="advertising-consent-title"
      aria-describedby="advertising-consent-description"
      onCancel={(event) => { event.preventDefault(); decline(); }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[560px] overflow-y-auto rounded-3xl border border-border border-t-2 border-t-accent bg-surface p-6 text-text shadow-2xl backdrop:bg-black/65 sm:p-9"
    >
      <div className="flex items-center gap-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent-soft">
          <ShieldIcon className="h-6 w-6" />
        </span>
        <h2 id="advertising-consent-title" className="text-xl font-extrabold leading-tight sm:text-2xl">
          Allow third-party cookies?
        </h2>
      </div>
      <p id="advertising-consent-description" className="mt-5 text-sm leading-relaxed text-text-dim sm:text-base">
        Adsterra may use cookies or similar technologies to show and measure ads. The ads help cover
        the cost of running GDMacros. <Link className="text-accent-soft underline underline-offset-2" href="/privacy#advertising">Read more</Link>
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button type="button" className={consentButton} onClick={() => saveChoice("allowed")}>Allow ads</button>
        <button type="button" className={consentButton} onClick={decline}>Decline ads</button>
      </div>
    </dialog>
  );
}

export default function AdvertisingPreferences() {
  const choice = useAdvertisingChoice();
  if (choice === "unavailable") return null;

  return (
    <div aria-label="Advertising preferences" className="space-y-2">
      <p role="status">{choice === "allowed" ? "Advertising is allowed." : "Advertising is off."}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={choiceButton} onClick={() => saveChoice("declined")}>
          Decline ads
        </button>
        <button type="button" className={choiceButton} onClick={() => saveChoice("allowed")}>
          Allow ads
        </button>
      </div>
    </div>
  );
}
