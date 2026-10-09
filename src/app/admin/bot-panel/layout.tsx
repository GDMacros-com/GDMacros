import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { botAdminIdentity } from "@/lib/bot/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Community bot",
  robots: { index: false, follow: false },
};
export default async function BotLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await getUser())) redirect("/login?next=/admin/bot-panel");
  if (!(await botAdminIdentity())) notFound();
  return children;
}
