import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/admin";
import MacroEditor from "@/components/admin/MacroEditor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title:"Edit macros", robots:{ index:false, follow:false } };

export default async function MacroEditorPage() {
  if (!(await getUser())) redirect("/login?next=/admin/macros");
  if (!(await isCurrentUserAdmin())) notFound();
  return <div className="mx-auto max-w-[940px] px-4 py-10 sm:px-6">
    <h1 className="text-2xl font-bold">Edit published macros</h1>
    <p className="mt-2 text-sm text-muted">Correct a published entry, replace a file, or remove an accidental upload.</p>
    <MacroEditor />
  </div>;
}
