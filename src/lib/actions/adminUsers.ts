"use server";

import { isCurrentUserAdmin } from "@/lib/admin";
import { adminAccountSnapshot } from "@/lib/supabase/auth-admin";
import { getUser, createClient } from "@/lib/supabase/server";
import { USERNAME_PATTERN } from "@/lib/username";

export interface AdminUserView {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  isAdmin: boolean;
  pendingSubmissions: number;
  publishedSubmissions: number;
  supportTickets: number;
  openSupportTickets: number;
  submissionBan: { email: string; reason: string; createdAt: string } | null;
  supportBan: { id: string; reason: string; createdAt: string } | null;
}

export type AdminUserLookupResult =
  | { ok: true; account: AdminUserView }
  | { ok: false; error: string };

/** Exact, case-insensitive lookup. Never returns an account list. */
export async function lookupAdminUser(username: string): Promise<AdminUserLookupResult> {
  const user = await getUser();
  if (!user || !(await isCurrentUserAdmin())) {
    return { ok: false, error: "You do not have permission to do that." };
  }

  const clean = username.trim();
  if (!USERNAME_PATTERN.test(clean)) {
    return { ok: false, error: "Enter a complete, valid username." };
  }

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Account lookup is unavailable right now." };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,username")
    .eq("username_lower", clean.toLowerCase())
    .maybeSingle();
  if (profileError) return { ok: false, error: "That account could not be looked up." };
  if (!profile) return { ok: false, error: "No account has that username." };

  try {
    const [snapshot, submissionBans, supportBans] = await Promise.all([
      adminAccountSnapshot(profile.id),
      supabase.rpc("list_submission_bans"),
      supabase.rpc("list_support_ticket_bans"),
    ]);
    if (!snapshot) return { ok: false, error: "The profile exists, but its login account no longer does." };

    const emailLower = snapshot.email.toLowerCase();
    const submissionBan = (submissionBans.data ?? []).find(
      (row: { email_lower?: string }) => row.email_lower === emailLower,
    ) as { email_lower: string; reason: string; created_at: string } | undefined;
    const supportBan = (supportBans.data ?? []).find(
      (row: { username?: string }) => row.username?.toLowerCase() === profile.username.toLowerCase(),
    ) as { ban_id: string; reason: string; created_at: string } | undefined;

    return {
      ok: true,
      account: {
        id: snapshot.id,
        username: profile.username,
        email: snapshot.email,
        createdAt: snapshot.createdAt,
        lastSignInAt: snapshot.lastSignInAt,
        emailConfirmedAt: snapshot.emailConfirmedAt,
        isAdmin: snapshot.roles.includes("admin"),
        pendingSubmissions: snapshot.pendingSubmissions,
        publishedSubmissions: snapshot.publishedSubmissions,
        supportTickets: snapshot.supportTickets,
        openSupportTickets: snapshot.openSupportTickets,
        submissionBan: submissionBan
          ? { email: submissionBan.email_lower, reason: submissionBan.reason, createdAt: submissionBan.created_at }
          : null,
        supportBan: supportBan
          ? { id: supportBan.ban_id, reason: supportBan.reason, createdAt: supportBan.created_at }
          : null,
      },
    };
  } catch {
    return { ok: false, error: "Account activity could not be loaded. Check the Supabase secret key." };
  }
}
