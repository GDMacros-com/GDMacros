import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import ReviewQueue, { type AdminRow } from "@/components/admin/ReviewQueue";
import SubmissionBans from "@/components/admin/SubmissionBans";
import BackToAdmin from "@/components/admin/BackToAdmin";
import { getCurrentStaff } from "@/lib/admin";
import { listSubmissionBans } from "@/lib/actions/submissions";
import { getUser, createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { logTrialModView, trialModSubmissions } from "@/lib/trialMod";

export const metadata: Metadata = {
  title: "Review queue",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUSES = new Set(["pending", "processing", "all"]);

/**
 * The review queue.
 *
 * Three independent things have to agree before any data appears:
 *
 *   1. the proxy redirects an anonymous visitor to /login;
 *   2. this page checks the role server side, from the database;
 *   3. the query uses the reviewer's session for admins and mods. Trial mods
 *      read the queue through this server route, which records the view.
 *
 * Every review RPC checks its own permissions. The
 * `admin_update_submission` RPC refuses once publishing has started.
 *
 * Staff access is required to open this route.
 *
 * Only ACTIVE submissions exist now. An accepted or rejected one is deleted and
 * replaced by a small notification to its submitter, so there is no history to
 * filter and no approved or rejected tab.
 */
export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  if (!isSupabaseConfigured) redirect("/login");

  const user = await getUser();
  if (!user) redirect("/login?next=/admin/submissions");
  const staff = await getCurrentStaff();
  if (!staff) notFound();

  const params = await searchParams;
  const filter = params.status && STATUSES.has(params.status) ? params.status : "pending";

  const supabase = await createClient();

  const submissions = staff.role === "trial_mod" ? trialModSubmissions() : supabase?.from("submissions");
  let query = submissions
    ?.select(
      "id,submitted_by,level_name,level_id,level_creator,video_url,recorder,fps,macro_author,notes,status,created_at,file_size,processing_by,processing_started_at",
    )
    .order("created_at", { ascending: false });

  if (filter !== "all") query = query?.eq("status", filter);

  const [review, bans] = await Promise.all([query, staff.role === "trial_mod" ? null : listSubmissionBans()]);
  const viewRecorded = staff.role !== "trial_mod"
    || (review && !review.error && await logTrialModView(staff.id, "review_queue_viewed", filter));

  type Raw = Omit<AdminRow, "submitter" | "processor" | "mine"> & {
    submitted_by: string;
    processing_by: string | null;
  };
  const raw = (viewRecorded ? review?.data ?? [] : []) as unknown as Raw[];

  /*
   * Usernames are resolved in a SECOND query rather than a PostgREST embed.
   *
   * submissions.submitted_by references auth.users(id), not profiles(id), so
   * there is no foreign key between submissions and profiles and the embed
   * `profiles(username)` fails with PGRST200. Adding a foreign key purely to
   * enable an embed would couple two tables for a display concern, so the join
   * happens here.
   *
   * Nothing in the review path touches auth.users, which is why an email
   * address cannot reach this page even by accident. Both id columns are
   * dropped below rather than handed to the client.
   *
   * There is exactly ONE place that reads auth.users, and it is not this one:
   * `lib/supabase/auth-admin.ts` enumerates accounts so a legal notice can be
   * emailed to them. It is server-only, reachable solely through the Mail
   * everyone tool, and no address it reads reaches the browser.
   */
  const ids = [
    ...new Set(raw.flatMap((r) => [r.submitted_by, r.processing_by].filter(Boolean) as string[])),
  ];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await supabase!
      .from("profiles")
      .select("id,username")
      .in("id", ids);
    for (const p of profiles ?? []) names.set(p.id, p.username);
  }

  const rows: AdminRow[] = raw.map(({ submitted_by, processing_by, ...rest }) => ({
    ...rest,
    submitter: names.get(submitted_by) ?? "(no username)",
    processor: processing_by ? (names.get(processing_by) ?? "another admin") : null,
    // Lets the UI say "you" rather than a name, without sending an id.
    mine: processing_by === user.id,
  }));

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-10 sm:px-6 sm:py-14">
      <BackToAdmin />

      <h1 className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">
        Review queue
      </h1>
      <p className="mt-1.5 mb-6 text-[13.5px] leading-relaxed text-muted">
        Fix any details that need fixing first, then accept or reject. Accepting opens a publishing
        screen and claims the submission. Publishing then runs automatically, and nothing is
        announced to the submitter until it has been confirmed live.
      </p>

      {!review || review.error || !viewRecorded ? (
        <div className="card px-6 py-10 text-center text-[13px] text-muted">
          The queue could not be loaded. Reload the page.
        </div>
      ) : (
        <ReviewQueue rows={rows} filter={filter} />
      )}

      {bans && <SubmissionBans initial={"bans" in bans ? bans.bans : []} />}
    </div>
  );
}
