import "server-only";
import { getUser, createClient } from "@/lib/supabase/server";

const MAX_BODY = 2 * 1024 * 1024;
export class BotUnavailable extends Error {}

/** One fresh Auth verification and one role query, also used for transcript reads. */
export async function botAdminIdentity(): Promise<string | null> {
  const user = await getUser();
  if (!user) return null;
  const client = await createClient();
  if (!client) return null;
  const { data, error } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .limit(1);
  return !error && data?.length ? user.id : null;
}

export async function boundedText(
  body: ReadableStream<Uint8Array> | null,
  maximum = MAX_BODY,
): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new BotUnavailable("Request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Fixed, server-configured origin; no arbitrary URLs or redirects from browser input. */
export async function botRequest(
  path: string,
  actor: string,
  method = "GET",
  body?: string,
) {
  const configured = process.env.GDM_BOT_API_URL ?? "";
  const key = process.env.GDM_BOT_API_KEY ?? "";
  let base: URL;
  try {
    base = new URL(configured);
  } catch {
    throw new BotUnavailable("The bot service has not been connected yet.");
  }
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash ||
    key.length < 48
  ) {
    throw new BotUnavailable("The bot service has not been connected yet.");
  }
  const response = await fetch(new URL(`/v1/${path}`, base), {
    method,
    body,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${key}`,
      "X-GDM-Actor": actor,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  const text = await boundedText(response.body, 4 * 1024 * 1024);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BotUnavailable(
      "The bot service could not respond. Try again shortly.",
    );
  }
  return { status: response.status, data };
}

/** Explicit allowlist prevents the admin proxy becoming a general Discord/VPS proxy. */
export function permittedBotPath(parts: string[], method: string): boolean {
  const path = parts.join("/");
  if (method === "GET")
    return /^(state|cases(?:\/[1-9][0-9]{0,9})?|tickets|transcripts\/[1-9][0-9]{0,9}|leaderboard)$/.test(
      path,
    );
  if (method === "PUT") return path === "settings";
  return (
    method === "POST" &&
    /^(import|actions\/(publish-panel|test-boost|sync-rewards))$/.test(path)
  );
}
