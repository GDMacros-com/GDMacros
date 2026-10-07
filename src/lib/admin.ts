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

/** Submission, support and quality-check access. Read fresh roles on each request. */
export async function canCurrentUserModerate(): Promise<boolean> {
  const supabase = await createClient();
  if (!supabase) return false;
  const user = await getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["admin", "mod"])
    .limit(1);
  return !error && (data?.length ?? 0) > 0;
}
