import type { Metadata } from "next";
import Link from "next/link";
import AnimatedHeading from "@/components/AnimatedHeading";
import { site } from "@/lib/site";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/support";
import { PRIVACY_EFFECTIVE_DATE, PRIVACY_VERSION, formatLegalDate } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `What ${site.name} stores, what stays private, and which services are involved.`,
};

/**
 * The Privacy Policy.
 *
 * WRITTEN TO STOP GOING STALE
 * ---------------------------
 * The previous version described the implementation: individual tables,
 * individual storage keys, one section per feature. Every feature shipped meant
 * another section, and a policy that needs editing on every release is a policy
 * that will eventually be wrong, because sooner or later somebody ships without
 * editing it.
 *
 * This version is organised by CATEGORY OF DATA and PURPOSE instead. "Things
 * you choose, stored against your account" covers the email preferences that
 * exist today and the next preference that gets added, without a word changing.
 * Companies are described by the ROLE they perform, so moving a feature between
 * them is what would need an edit, not adding a feature.
 *
 * Specific facts are still named where they are the point rather than an
 * example: the route support mail actually takes, what is public, what is
 * deleted when. Those are commitments, not implementation trivia.
 *
 * The trade is deliberate and has a floor: generality must never become vague
 * enough to stop being a promise. If a change means the words below are no
 * longer true, the words change. That is the whole test.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="text-[17px] font-bold text-text">{title}</h2>
      <div className="mt-2.5 space-y-3 text-[14.5px] leading-relaxed text-text-dim">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

const Mail = () => (
  <a href={SUPPORT_MAILTO} className="text-accent-soft hover:underline">
    {SUPPORT_EMAIL}
  </a>
);

const Key = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[12.5px] text-text">{children}</code>
);

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-10 sm:px-6 sm:py-14">
      <AnimatedHeading
        text="Privacy Policy"
        className="text-[30px] font-extrabold tracking-tight text-text sm:text-[36px]"
      />
      <p className="mt-3 text-[13px] text-muted">
        Version {PRIVACY_VERSION}. Last updated {formatLegalDate(PRIVACY_EFFECTIVE_DATE)}.
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">
        {site.name} is a macro catalog supported in part by advertising. This page explains what is
        stored, what stays private, how advertising works, and which other companies are involved.
      </p>

      <Section title="The short version">
        <Bullets
          items={[
            "You can browse and download everything without an account.",
            "Some public catalog pages contain Google AdSense advertising.",
            "Where consent is required, you can accept, refuse, or manage advertising choices.",
            "An account stores what it needs to be an account, plus what you choose to give it.",
            "Your email address is not publicly listed. Your username and accepted macros are public.",
            "We send account, submission, support-ticket and important service or policy messages, not marketing email.",
          ]}
        />
        <p>The rest of this page is the detail behind those points.</p>
      </Section>

      <Section title="Browsing without an account">
        <p>
          You do not need an account to browse the catalog or download a macro. We do not create an
          account record about you merely because you browse, but the hosting, analytics and
          advertising services described below receive the technical information needed to provide
          their part of the page.
        </p>
        <p>
          Your browser keeps a few small preferences locally so the site behaves sensibly between
          visits: things like your theme (<Key>gdm-theme</Key>), how you like the list laid out,
          what you viewed recently, and your favorites (<Key>gdmacros:favorites</Key>). These live in
          your browser&apos;s local storage. Theme, layout and recent-view preferences stay on your
          device. Favorites can sync to your account when you sign in; the browser also keeps an
          account identifier and pending changes so it does not mix different users&apos; lists.
          The Discord announcement also saves a local flag
          (<Key>gdmacros:discord-announcement:2026-10</Key>) when shown, so it does not
          appear again in that browser. This flag is not synced to your account.
          Clearing your site data removes these local copies.
        </p>
      </Section>

      <Section title="Cookies">
        <p>Cookies or similar browser storage can appear in these cases:</p>
        <Bullets
          items={[
            "When you sign in, Supabase sets a session cookie so you stay signed in. Signing out clears it.",
            "If you use the language menu, Google Translate sets a googtrans cookie to remember the language. Setting it back to English clears it.",
            "An embedded YouTube video can set cookies when you play it. That is YouTube, under Google's terms, not us.",
            "Google AdSense and its consent system can use cookies or similar storage to serve, limit, personalise and measure advertising according to your choices and the law that applies to you.",
          ]}
        />
      </Section>

      <Section title="Advertising and consent">
        <p>
          Public catalog and macro pages can show responsive advertisements supplied by Google
          AdSense. Ads are kept out of account, submission, settings, notification, support-ticket
          and admin pages. An advertisement is labelled and is not a recommendation or endorsement
          by {site.name}.
        </p>
        <p>
          Loading an ad or the consent message makes your browser communicate with Google. Depending
          on your location, settings and consent, Google can process information such as your IP
          address, browser and device information, the page you visited, ad interactions and cookie
          or similar identifiers. Google uses that information to deliver, prevent fraud, measure
          and, where permitted, personalise advertising.
        </p>
        <p>
          Visitors in the EEA, UK and Switzerland are shown a Google-certified consent message with
          choices to consent, not consent or manage options. Refusing personalised advertising does
          not prevent you from using the catalog. You can revisit the privacy choices through the
          Google message controls when they are available.
        </p>
        <p>
          You can read{" "}
          <a href="https://policies.google.com/technologies/ads" className="text-accent-soft hover:underline">
            how Google uses information for advertising
          </a>{" "}
          and review your choices in{" "}
          <a href="https://myadcenter.google.com/" className="text-accent-soft hover:underline">
            Google&apos;s My Ad Center
          </a>
          .
        </p>
        <p>
          The site can perform a small on-device check to notice when common advertisement elements
          are hidden. If that suggests an ad blocker is active, a dismissible message asks whether
          you would like to allow ads. The check is not sent to our server, does not block the site,
          and the dismissal is remembered only in session storage for the current browser tab.
        </p>
      </Section>

      <Section title="Your account">
        <p>Accounts are handled by Supabase. Having one means storing:</p>
        <Bullets
          items={[
            "Your email address, used to sign in, confirm the account, reset a password, and send the messages described below.",
            "A hashed version of your password. We never see your actual password, and it is not something we can look up or recover.",
            "Session information that keeps you signed in.",
            "Your username.",
          ]}
        />
        <p>
          Your <span className="font-semibold text-text">username is public</span>. It is the name
          shown on macros you record and on your profile page. Your{" "}
          <span className="font-semibold text-text">email address is private</span>: it is never
          shown publicly. A restricted admin account tool can reveal one address only after an admin
          enters the exact username, for account support and moderation. The submission review
          screen itself shows the username, never the address behind it.
        </p>
      </Section>

      <Section title="Things you choose, stored against your account">
        <p>
          Some data exists only because you asked for it. Today that means your favorites when you
          are signed in, your notification read state, and your preferences for which submission
          results are emailed to you. As the site gains options, new preferences of this kind are
          stored the same way and for the same reason: to make the site behave the way you set it.
        </p>
        <p>
          None of it is used for anything other than providing that feature to you. Changing a
          setting changes the stored value; removing the feature or the account removes it.
        </p>
        <p>
          Signed out, new favorite changes stay in your browser. When you sign in, the site can merge
          those changes into your account so favorites are available on other devices.
        </p>
      </Section>

      <Section title="Macros you submit">
        <p>Submitting a macro stores what is needed to review and publish it:</p>
        <Bullets
          items={[
            "Which account submitted it, and the level, video link, recorder, recording FPS, macro author and any notes you entered.",
            "The .gdr or .gdr2 file itself.",
            "Timestamps and the current review status.",
          ]}
        />
        <p>
          The uploaded file goes into private storage. It is not publicly listed or available through an anonymous storage URL. Authorised admins and mods can open it through short-lived review links. Anyone given
          one of those links can use it until it expires, so reviewers must not share it. A reviewer can correct details
          such as a missing video link before publishing.
        </p>
      </Section>

      <Section title="What becomes public">
        <p>
          After an admin or mod approves a submission, publishing happens automatically. The file is
          uploaded as a public download, the catalog entry is added, and the site is checked to
          confirm the macro is really live. Once that is confirmed, the private copy of your upload
          is deleted.
        </p>
        <p>Public means the macro itself, and the credits shown beside it: the level, the recorder, the recording FPS, and the macro author. Also public:</p>
        <Bullets
          items={[
            "Your username, once you choose one.",
            <>
              Your profile page, which lists the macros credited to your name. Anyone can view it,
              and it is included in the site&apos;s sitemap.
            </>,
            "The catalog itself.",
          ]}
        />
        <p>
          We do not add your account email, internal account ID, submission notes or review records
          to the public catalog. The uploaded macro file itself is published without a general
          metadata-removal step: any names, comments or other information embedded in that file
          can become public. Check your file before submitting and do not include secrets or
          personal information you do not want to share. Public catalog entries and credits also
          appear in GitHub history; removing a current entry does not erase existing copies.
        </p>
      </Section>

      <Section title="Email we send you">
        <p>The address on your account is used for:</p>
        <Bullets
          items={[
            "account mail such as confirmation and password resets,",
            "submission results, if you have those switched on in Settings,",
            "the result of a support ticket when an admin or mod closes it,",
            "notice of a material change to the Terms or this policy,",
            "and important account, security or service messages.",
          ]}
        />
        <p>
          All of it comes from <Mail />. This is{" "}
          <span className="font-semibold text-text">not a newsletter and not advertising</span>.
          There is no marketing mailing list on this site, and we do not send promotional email. You
          can switch off submission-result email in Settings; the results still appear on the site.
        </p>
        <p>
          Sending mail reliably means keeping a short record of what was sent, so that an
          interrupted run can resume and nobody is sent the same message twice. Those records hold
          the message and its delivery state. Where a retry needs it, a copy of the destination
          address is held only for as long as the retry is safe, and is erased once the message is
          settled. They are never used to build a mailing list.
        </p>
      </Section>

      <Section title="Support tickets">
        <p>
          When you are signed in, a suggestion or broken-macro report opens a private support
          thread. It stores your account ID, username, the title and messages, timestamps, its
          status, and the macro page details when the report concerns a download or a level request. Only you, admins and mods can read that thread.
        </p>
        <p>
          Open tickets stay available so the conversation can continue. When an admin or mod resolves or
          closes one, you receive an in-app notification and an email with a link to its transcript.
          The ticket, every message, its notification, and the delivery job are scheduled for deletion
          30 days after closure. Access through the site stops at that deadline even if the
          scheduled cleanup is delayed. An admin or mod can also permanently delete a ticket and its transcript earlier.
        </p>
        <p>
          An admin or mod can block an account from opening new tickets when the feature is abused. The
          block stores the account ID, the reason, who applied it, and the time. It does not hide an
          existing conversation or prevent replies in one.
        </p>
      </Section>

      <Section title="Discord community bot">
        <p>
          When enabled in our Discord server, the GDM Community bot provides moderation, boost
          announcements, leveling, private Discord tickets and temporary voice channels. It uses
          Discord user, role and channel identifiers, display names, profile avatar references,
          relevant message content and timestamps, and member or voice events needed for those
          features. This does not give the bot access to your Discord password, private messages
          with other people, or conversations in servers where it is not installed.
        </p>
        <p>
          Moderation cases record the action, affected user or channel, moderator, reason and time.
          Configured event logs can include edited or deleted message content available to the bot.
          These records support server moderation and have no automatic expiry: staff retain them
          until they are removed, including when an applicable privacy request requires removal.
          Discord log copies are separate from the bot database. General logs exclude private ticket
          message content. Staff control log destinations and must keep sensitive logs private.
        </p>
        <p>
          Leveling stores XP, message counts, reward progress, optional rank colors and backgrounds,
          and recent daily activity totals. A public leaderboard can show your Discord name, user
          identifier, XP, level and message count. Use <Key>/privacy hide</Key> to hide your rank and
          stop earning XP, <Key>/privacy show</Key> to opt back in, or <Key>/privacy delete</Key> to
          erase leveling totals, recent activity and rank customization and opt out. These commands
          do not erase moderation records or Discord&apos;s own copies. Recent activity summaries
          expire after 400 days. Imported leveling files are processed for the import and are not
          kept as separate uploaded files by the service.
        </p>
        <p>
          Discord tickets are visible in Discord to their creator, the panel&apos;s staff, any added
          participants and people who can bypass restrictions through Discord&apos;s permissions.
          Closing a ticket saves a transcript of message text, embeds, author identifiers and
          attachment links. Website transcripts require a GDMacros admin account; a website mod
          cannot read them. A transcript expires 30 days after closure and is erased by scheduled
          cleanup. Its link stops working at expiry even if cleanup is delayed. The bot also deletes
          the closed Discord channel; permission failures require staff attention and are retried.
          Attachments are linked from Discord rather than copied to our storage, so Discord&apos;s
          copies and expiring download links follow Discord&apos;s own rules. Reopening a ticket
          removes the saved transcript; closing it again produces a new transcript and expiry.
        </p>
        <p>
          The bot and its private database run on our separately hosted server, with OVHcloud as
          the intended hosting provider. Website requests to its dashboard are checked by our
          server against your current admin role. Dashboard changes and transcript access record
          the acting website account identifier and time. Temporary voice ownership records are
          removed when the channel is deleted. Deleting a website account does not erase records
          attached to a separate Discord identity; contact <Mail /> about those records.
        </p>
      </Section>

      <Section title="Email you send us">
        <p>
          Mail sent to <Mail /> travels through more than one company before it reaches a person, so
          it is worth being clear about the path:
        </p>
        <Bullets
          items={[
            "Resend receives the message.",
            "Resend calls a webhook on this site.",
            "The site forwards the message to a private mailbox, which is a Google Gmail account.",
          ]}
        />
        <p>
          That means Resend, Vercel and Google can each process support correspondence. The message
          normally includes your email address, the name your mail client sends, the subject, the
          body, any attachments and ordinary email headers. We use it to answer you and to deal with
          abuse reports and takedown requests.
        </p>
        <p>
          Replies come from <Mail /> using the same infrastructure. The private mailbox address is
          not published anywhere. <Mail /> is the only address you need.
        </p>
      </Section>

      <Section title="Agreeing to the terms">
        <p>
          When an account is created, we record that account&apos;s internal ID, which version of the
          Terms and Privacy Policy were current at that moment, and the time. That is the whole
          record. It does not include your address, your IP address, or anything about your browser.
        </p>
      </Section>

      <Section title="The companies involved">
        <p>
          Each of these performs one role. That is how to read this list: if a feature changes, it is
          almost always still one of these companies doing the same job.
        </p>
        <Bullets
          items={[
            <>
              <span className="font-semibold text-text">Supabase</span> stores accounts and
              everything attached to one: sign-in, profiles, favorites, submissions, the private
              files you upload, review state, support tickets, preferences and the records described
              above.
            </>,
            <>
              <span className="font-semibold text-text">Vercel</span> hosts the site and runs its
              server code. Vercel Web Analytics and Speed Insights are enabled. They report aggregate
              traffic and page performance, and are not used to build a profile of you or to
              advertise to you.
            </>,
            <>
              <span className="font-semibold text-text">Discord</span> supplies the community
              platform, bot API and attachment hosting. <span className="font-semibold text-text">OVHcloud</span>{" "}
              is the intended host for our separate bot service and its private database. Discord
              community data is used for community features and moderation, not advertising.
            </>,
            <>
              <span className="font-semibold text-text">Resend</span> handles email, both the
              messages we send you and the support mail you send us.
            </>,
            <>
              <span className="font-semibold text-text">Google</span> is involved through Gmail,
              where support mail is read; Google Translate, whose widget loads with the page to provide the language menu; and Google
              AdSense, which provides consent choices and advertising on selected public pages.
            </>,
            <>
              <span className="font-semibold text-text">GitHub</span> hosts the source code, the
              catalog and every public macro download. Downloading a macro means your browser talks
              to GitHub, under GitHub&apos;s own terms.
            </>,
            <>
              <span className="font-semibold text-text">GDBrowser</span> is used to look up Geometry
              Dash level details. Those lookups are made by our server, not by your browser, so
              those lookups do not pass your account identity to GDBrowser. Opening a GD Browser
              link yourself does contact it directly.
            </>,
            <>
              <span className="font-semibold text-text">YouTube</span> provides showcase videos.
              Searching for one during submission happens on our server and uses no API key. Thumbnails load directly from Google image hosts, including before you play a video.
              Clicking play loads the privacy-enhanced YouTube player in your browser. Those
              requests expose ordinary connection information to Google and are subject to
              Google&apos;s terms.
            </>,
            <>
              <span className="font-semibold text-text">Lanyard</span> supplies the live Discord
              status shown on the{" "}
              <Link href="/about" className="text-accent-soft hover:underline">
                About
              </Link>{" "}
              page. That request is made by your browser. It asks only for the public Discord
              profiles shown on that page. The browser can also load their avatars from Discord&apos;s
              image servers; these providers receive ordinary connection information.
              The About page also offers a Discord server widget. It loads only after you
              choose “Load Discord widget”, connecting your browser to Discord, which
              receives connection information such as your IP address and browser details
              and may use cookies under its own privacy policy. Opening our invite or
              joining the community also takes you to Discord, under Discord’s terms
              and privacy policy.
            </>,
          ]}
        />
      </Section>

      <Section title="Older MediaFire copies">
        <p>
          Macros used to be hosted on MediaFire. They were all moved to our own hosting, and{" "}
          <span className="font-semibold text-text">
            nothing in the catalog links to MediaFire any more
          </span>
          . The old copies still exist as a fallback in case something ever needs to be restored from
          them. We are not putting a date on removing them.
        </p>
        <p>
          The MediaFire links on the install page are a separate thing. They are how you download
          xdBot itself, and they are not macro downloads.
        </p>
      </Section>

      <Section title="Staff access and moderation records">
        <p>
          Mods can review submissions, manage support tickets and run random quality checks on
          published macros. Admins also have account lookup, site status, review activity and
          service-message tools. We store moderation decisions, reasons, staff account identifiers,
          timestamps and quality-check notes to operate and troubleshoot these features. A mod role
          does not grant account-email lookup or bulk-email access.
        </p>
        <p>
          These records are not public catalog data. Some operational records are retained separately
          from the account that created them; deleting an account can remove its association without
          deleting the entire moderation record. Please avoid unnecessary personal information in
          submissions, tickets and moderation notes.
        </p>
      </Section>

      <Section title="What stays private">
        <p>Everything not listed as public above. In particular:</p>
        <Bullets
          items={[
            "Your account email address, accessible to authorised admins through the exact account lookup and to the services handling authentication and email. Mods cannot use the account-email lookup. If you include an email address in a support thread or uploaded file, its readers can see it.",
            "Your password, which is only ever stored hashed.",
            "Files you upload, until and unless a macro is accepted and published.",
            "Your submission notes and anything from the review process.",
            "Your support-ticket threads.",
            "Your settings, your notification state and your favorites.",
            "Support email you send us.",
            "Records of messages sent to your account.",
          ]}
        />
      </Section>

      <Section title="How long things are kept">
        <p>
          The rule is that something is kept while it is still doing its job, and removed when it is
          not. Most records follow an event such as a decision or account deletion; closed support
          tickets are the exception with a fixed deletion timer. Here is what that means in practice:
        </p>
        <Bullets
          items={[
            "A submission stays until it is decided or you withdraw it. Once it is accepted and confirmed live, the private copy of your upload is deleted; a rejected or withdrawn one is removed along with its file.",
            "A published macro stays in the catalog, because it is catalog content rather than account data.",
            "An open support ticket stays while the conversation is active. A resolved or otherwise closed ticket, its transcript and its notification are permanently deleted after 30 days, or earlier if an admin or mod deletes the ticket.",
            "Your other account data, including settings, favorites, notifications and your submission history, stays while the account exists.",
            "A queued submission-result email can retain a destination address while a retry is possible; settling that job clears the address, not necessarily the delivery record or message. Other delivery records can remain for retry control and support. Account-linked records are removed with the account, and ticket jobs follow the ticket deletion rules.",
            "Support email stays in the mailbox unless it is deleted by hand.",
            "The ad-block notice dismissal lasts only for the current browser-tab session. Google's advertising and consent data follows Google's own retention settings and your consent choices.",
            "Deleting your account removes its account-linked records. Published macros and credits remain in the catalog and its history. Separately received support email and provider logs or backups are not erased by that database operation.",
          ]}
        />
      </Section>

      <Section title="Deleting your account, or asking about your data">
        <p>
          You can permanently delete your own non-admin account in Settings after typing a clear
          confirmation. Any submissions still in review must be withdrawn first. Published macros
          remain in the catalog, as explained above.
        </p>
        <p>
          You can also write to <Mail /> from the address on the account. That covers deletion,
          asking what is stored about you, correcting something, and takedown requests.
        </p>
        <p>
          Please do not open a public GitHub issue for anything about your account. That is a public
          tracker and account matters do not belong there.
        </p>
      </Section>

      <Section title="Your privacy rights">
        <p>
          Contact the GDMacros operator at <Mail /> to request access to, correction of or deletion
          of your personal data. Depending on the law that applies, you may also have rights to
          portability, restriction and objection, and to complain to a data-protection authority.
          Where processing relies on consent, you can withdraw it without undoing processing that
          already happened. We may need to verify account ownership before handling a request.
        </p>
        <p>
          Service providers may process information in countries other than your own. Their privacy
          notices describe their processing and international-transfer arrangements. Contact us if
          you need information about the providers used for your account.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Private data sits behind database access rules rather than being hidden by the interface,
          so a request for someone else&apos;s data is refused by the database itself. Unpublished uploads
          are in private storage, with short-lived links for authorised review. Nobody can promise perfect security and we
          are not going to, but the design assumes the front end can be bypassed.
        </p>
      </Section>

      <Section title="Children">
        <p>
          Geometry Dash has a young audience. We do not knowingly collect more from a younger visitor
          than from anyone else, and you can use the whole catalog without an account. Hosting and third-party services can still receive the browsing
          information described above. If you believe a child&apos;s information is stored here and it
          should not be, write to <Mail /> and we will remove it.
        </p>
      </Section>

      <Section title="How this page changes">
        <p>
          {site.name} is actively developed, and features get added. This page is written by category
          rather than by feature so that it keeps describing the site accurately as that happens: a
          new preference, a new kind of message, or a new page is already covered by the categories
          above.
        </p>
        <p>
          What that is <span className="font-semibold text-text">not</span> is a blank cheque. It
          does not permit collecting a new kind of information, using what is here for a new purpose,
          or handing data to a company not named above. Any of those is a change to this page, and
          this page changes before it happens.
        </p>
        <p>
          When it does change, the version and date at the top change with it, so you can tell
          whether you are reading something new. For a material change we may email the address on
          your account. Where the law that applies to you requires more than notice, an email on its
          own is not us claiming you agreed to anything.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about privacy, your account, or anything on this page: <Mail />.
        </p>
        <p className="flex flex-wrap gap-x-5 gap-y-1 pt-1">
          <Link href="/terms" className="text-accent-soft hover:underline">
            Terms of Service
          </Link>
          <Link href="/faq" className="text-accent-soft hover:underline">
            FAQ
          </Link>
          <Link href="/guidelines" className="text-accent-soft hover:underline">
            Guidelines
          </Link>
        </p>
      </Section>
    </div>
  );
}
