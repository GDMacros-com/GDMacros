import "server-only";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

/**
 * Narrow Auth administration for legal notices, account lookup and a user's
 * own confirmed account deletion.
 *
 * This is one of the narrow server-only modules that touches the privileged
 * Supabase key. It exists because there is no other way to learn an
 * account's email address: `auth.users` is not reachable through PostgREST, and
 * deliberately so. Bulk enumeration exists only for important legal notices;
 * the admin account tool exposes one exact username lookup at a time, only
 * after the calling action has checked the administrator role.
 *
 * How it is kept narrow
 * ---------------------
 *   * `import "server-only"` is the first line, so a client import fails the
 *     BUILD rather than leaking at runtime.
 *   * The key comes from SUPABASE_SECRET_KEY, with no NEXT_PUBLIC_ prefix, so
 *     Next will not inline it into any browser bundle.
 *   * The raw client is never exported. Only purpose-built operations leave
 *     this file.
 *   * Bulk reads never hand addresses to the browser. The only browser-visible
 *     address is from one exact account lookup after a fresh admin check.
 *     `resolveEmails` is used only inside the legal-notice send path.
 *   * No address is ever persisted. The delivery table stores account uuids.
 */

const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "";

export const isAuthAdminConfigured = Boolean(SUPABASE_URL && SECRET_KEY);

function adminClient() {
  if (!isAuthAdminConfigured) throw new Error("Auth admin is not configured");
  return createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Supabase caps perPage at 1000; 200 keeps each round trip small. */
const PAGE_SIZE = 200;

/**
 * Hard stop on enumeration.
 *
 * A pagination bug that never terminates would otherwise spin until the
 * function times out. GDMacros has nowhere near this many accounts, so hitting
 * it means something is wrong and the caller should hear about it rather than
 * silently send to a truncated list.
 */
const MAX_PAGES = 200;

export interface AccountPage {
  ids: string[];
  /** True when enumeration stopped at MAX_PAGES rather than at the real end. */
  truncated: boolean;
}

/**
 * Every account id that has a usable email address.
 *
 * Paginated, because `listUsers` returns one page and a site that has grown
 * past the first page would otherwise silently notify only the first 200
 * accounts. Sorted before returning so batch membership is deterministic
 * regardless of what order Supabase happened to answer in.
 */
export async function listAccountIds(): Promise<AccountPage> {
  const supabase = adminClient();
  const ids: string[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new Error(`Could not list accounts: ${error.message}`);

    const users = data?.users ?? [];
    for (const u of users) {
      // An account with no address cannot be notified. Banned accounts are
      // still account holders and still receive legal notices.
      if (u.id && typeof u.email === "string" && u.email.trim()) ids.push(u.id);
    }
    if (users.length < PAGE_SIZE) {
      ids.sort();
      return { ids, truncated: false };
    }
  }

  ids.sort();
  return { ids, truncated: true };
}

/**
 * Resolves a batch of account ids to addresses, at send time only.
 *
 * Deliberately fetched fresh rather than snapshotted when the run was prepared:
 * if somebody changes their email between preparation and delivery, the notice
 * should reach the address they actually use. Ids with no current account
 * simply do not appear in the map, and the caller skips them.
 */
export async function resolveEmails(userIds: string[]): Promise<Map<string, string>> {
  const supabase = adminClient();
  const wanted = new Set(userIds);
  const out = new Map<string, string>();

  for (let page = 1; page <= MAX_PAGES && out.size < wanted.size; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new Error(`Could not resolve recipients: ${error.message}`);

    const users = data?.users ?? [];
    for (const u of users) {
      if (u.id && wanted.has(u.id) && typeof u.email === "string" && u.email.trim()) {
        out.set(u.id, u.email.trim());
      }
    }
    if (users.length < PAGE_SIZE) break;
  }

  return out;
}

/** The signed-in admin's own address, for the "send test to myself" path. */
export async function emailForUser(userId: string): Promise<string | null> {
  const supabase = adminClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) return null;
  return data.user.email.trim() || null;
}

export interface AdminAccountSnapshot {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  roles: string[];
  pendingSubmissions: number;
  publishedSubmissions: number;
  supportTickets: number;
  openSupportTickets: number;
}

/** Private account facts for one already-resolved profile id. */
export async function adminAccountSnapshot(userId: string): Promise<AdminAccountSnapshot | null> {
  const supabase = adminClient();
  const [authResult, roles, pending, published, tickets, openTickets] = await Promise.all([
    supabase.auth.admin.getUserById(userId),
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("submissions").select("id", { count: "exact", head: true }).eq("submitted_by", userId),
    supabase.from("published_submissions").select("submission_id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("opened_by", userId),
    supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("opened_by", userId).eq("status", "open"),
  ]);

  const authUser = authResult.data?.user;
  if (authResult.error || !authUser?.email) return null;
  if (roles.error || pending.error || published.error || tickets.error || openTickets.error) {
    throw new Error("Could not read account activity");
  }

  return {
    id: authUser.id,
    email: authUser.email.trim(),
    createdAt: authUser.created_at,
    lastSignInAt: authUser.last_sign_in_at ?? null,
    emailConfirmedAt: authUser.email_confirmed_at ?? null,
    roles: (roles.data ?? []).map((row) => String(row.role)),
    pendingSubmissions: pending.count ?? 0,
    publishedSubmissions: published.count ?? 0,
    supportTickets: tickets.count ?? 0,
    openSupportTickets: openTickets.count ?? 0,
  };
}

/** The caller must separately prove this is the signed-in user's own id. */
export async function deleteAuthAccount(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = adminClient();
  const { error } = await supabase.auth.admin.deleteUser(userId, false);
  return error ? { ok: false, error: error.message } : { ok: true };
}
