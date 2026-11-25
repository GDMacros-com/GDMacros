import { legacyReleaseDownload } from "@/lib/github/legacy-tag";
import { getLevelBySlug } from "@/lib/macros";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; position: string }> },
) {
  const { slug, position } = await params;
  const macro = getLevelBySlug(slug, true)?.macros.find((entry) => String(entry.position) === position);
  const legacyUrl = macro && legacyReleaseDownload(macro.downloadLink);
  if (!macro || !legacyUrl) return new Response("Macro download not found.", { status: 404 });

  // During the tag rollout both URLs can be in use. Cache only confirmed new
  // destinations so a click can switch over as soon as GitHub moves its release.
  try {
    const response = await fetch(legacyUrl, {
      method: "HEAD",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok || response.status === 302) {
      return new Response(null, {
        status: 307,
        headers: { Location: legacyUrl, "Cache-Control": "public, max-age=300" },
      });
    }
  } catch {
    // The original link can still be available while its release is being moved.
  }
  return new Response(null, {
    status: 307,
    headers: { Location: macro.downloadLink, "Cache-Control": "no-store" },
  });
}
