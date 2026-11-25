import type { Metadata } from "next";
import Link from "next/link";
import AnimatedHeading from "@/components/AnimatedHeading";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "How to Install Geometry Dash Macros",
  description:
    "Step-by-step guide to installing and playing Geometry Dash macros with Silicate, Eclipse, zBot or Mega Hack.",
  alternates: { canonical: "/install" },
  openGraph: {
    title: `How to Install Geometry Dash Macros | ${site.name}`,
    description:
      "Step-by-step guide to installing and playing Geometry Dash macros with Silicate, Eclipse, zBot or Mega Hack.",
    url: "/install",
    type: "article",
  },
};

const MEGA_HACK_STORE = "https://absolllute.com/store/mega-hack";
const ZBOT_STORE = "https://zbot.figmentcoding.me/";
const ZBOT_PAGE = "https://geode-sdk.org/mods/fig.zbot";

/** Numbered step in one of the walkthroughs. */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-bold text-white tabular-nums">
        {n}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[14.5px] font-semibold text-text">{title}</p>
        <div className="mt-1 text-[14px] leading-relaxed text-text-dim">{children}</div>
      </div>
    </li>
  );
}

/** Outbound link. nofollow because we do not vouch for third-party hosts. */
function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="font-medium text-accent-soft underline-offset-2 hover:underline"
    >
      {children}
    </a>
  );
}

/**
 * Structured data so this can win the "how to install geometry dash macros"
 * style queries, which are lower competition than the catalog's own terms.
 */
const howToJsonLd = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to install Geometry Dash macros",
  description:
    "Choose a compatible replay tool, install and activate it, then download and play a matching macro from the beginning.",
  step: [
    { "@type": "HowToStep", name: "Install Geode", text: "Install the Geode mod loader for Geometry Dash." },
    { "@type": "HowToStep", name: "Get a macro bot", text: "Choose Silicate, Eclipse, zBot with a paid import key, or Mega Hack." },
    { "@type": "HowToStep", name: "Install the mod", text: "Follow your tool’s installer; manual Geode packages go in geode/mods." },
    { "@type": "HowToStep", name: "Download a macro", text: "Download the macro file for the level you want." },
    { "@type": "HowToStep", name: "Load the macro", text: "Import the matching file, select playback and restart the level from the beginning." },
  ],
};

