import { createClient } from "./supabase/server";
import { getUser } from "./supabase/server";

/** Admin-only tools. Moderation permissions must not broaden this check. */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const supabase = await createClient();
  if (!supabase) return false;

  // getUser, never getSession: this validates the token with Supabase rather
  // than trusting a cookie the visitor could have edited.
  const user = await getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .limit(1);

  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/** Resolve the effective role from fresh database grants. */
export async function getCurrentStaff() {
  const supabase = await createClient();
  if (!supabase) return null;
  const user = await getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["admin", "mod", "trial_mod"]);
  if (error) return null;
  const role = (["admin", "mod", "trial_mod"] as const).find((role) => data?.some((grant) => grant.role === role));
  return role ? { id: user.id, role } : null;
}

/** Submission review and quality-check access. */
export async function canCurrentUserModerate(): Promise<boolean> {
  return Boolean(await getCurrentStaff());
}

/** Staff support inbox and moderation blocks. */
export async function canCurrentUserManageSupportAndBans(): Promise<boolean> {
  const staff = await getCurrentStaff();
  return staff?.role === "admin" || staff?.role === "mod";
}
