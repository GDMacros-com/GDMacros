import Link from "next/link";
import { site } from "@/lib/site";
import { GithubIcon, GlobeIcon } from "./icons";

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-border-soft bg-nav/50">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-white">
              <GlobeIcon className="h-4 w-4" />
            </span>
            <span className="text-[14px] font-extrabold tracking-[0.06em] text-text uppercase">{site.name}</span>
          </div>
          <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">
            {site.tagline}. Macro downloads are hosted on GitHub Releases. Not affiliated
            with RobTop Games.
          </p>
        </div>

        <div className="flex flex-col gap-4 md:items-end">
          <nav aria-label="Footer navigation" className="-mx-2.5 flex flex-wrap gap-0.5 text-[13px]">
            <Link href="/" className="rounded-lg px-2.5 py-2 text-text-dim transition-colors hover:bg-surface-2 hover:text-text focus-visible:bg-surface-2">
              All macros
            </Link>
            <Link href="/install" className="rounded-lg px-2.5 py-2 text-text-dim transition-colors hover:bg-surface-2 hover:text-text focus-visible:bg-surface-2">
              How to install
            </Link>
            <Link href="/favorites" className="rounded-lg px-2.5 py-2 text-text-dim transition-colors hover:bg-surface-2 hover:text-text focus-visible:bg-surface-2">
              Favorites
            </Link>
            <Link href="/faq" className="rounded-lg px-2.5 py-2 text-text-dim transition-colors hover:bg-surface-2 hover:text-text focus-visible:bg-surface-2">
              FAQ
            </Link>
            <Link href="/guidelines" className="rounded-lg px-2.5 py-2 text-text-dim transition-colors hover:bg-surface-2 hover:text-text focus-visible:bg-surface-2">
              Guidelines
            </Link>
            <Link href="/about" className="rounded-lg px-2.5 py-2 text-text-dim transition-colors hover:bg-surface-2 hover:text-text focus-visible:bg-surface-2">
              About
            </Link>
            <Link href="/docs/api" prefetch={false} className="rounded-lg px-2.5 py-2 text-text-dim transition-colors hover:bg-surface-2 hover:text-text focus-visible:bg-surface-2">
              API documentation
            </Link>
            <a href={site.discord} target="_blank" rel="noopener noreferrer" className="rounded-lg px-2.5 py-2 text-text-dim transition-colors hover:bg-surface-2 hover:text-text focus-visible:bg-surface-2">
              Discord<span className="sr-only"> (opens in a new tab)</span>
            </a>
            <Link href="/privacy" className="rounded-lg px-2.5 py-2 text-text-dim transition-colors hover:bg-surface-2 hover:text-text focus-visible:bg-surface-2">
              Privacy
            </Link>
            <Link href="/terms" className="rounded-lg px-2.5 py-2 text-text-dim transition-colors hover:bg-surface-2 hover:text-text focus-visible:bg-surface-2">
              Terms
            </Link>
            <Link
              href="/submit"
              className="rounded-lg px-2.5 py-2 text-text-dim transition-colors hover:bg-surface-2 hover:text-text focus-visible:bg-surface-2"
            >
              Submit a macro
            </Link>
            <Link href="/support/new" className="rounded-lg px-2.5 py-2 text-text-dim transition-colors hover:bg-surface-2 hover:text-text focus-visible:bg-surface-2">
              Send a suggestion
            </Link>
          </nav>

          <a
            href={site.repo}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            title="GitHub"
            className="grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text md:-mr-2"
          >
            <GithubIcon className="h-[17px] w-[17px]" />
          </a>
        </div>
      </div>
    </footer>
  );
}
