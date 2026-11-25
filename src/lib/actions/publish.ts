"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin";
import { sendSubmissionResultBestEffort } from "@/lib/actions/submissionResultEmail";
import { runPublish, type PublishProgress } from "@/lib/publish/publisher";
import { logTrialModView, scheduleTrialModLogDelivery, trialModStaffClient } from "@/lib/trialMod";

/**
 * The two entry points for automated publishing.
 *
 * A server action is a POST endpoint that anyone on the internet can call, so
 * the database checks each RPC's permissions. Trial moderators use a
 * server-only client for publishing checkpoints.
 *
 * THE BROWSER SENDS ONE THING: a submission id. Repository, release, tag, asset
 * name, download URL, level metadata, recorder, macro author and the catalog
 * payload are all derived on the server from the trusted row. Nothing a caller
 * sends can redirect the publisher at another repository or another file.
 */

/**
 * Publish, or resume publishing, one submission.
 *
 * Fully idempotent. The button, a retry after an error, a refresh and a second
 * admin picking the job up all call exactly this, and it does only the work
 * that has not already been done.
 */
async function publishSubmission(id: string): Promise<PublishProgress> {
  const staff = await getCurrentStaff();
  if (!staff) {
    return {
      ok: false,
      state: "not_started",
      stage: "validating",
      error: "You do not have permission to do that.",
    };
  }

  const supabase = staff.role === "trial_mod" ? trialModStaffClient(staff.id) : await createClient();
  if (!supabase) {
    return { ok: false, state: "not_started", stage: "validating", error: "Publishing is unavailable right now." };
  }

  try {
    return await runPublish(supabase, id, sendSubmissionResultBestEffort);
  } finally {
    if (staff.role === "trial_mod") scheduleTrialModLogDelivery(staff.id);
  }
}

export async function publishMacro(id: string): Promise<PublishProgress> {
  const result = await publishSubmission(id);

  // Only once the submission is actually gone does the queue need refreshing.
  // Revalidating mid-publish would unmount the modal that is driving it, which
  // is the 2D bug this project already paid for once.
  if (result.finished) {
    revalidatePath("/admin");
    revalidatePath("/submissions");
    revalidatePath("/notifications");
  }

  return result;
}

/**
 * The same crash-safe publisher without route revalidation between items.
 * A bulk run is driven by the admin browser one submission at a time; refreshing
 * the route after every finished item would unmount and lose that in-memory
 * queue. The bulk UI refreshes once after the complete selection finishes.
 */
export async function publishMacroForBatch(id: string): Promise<PublishProgress> {
  return publishSubmission(id);
}

export interface PublishStateView {
  state: "none" | "not_started" | "asset_uploaded" | "catalog_committed" | "live_verified";
  assetName: string | null;
  assetUrl: string | null;
  commitSha: string | null;
  lastError: string | null;
  lastErrorStage: string | null;
  attempts: number;
}

/**
 * Reads the recorded publish state WITHOUT doing any work.
 *
 * This is what the publishing screen calls when it opens. It matters that it is
 * separate from `publishMacro`: opening a modal must never upload a file. The
 * admin decides when publishing starts, and that decision is a button press.
 */
export async function getPublishState(
  id: string,
): Promise<PublishStateView | { error: string }> {
  const staff = await getCurrentStaff();
  if (!staff) return { error: "You do not have permission to do that." };
  const supabase = staff.role === "trial_mod" ? trialModStaffClient(staff.id) : await createClient();
  if (!supabase) return { error: "Publishing is unavailable right now." };

  const { data, error } = await supabase.rpc("get_publish_state", { p_id: id });
  if (error) return { error: "The publishing status could not be read." };
  if (staff.role === "trial_mod" && !(await logTrialModView(staff.id, "publish_status_viewed", id))) {
    return { error: "The publishing status could not be read." };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        state: PublishStateView["state"];
        asset_name: string | null;
        asset_url: string | null;
        catalog_commit_sha: string | null;
        last_error: string | null;
        last_error_stage: string | null;
        attempts: number;
      }
    | undefined;

  // No row simply means nothing has been attempted yet.
  if (!row) {
    return {
      state: "none",
      assetName: null,
      assetUrl: null,
      commitSha: null,
      lastError: null,
      lastErrorStage: null,
      attempts: 0,
    };
  }

  return {
    state: row.state,
    assetName: row.asset_name,
    assetUrl: row.asset_url,
    commitSha: row.catalog_commit_sha,
    lastError: row.last_error,
    lastErrorStage: row.last_error_stage,
    attempts: row.attempts ?? 0,
  };
}

/**
 * The polling call, used while waiting for production to pick up the commit.
 *
 * Deliberately the same function underneath. Waiting for a deployment can take
 * minutes and a serverless request must not sit and sleep through it, so the
 * admin's browser asks again every few seconds instead. Each call does one
 * cheap check of the live domain, and finalises the moment it matches.
 */
export async function checkPublishProgress(id: string): Promise<PublishProgress> {
  return publishMacro(id);
}
