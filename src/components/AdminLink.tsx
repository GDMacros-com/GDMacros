"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * The admin portal button, shown to admins and mods.
 *
 * This is CONVENIENCE, not security. The role is read from the database using
 * the visitor's own session, so the policy on `user_roles` decides: it returns
 * only your own rows, meaning a normal user gets an empty result no matter what
 * they ask for. There is no list of admins in the frontend, and no username or
 * email is compared against anything.
 *
 * Hiding the button protects nothing on its own, and is not meant to. /admin
 * checks the role again on the server and 404s otherwise, the select policy on
 * `submissions` only returns other people's rows to staff, and every review
 * RPC calls private.can_moderate() for itself.
 *
 * A CLIENT component for the same reason as AccountLink: resolving this on the
 * server would mean calling cookies() in the root layout, which opts every
 * route out of static rendering, including all 106 prerendered macro pages.
 */
export default function AdminLink({ mobile = false }: { mobile?: boolean }) {
  const [canModerate, setCanModerate] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = createClient();
    if (!supabase) return;

    let active = true;

    const check = async () => {
      // No session, no query. Signed-out visitors are the overwhelming
      // majority, and they should cost nothing.
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        if (active) setCanModerate(false);
        return;
      }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .in("role", ["admin", "mod"])
        .limit(1);
      if (active) setCanModerate((roles?.length ?? 0) > 0);
    };

    void check();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void check();
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!canModerate) return null;

  // Red, because this is the moderation area and it should not be mistaken for
  // ordinary navigation.
  const base =
    "rounded-lg border border-rose/50 bg-rose/12 font-bold tracking-wide text-rose uppercase transition-[background-color,border-color,transform] duration-200 ease-out hover:border-rose/70 hover:bg-rose/20 active:scale-95 active:duration-75";

  if (mobile) {
    return (
      <Link href="/admin" className={`${base} block px-3 py-2.5 text-center text-[13px]`}>
        Staff portal
      </Link>
    );
  }

  return (
    <Link
      href="/admin"
      title="Staff portal"
      className={`${base} hidden px-3 py-2 text-[12.5px] sm:inline-block`}
    >
      Staff portal
    </Link>
  );
}