export default function InstallPage() {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-10 sm:px-6 sm:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }}
      />

      <AnimatedHeading
        text="How to Install Geometry Dash Macros"
        className="text-[30px] leading-tight font-extrabold tracking-tight text-text sm:text-[36px]"
      />
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        A macro is a recording of every input in a level. To play one back you need a file made for
        your playback tool. Every macro on {site.name} shows its tool on the download card, so
        check that first, then follow the matching section below.
      </p>

      {/* The free/paid split is the first thing anyone wants to know. */}
      <div className="mt-8 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <div className="flex items-center justify-between gap-2">
            <p translate="no" className="notranslate text-[16px] font-bold text-text">
              Silicate
            </p>
            <span className="rounded-md border border-green/35 bg-green/12 px-2 py-0.5 text-[11.5px] font-semibold text-green">
              Free
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-snug text-muted">
            Replay recording and playback for Windows and Linux through Wine.
          </p>
        </div>
        <div className="card p-4">
          <Link href="#eclipse" className="text-[16px] font-bold text-accent-soft hover:underline">Eclipse Menu</Link>
          <p className="mt-1.5 text-[13px] leading-snug text-muted">Free Geode mod menu with a Replay Bot.</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between gap-2">
            <p translate="no" className="notranslate text-[16px] font-bold text-text">
              zBot
            </p>
            <span className="rounded-md border border-amber/35 bg-amber/12 px-2 py-0.5 text-[11.5px] font-semibold text-amber">
              Paid imports
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-snug text-muted">
            Paid key required to import our .gdr downloads. Recording your own run is free.
          </p>
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between gap-2">
            <p translate="no" className="notranslate text-[16px] font-bold text-text">
              Mega Hack
            </p>
            <span className="rounded-md border border-amber/35 bg-amber/12 px-2 py-0.5 text-[11.5px] font-semibold text-amber">
              Paid
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-snug text-muted">
            A paid mod menu with its own replay system.
          </p>
        </div>
      </div>

      <section className="card mt-8 p-5">
        <h2 className="text-[17px] font-bold text-text">Before you start</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-text-dim">
          For Silicate, Eclipse, zBot and the Geode edition of Mega Hack, install the <Ext href="https://geode-sdk.org/install">Geode mod loader</Ext> for your device first. Launch the game and check for the Geode button on the main menu. Mega Hack also offers a standalone Windows installer. A tool must support your game version and device; installing Geode alone does not make every mod compatible.
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          Macros only work in a modded client. They will not do anything in a clean copy of the game,
          and they are not completions. Do not submit macro runs as records.
        </p>
      </section>

      <section id="silicate" className="mt-10 scroll-mt-24">
        <h2 className="text-[20px] font-bold text-text">Silicate <span className="ml-2 font-mono text-sm text-muted">.slc</span></h2>
        <ol className="mt-5 space-y-4">
          <Step n={1} title="Get the 2.2091 build">
            Follow the developer’s download link on the <Ext href="https://silicate.dev/">official Silicate site</Ext> for Geometry Dash 2.2091. Silicate supports Windows and Linux through Wine.
          </Step>
          <Step n={2} title="Install Silicate">
            With Geode installed, open its Settings in Geometry Dash and choose Install from File. Select the Silicate <code>.geode</code> package and restart the game.
          </Step>
          <Step n={3} title="Record or play a replay">
            Open Silicate and use its replay controls to record and save your run. To play a download, put the <code>.slc</code> file in Silicate’s replays folder, select it in the replay menu and start the level from the beginning.
          </Step>
        </ol>
      </section>

      <section id="eclipse" className="mt-10 scroll-mt-24">
        <h2 className="text-[20px] font-bold text-text">Eclipse Menu <span className="ml-2 font-mono text-sm text-muted">.gdr2</span></h2>
        <ol className="mt-5 space-y-4">
          <Step n={1} title="Install Eclipse in Geode">
            With Geode installed, open its Download tab in Geometry Dash. Search for Eclipse, install <Ext href="https://eclipse.menu/">Eclipse Menu</Ext> and restart the game.
          </Step>
          <Step n={2} title="Open the Replay Bot">
            Press <kbd>Tab</kbd> on PC or tap the floating Eclipse button on mobile. Open the Replay Bot and choose Record, then save the replay as <code>.gdr2</code>.
          </Step>
          <Step n={3} title="Load a download">
            Open Shortcuts and choose Save folder. Put the <code>.gdr2</code> file in the <code>replays</code> folder. Select it in the Replay Bot, enable playback and restart the level.
          </Step>
        </ol>
      </section>
      {/* -------------------------------- zBot ------------------------------- */}
      <section className="mt-10">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 translate="no" className="notranslate text-[20px] font-bold text-text">
            zBot
          </h2>
          <span className="rounded-md border border-amber/35 bg-amber/12 px-2 py-0.5 text-[11.5px] font-semibold text-amber">
            Paid imports
          </span>
          <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-[11.5px] text-muted">
            .gdr
          </span>
        </div>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Match the recording and the replay tool to your Geometry Dash version.
        </p>

        <div className="card mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-[13.5px] leading-relaxed text-text-dim">
            Install zBot through Geode. Recording and playing your own run is free, but importing a premade file from this catalog requires a paid zBot key. Get it from the <Ext href={ZBOT_STORE}>official zBot store</Ext>; downloading our macro does not include a key.
          </p>
          <Ext href={ZBOT_PAGE}>
            <span className="inline-flex rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-accent-hover">
              Open zBot on Geode
            </span>
          </Ext>
        </div>

        <ol className="mt-6 space-y-4">
          <Step n={1} title="Install zBot">
            Open Geode&apos;s mod browser, search for zBot and install the version offered for your
            device. The official Geode page above also lists the currently available builds.
          </Step>
          <Step n={2} title="Activate imports and download the zBot entry">
            Open zBot (B by default in the current desktop build), choose Enter Product Key and activate your purchased key. If it says “Upgrade to import replays!”, imports are still locked.{" "}
            Open a level in the catalog and choose the download card labelled zBot. Its filename ends
            in <span className="font-mono">.gdr</span>.
          </Step>
          <Step n={3} title="Load the replay">
            Use Open Replays Folder in zBot and copy the downloaded .gdr file there. Back in zBot, enter the replay name in Import Replay by name and press Import. Current desktop builds use this folder-and-name workflow; labels can differ between releases. If it cannot find the file, compare the name shown in the folder with the name you entered.
          </Step>
          <Step n={4} title="Play from the beginning">
            Use playback mode and start the matching level from the beginning. Use the recording FPS shown beside the download on the macro page.
          </Step>
        </ol>
      </section>

      {/* ----------------------------- Mega Hack ----------------------------- */}
      <section className="mt-10">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 translate="no" className="notranslate text-[20px] font-bold text-text">
            Mega Hack
          </h2>
          <span className="rounded-md border border-amber/35 bg-amber/12 px-2 py-0.5 text-[11.5px] font-semibold text-amber">
            Paid
          </span>
          <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-[11.5px] text-muted">
            .gdr2
          </span>
        </div>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Mega Hack ships its own replay system. Choose a download labelled Mega Hack; a shared .gdr2 extension alone does not guarantee that a file made for another tool will play correctly.
        </p>

        <div className="card mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-[13.5px] leading-relaxed text-text-dim">
            <span className="font-semibold text-text">Mega Hack is not free.</span> It is a paid mod
            menu, bought from its developer.
          </p>
          <Ext href={MEGA_HACK_STORE}>
            <span className="inline-flex rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-accent-hover">
              Buy Mega Hack
            </span>
          </Ext>
        </div>

        <ol className="mt-6 space-y-4">
          <Step n={1} title="Buy and install it">
            Purchase Mega Hack from <Ext href={MEGA_HACK_STORE}>absolllute.com</Ext> and follow its <Ext href="https://absolllute.com/how-to-install">official installation guide</Ext>. For Geode, install Mega Hack Installer, restart, then sign in using the account that owns your purchase and install. Windows users can also choose the standalone installer. After activation, open Mega Hack and its replay controls.
          </Step>
          <Step n={2} title="Put the macro where it can find it">
            Mega Hack loads replays from its own macros folder. Drop the downloaded file in there, or
            use the menu&apos;s import option if your version has one.
          </Step>
          <Step n={3} title="Select and play">
            Pick the macro from the list, switch the mode from record to playback, then start the
            level from the beginning using the recording FPS shown on the download card.
          </Step>
        </ol>

        {/* The catalog carries tool-specific files. Finding that out mid-level
            is worse than reading it here. */}
        <div className="mt-5 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3">
          <p className="text-[13.5px] leading-relaxed text-amber">
            <span className="font-semibold">
              Use the file made for your playback tool.
            </span>{" "}
            Mega Hack and Eclipse use .gdr2, zBot uses .gdr, and Silicate uses .slc. Check the recorder on
            each download card and take the one that matches your setup.
          </p>
        </div>
      </section>

      {/* --------------------------- troubleshooting -------------------------- */}
      <section className="mt-10">
        <h2 className="text-[17px] font-bold text-text">If the macro desyncs</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-text-dim">
          A macro replays recorded inputs, not a new solution to a level. If it loads but dies at the same point, change one setting at a time so you can identify the cause:
        </p>
        <ul className="mt-3 space-y-2.5">
          {[
            "Recording FPS. Use the rate on that specific download card in the bot’s replay timing settings. Monitor refresh rate and exported video FPS are different settings; changing them alone does not necessarily change playback timing.",
            "Playback settings. Avoid changing physics, tick rate or speed during playback. Restore the settings used for the recording where known; a higher display FPS is not a repair for mismatched physics.",
            "Other mods. Anything that alters timing, gameplay or object behaviour can shift the run.",
            "The level version. If the creator updated the level after the macro was recorded, the recording may no longer match it.",
            "Start position. Play from the beginning of the level, not from a checkpoint or a start pos.",
          ].map((item) => (
            <li key={item} className="flex gap-3 text-[14.5px] leading-relaxed text-text-dim">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="card mt-10 p-5">
        <h2 className="text-[17px] font-bold text-text">If the file will not import</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-text-dim">
          Check the tool label and extension first: Silicate uses .slc, zBot uses .gdr, and Eclipse and Mega Hack use .gdr2. Renaming an extension does not convert a replay. Download again if you saved a web page instead of the file, or if the download is empty. For zBot, confirm your paid key is active and the file is in the replays folder. For Geode errors, check the mod&apos;s supported game version before trying the replay again.
        </p>
        <p className="mt-3 text-[14.5px] leading-relaxed text-text-dim">
          Still stuck? <Link href="/support" className="text-accent-soft hover:underline">Send a support ticket</Link> with the level name or ID, macro author, recorder and version, your device, recording FPS and the error or failure point. This lets staff identify the exact download. Read the <Link href="/guidelines" className="text-accent-soft hover:underline">submission guidelines</Link> if you have a corrected recording to share.
        </p>
      </section>
      <p className="mt-6 text-[12.5px] leading-relaxed text-muted">
        Guide reviewed October 7, 2026 against the official Geode instructions, Mega Hack installation guide and <Ext href="https://github.com/FigmentBoy/zBot">zBot source</Ext>. These instructions are not a promise that every tool version or every recording has been tested on every device.
      </p>

      <section className="card mt-6 p-5">
        <h2 className="text-[17px] font-bold text-text">Ready to grab one?</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-text-dim">
          Our macro downloads are free and hosted on GitHub Releases. Playback tools have their own pricing, including paid imports in zBot.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-white transition-[background-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover active:translate-y-0 active:scale-95 active:duration-75"
          >
            Browse macros
          </Link>
          <Link
            href="/guidelines"
            className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-[13.5px] font-semibold text-text-dim transition-[color,border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-muted/50 hover:text-text active:translate-y-0 active:scale-95 active:duration-75"
          >
            Guidelines
          </Link>
        </div>
      </section>
    </div>
  );
}
