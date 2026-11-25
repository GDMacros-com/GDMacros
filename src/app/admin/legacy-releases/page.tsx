import { notFound } from "next/navigation";
import BackToAdmin from "@/components/admin/BackToAdmin";
import LegacyReleaseTool from "@/components/admin/LegacyReleaseTool";
import { isCurrentUserAdmin } from "@/lib/admin";

export const metadata = {
  title: "2.2081 GitHub releases",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function LegacyReleasesPage() {
  if (!(await isCurrentUserAdmin())) notFound();

  return (
    <div className="mx-auto w-full max-w-[740px] px-4 py-10 sm:px-6">
      <BackToAdmin />
      <h1 className="mt-4 text-2xl font-extrabold text-text">2.2081 GitHub releases</h1>
      <p className="mt-2 text-sm text-muted">Use the GitHub publisher to move the 2.2081 releases to Legacy tags. Downloads from the archive continue to work as each release moves.</p>
      <LegacyReleaseTool />
    </div>
  );
}
