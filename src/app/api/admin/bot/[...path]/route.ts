import { NextResponse, type NextRequest } from "next/server";
import {
  botAdminIdentity,
  botRequest,
  boundedText,
  permittedBotPath,
  BotUnavailable,
} from "@/lib/bot/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const bad = (status: number, error: string) =>
  NextResponse.json({ error }, { status, headers });

async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (!permittedBotPath(path, request.method)) return bad(404, "Not found.");
  if (
    request.method !== "GET" &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return bad(403, "Reload this page before saving.");
  // Always before contacting the VPS, including GET and direct transcript URLs.
  const actor = await botAdminIdentity();
  if (!actor) return bad(403, "Only GDMacros admins can access the bot panel.");
  if (Number(request.headers.get("content-length")) > 2 * 1024 * 1024)
    return bad(413, "The upload limit is 2 MB.");
  const query = new URLSearchParams();
  for (const name of ["page", "target", "actor", "action", "sort"]) {
    const value = request.nextUrl.searchParams.get(name);
    if (value !== null) {
      if (value.length > 64) return bad(400, "The filter is too long.");
      query.set(name, value);
    }
  }
  try {
    const body =
      request.method === "GET" ? undefined : await boundedText(request.body);
    if (body) {
      try {
        JSON.parse(body);
      } catch {
        return bad(400, "The request could not be read.");
      }
    }
    // Roles may have changed while reading an upload. Recheck before any mutation.
    if (request.method !== "GET" && (await botAdminIdentity()) !== actor)
      return bad(403, "Your admin access changed.");
    const result = await botRequest(
      path.join("/") + (query.size ? `?${query}` : ""),
      actor,
      request.method,
      body,
    );
    if ([401, 403].includes(result.status))
      return bad(503, "The bot service connection needs attention.");
    return NextResponse.json(result.data, { status: result.status, headers });
  } catch (error) {
    return bad(
      503,
      error instanceof BotUnavailable
        ? error.message
        : "The bot service is unavailable. Reload before retrying an action.",
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
