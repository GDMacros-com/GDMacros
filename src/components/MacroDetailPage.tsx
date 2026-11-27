import FpsBadge from "@/components/FpsBadge";
import BannerAd from "@/components/BannerAd";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CopyButton from "@/components/CopyButton";
import FavoriteButton from "@/components/FavoriteButton";
import ReportBroken from "@/components/ReportBroken";
import TrackView from "@/components/TrackView";
import Thumb from "@/components/Thumb";
import VideoEmbed from "@/components/VideoEmbed";
import {
  ArrowLeftIcon,
  BotIcon,
  DownloadIcon,
  ExternalIcon,
  GamepadIcon,
} from "@/components/icons";
import {
  fileNameFromUrl,
  hostAccent,
  hostNameFromUrl,
  isPlaceholderLink,
  levelUrl,
} from "@/lib/format";
import { findAuthorByName } from "@/lib/authors";
import { legacyReleaseDownload } from "@/lib/github/legacy-tag";
import { getLevelBySlug, getNeighbours } from "@/lib/macros";
import { site } from "@/lib/site";
import { macroPath, type Level, type Macro } from "@/lib/types";

export function macroMetadata(slug: string, legacy = false): Metadata {
  const level = getLevelBySlug(slug, legacy);
  if (!level) return { title: "Macro not found" };

  const authors = [...new Set(level.macros.map((m) => m.author))].join(", ");
  const count = level.macros.length;

  const title = `${level.name} Macro (Geometry Dash${legacy ? " 2.2081" : ""})`;

  // The generated sentence leads, because it is the one carrying the search
  // terms. Any custom description is appended, not substituted, so a personal
  // note never costs the page its keywords.
  const recorders = new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format([
    ...new Set(level.macros.map((m) => m.recorder)),
  ]);
  const base = `Download ${count > 1 ? `${count} free Geometry Dash macros` : "a free Geometry Dash macro"} for ${level.name} by ${level.creator}. Recorded by ${authors} with ${recorders}.`;
  const extra = level.description?.trim();
  const description = extra ? `${base} ${extra}`.slice(0, 300) : base;

  return {
    title,
    description,
    alternates: { canonical: macroPath(level.slug, level.legacy) },
    openGraph: {
      title: `${title} | ${site.name}`,
      description,
      url: macroPath(level.slug, level.legacy),
      type: "article",
      images: level.thumbnailLargeUrl ? [level.thumbnailLargeUrl] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${site.name}`,
      description,
      images: level.thumbnailLargeUrl ? [level.thumbnailLargeUrl] : undefined,
    },
  };
}

/** One download card: "Macro 1", who recorded it, and where to get it. */
function MacroCardBlock({ macro, legacy, slug }: { macro: Macro; legacy: boolean; slug: string }) {
  const archivePath = legacy && process.env.NEXT_OUTPUT !== "export" && legacyReleaseDownload(macro.downloadLink)
    ? `/legacy/download/${slug}/${macro.position}`
    : null;
  const downloadLink = archivePath ?? macro.downloadLink;
  const accent = hostAccent(macro.downloadType);
  const unavailable = isPlaceholderLink(macro.downloadLink);
  const fileName = unavailable ? null : fileNameFromUrl(macro.downloadLink);
  const host = unavailable ? null : hostNameFromUrl(macro.downloadLink);
  const author = legacy ? null : findAuthorByName(macro.author);

  // Fixed width rather than w-full, so several cards sit side by side and wrap
  // onto a new line only when they actually run out of room.
  return (
    <div
      id={`macro-${macro.position}`}
      className="card w-[320px] max-w-full scroll-mt-24 overflow-hidden transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/40"
    >
      <div className="border-b border-border-soft px-5 pt-4 pb-3 text-center">
        <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
          Macro {macro.position}
        </p>
        <p className="mt-1 text-[16px] font-bold text-text">
          <span className="font-normal text-muted">by </span>
          {author ? (
            <Link
              href={`/author/${author.slug}`}
              translate="no"
              title={`View macros credited to ${author.name}`}
              className="notranslate text-accent-soft underline-offset-2 transition-colors hover:text-text hover:underline"
            >
              {macro.author}
            </Link>
          ) : (
            <span translate="no" className="notranslate text-accent-soft">
              {macro.author}
            </span>
          )}
        </p>
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[11.5px] font-medium text-text-dim">
          <BotIcon className="h-3.5 w-3.5 text-muted" />
          <span translate="no" className="notranslate">
            {macro.recorder}
          </span>
        </span>
        <div className="mt-2"><FpsBadge macros={[macro]} /></div>
        {macro.testedAt && <p className="mt-2 text-[11.5px] text-muted">Last tested <time dateTime={macro.testedAt}>{macro.testedAt}</time></p>}
      </div>

      {unavailable ? (
        <div className="px-5 py-4 text-center">
          <p className="text-[15px] font-bold text-muted">Not available yet</p>
          <p className="mt-1 text-[12px] text-muted">No link has been added.</p>
        </div>
      ) : (
        <>
          {/*
            Names the exact file and the third-party host it lives on before the
            click. A button that only says "DOWNLOAD" and jumps to a file locker
            is the shape Google's deceptive-download rule is written against.
          */}
          <a
            href={downloadLink}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="block px-5 pt-4 pb-3 text-center transition-colors duration-200 hover:bg-surface-2 active:scale-[0.98] active:duration-75"
          >
            <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
              Download
            </p>
            <p className="mt-1.5 flex items-center justify-center gap-2 text-[18px] font-bold text-text">
              <DownloadIcon
                className="h-[18px] w-[18px]"
                style={accent ? { color: accent } : undefined}
              />
              <span translate="no" className="notranslate">
                {macro.downloadType}
              </span>
            </p>
            {fileName && (
              <p
                translate="no"
                className="notranslate mt-1.5 truncate font-mono text-[12px] text-text-dim"
                title={fileName}
              >
                {fileName}
              </p>
            )}
            <p className="mt-1.5 flex items-center justify-center gap-1 text-[11.5px] text-muted">
              <ExternalIcon className="h-3 w-3" />
              Opens {host ?? "an external site"} in a new tab
            </p>
          </a>
          <div className="border-t border-border-soft px-5 py-2.5 text-center">
            <CopyButton value={archivePath ? new URL(archivePath, site.url).href : macro.downloadLink} />
          </div>
        </>
      )}
    </div>
  );
}

function StructuredData({ level }: { level: Level }) {
  const json = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: `${level.name} Macro (Geometry Dash)`,
    about: `Geometry Dash macro for the level ${level.name}`,
    url: `${site.url}${macroPath(level.slug, level.legacy)}`,
    genre: "Geometry Dash",
    ...(level.thumbnailUrl ? { image: level.thumbnailUrl } : {}),
    ...(level.description ? { description: level.description } : {}),
    creator: level.macros.map((m) => ({ "@type": "Person", name: m.author })),
    isBasedOn: { "@type": "CreativeWork", name: level.name, creator: { "@type": "Person", name: level.creator } },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}

export default function MacroDetailPage({ slug, legacy = false }: { slug: string; legacy?: boolean }) {
  const level = getLevelBySlug(slug, legacy);
  if (!level) notFound();

  const { prev, next } = getNeighbours(slug, legacy);
  const many = level.macros.length > 1;

  return (
    <div className="mx-auto w-full max-w-[740px] px-4 py-7 sm:px-6 sm:py-9">
      <StructuredData level={level} />
      {/* Records the visit in this browser only, for "Recently viewed". */}
      {!legacy && <TrackView slug={level.slug} /> }

      <Link
        href={legacy ? "/legacy" : "/"}
        className="group mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors duration-200 hover:text-accent-soft"
      >
        {/* The arrow leads the way back, so it moves first. */}
        <ArrowLeftIcon className="h-4 w-4 transition-transform duration-200 ease-out group-hover:-translate-x-1" />
        {legacy ? "Back to 2.2081 catalog" : "Back to catalog"}
      </Link>

      <div className="flex flex-col items-center text-center">
        {/* The level name is pinned against translation, but "Macro" is ordinary
            copy and carries the search phrase, so it is left translatable. */}
        <h1 className="text-[30px] leading-tight font-extrabold tracking-tight text-text sm:text-[38px]">
          <span translate="no" className="notranslate">
            {level.name}
          </span>{" "}
          Macro
        </h1>
        {legacy && <p className="mt-2 text-sm font-medium text-accent-soft">Geometry Dash 2.2081 archive</p>}
        <p className="mt-3">
          <span className="rounded-lg border border-green/35 bg-green/12 px-3 py-1.5 text-[13px] font-medium text-green">
            <span className="opacity-70">Level by </span>
            <span translate="no" className="notranslate">
              {level.creator}
            </span>
          </span>
        </p>
      </div>

      <div className="mt-7">
        {level.youtubeId ? (
          <VideoEmbed youtubeId={level.youtubeId} title={`${level.name} macro`} />
        ) : (
          <Thumb level={level} className="aspect-video w-full" rounded="rounded-xl" />
        )}
      </div>

      {level.description && (
        <p className="mx-auto mt-6 max-w-[600px] text-center text-[14.5px] leading-relaxed text-text-dim">
          {level.description}
        </p>
      )}

      {/* One card per macro, numbered in the order they appear in the data file. */}
      <section className="mt-8">
        {many && (
          <h2 className="mb-4 text-center text-[12px] font-semibold tracking-wider text-muted uppercase">
            {level.macros.length} macros available
          </h2>
        )}
        <div
          className={`flex flex-wrap justify-center gap-3 ${many ? "sm:gap-4" : ""}`}
        >
          {level.macros.map((macro) => (
            <MacroCardBlock key={`${macro.position}-${macro.author}`} macro={macro} legacy={legacy} slug={level.slug} />
          ))}
        </div>

        {/*
          States plainly what the file is. A macro is a list of inputs, not a
          program, and saying so is both true and the fact an automated
          "unwanted software" classifier cannot infer on its own.
        */}
        <p className="mx-auto mt-5 max-w-[540px] text-center text-[12.5px] leading-relaxed text-muted">
          Macro files are input recordings, not programs. They cannot be run on their own and
          nothing here installs software on your device. {site.name} does not host, bundle or
          distribute the mod tools themselves.
        </p>

        {/* Right after the download is where someone actually needs this. */}
        <p className="mt-3 text-center text-[13px] text-muted">
          Not sure what to do with the file?{" "}
          <Link
            href="/install"
            className="font-medium text-accent-soft underline-offset-2 hover:underline"
          >
            How to install a macro
          </Link>
        </p>
      </section>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
        <a
          href={levelUrl(level.levelId)}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-[14px] font-semibold text-white shadow-lg shadow-accent/20 transition-[background-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover active:translate-y-0 active:scale-95 active:duration-75"
        >
          <GamepadIcon className="h-[19px] w-[19px] transition-transform duration-300 ease-out group-hover:-rotate-12" />
          GD Browser
        </a>

        {!legacy && <FavoriteButton
          levelId={String(level.levelId)}
          slug={level.slug}
          name={level.name}
        />}
        {!legacy && <ReportBroken
          name={level.name}
          slug={level.slug}
        />}
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 text-[12px] text-muted">
        <span>
          Level ID <span className="font-mono text-text-dim">{level.levelId}</span>
        </span>
        <CopyButton value={String(level.levelId)} label="Copy" className="text-[12px]" />
      </div>

      {(prev || next) && (
        <nav aria-label="Level navigation" className="mt-12 grid gap-2.5 border-t border-border-soft pt-6 sm:grid-cols-2">
          {prev ? (
            <Link
              href={macroPath(prev.slug, legacy)}
              className="card level-nav-link group min-w-0 px-4 py-3"
            >
              <p className="flex items-center gap-1.5 text-[11px] tracking-wider text-muted uppercase"><span className="level-nav-arrow" aria-hidden="true">←</span>Previous</p>
              <p
                translate="no"
                className="notranslate mt-0.5 truncate text-[14px] font-semibold text-text-dim transition-colors group-hover:text-accent-soft"
              >
                {prev.name}
              </p>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              href={macroPath(next.slug, legacy)}
              className="card level-nav-link level-nav-next group min-w-0 px-4 py-3 text-right sm:col-start-2"
            >
              <p className="flex items-center justify-end gap-1.5 text-[11px] tracking-wider text-muted uppercase">Next<span className="level-nav-arrow" aria-hidden="true">→</span></p>
              <p
                translate="no"
                className="notranslate mt-0.5 truncate text-[14px] font-semibold text-text-dim transition-colors group-hover:text-accent-soft"
              >
                {next.name}
              </p>
            </Link>
          )}
        </nav>
      )}

      <BannerAd />
    </div>
  );
}
