"use server";

import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin";
import { getUserAndProfile } from "@/lib/profile";
import { deleteAuthAccount } from "@/lib/supabase/auth-admin";
import { createClient, getUser } from "@/lib/supabase/server";

export interface SubmissionEmailPreferences {
  accepted: boolean;
  rejected: boolean;
}

type Result = { ok: true } | { ok: false; error: string };

/** Saves only the signed-in caller's private result-email preferences. */
export async function saveSubmissionEmailPreferences(
  preferences: SubmissionEmailPreferences,
): Promise<Result> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Sign in again and retry." };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Settings are unavailable right now." };

  const { error } = await supabase.rpc("set_submission_email_preferences", {
    p_accepted: Boolean(preferences.accepted),
    p_rejected: Boolean(preferences.rejected),
  });

  if (error) return { ok: false, error: "Your email preferences could not be saved." };

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Permanently deletes only the signed-in caller's own account.
 *
 * A typed phrase is rechecked on the server, administrators are refused to
 * prevent an accidental lockout, and a submission still in review must be
 * withdrawn first so its private Storage object is cleaned up normally.
 */
export async function deleteOwnAccount(
  confirmation: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, profile } = await getUserAndProfile();
  if (!user || !profile) return { ok: false, error: "Sign in again and retry." };
  if (confirmation !== `DELETE ${profile.username}`) {
    return { ok: false, error: "The confirmation phrase does not match." };
  }
  if (await isCurrentUserAdmin()) {
    return { ok: false, error: "Administrator accounts cannot be self-deleted here." };
  }

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Account deletion is unavailable right now." };
  const { count, error } = await supabase
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("submitted_by", user.id);
  if (error) return { ok: false, error: "Your submissions could not be checked. Try again." };
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: "Withdraw submissions that are still in review before deleting your account.",
    };
  }

  const deleted = await deleteAuthAccount(user.id);
  return deleted.ok
    ? { ok: true }
    : { ok: false, error: "Your account could not be deleted. Try again or contact support." };
}

