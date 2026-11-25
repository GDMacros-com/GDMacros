import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import BackToAdmin from "@/components/admin/BackToAdmin";
import UserLookup from "@/components/admin/UserLookup";
import { isCurrentUserAdmin } from "@/lib/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser } from "@/lib/supabase/server";
import { listManagedStaffRoles } from "@/lib/actions/adminUsers";

export const metadata: Metadata = { title: "Account tools", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  if (!isSupabaseConfigured) redirect("/login");
  const user = await getUser();
  if (!user) redirect("/login?next=/admin/users");
  if (!(await isCurrentUserAdmin())) notFound();
  const supabase = await createClient();
  const owner = await supabase?.rpc("can_manage_staff_roles");
  const staffRoles = owner?.data === true ? await listManagedStaffRoles() : null;

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-10 sm:px-6 sm:py-14">
      <BackToAdmin />
      <h1 className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">Account tools</h1>
      <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted">
        Find one account by its exact username, copy its private email, check activity and remove moderation blocks without opening the SQL editor.
      </p>
      <UserLookup ownerId={owner?.data === true ? user.id : null} staffRoles={staffRoles} />
    </div>
  );
}
