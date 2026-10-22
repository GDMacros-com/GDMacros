import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { getCatalogFile } from "@/lib/github/contents";
import { slugify } from "@/lib/macros";
import { site } from "@/lib/site";

function plain(value: string): string {
  return value.replace(/[\r\n\u0000-\u001f]/g, " ").slice(0, 250)
    .replace(/([\\`*_{}\[\]()<>~|])/g, "\\$1");
}

export function macroAnnouncement(level: { name: string; levelId: string; slug?: string }, author: string) {
  const url = `${site.url}/macro/${encodeURIComponent(level.slug || slugify(level.name))}`;
  return {
    content: "<@&1562871482961371257>",
    allowed_mentions: { parse: [], roles: ["1562871482961371257"] },
    embeds: [{
      title: "New macro available!",
      color: 0x57f287,
      description: `**${plain(level.name)}**\nA new macro has submitted!\n\n**Level ID:** \`${level.levelId.replace(/[^0-9]/g, "")}\`\n**Macro creator:** ${plain(author)}\n\n[**View macro →**](${url})\n\n*GDMacros • Newly accepted macro*`,
    }],
  };
}

// Internal server helper. Claims under a lease; failures stay queued for cron.
// Discord has no idempotency key: a lost response after delivery can cause a repeat.
export async function sendMacroAnnouncement(submissionId: string | null = null): Promise<"none" | "sent" | "failed"> {
  const webhook = process.env.NEW_MACRO_WEBHOOK?.trim();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!webhook || !key || !SUPABASE_URL) return "none";
  try {
    const url = new URL(webhook);
    if (url.protocol !== "https:" || !["discord.com", "canary.discord.com", "ptb.discord.com"].includes(url.hostname)
      || !/^\/api\/(?:v\d+\/)?webhooks\/\d+\/[^/]+$/.test(url.pathname)) return "failed";
    url.searchParams.set("wait", "true");
    const db = createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc("claim_macro_announcement", { p_submission_id: submissionId });
    if (error) return "failed";
    const job = data?.[0];
    if (!job) return "none";
    // Read the current catalog, including custom slugs and canonical level names.
    const catalog = JSON.parse((await getCatalogFile()).text) as { name: string; levelId: string; slug?: string }[];
    const level = catalog.find(item => String(item.levelId) === String(job.level_id));
    if (!level) return "failed";
    const response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(macroAnnouncement(level, job.macro_author)),
      signal: AbortSignal.timeout(10_000), redirect: "error", cache: "no-store",
    });
    if (!response.ok) {
      // Respect Discord's rate limit in addition to the minimum retry delay.
      const retry = Number(response.headers.get("retry-after"));
      if (response.status === 429 && Number.isFinite(retry) && retry > 300) {
        await db.from("macro_announcement_jobs").update({ available_at: new Date(Date.now() + Math.min(retry, 86400) * 1000).toISOString() })
          .eq("submission_id", job.submission_id).eq("lease_id", job.lease_id);
      }
      return "failed";
    }
    const { error: recordError } = await db.from("macro_announcement_jobs").update({ sent_at: new Date().toISOString() })
      .eq("submission_id", job.submission_id).eq("lease_id", job.lease_id);
    return recordError ? "failed" : "sent";
  } catch {
    // Never log fetch errors: they can contain the secret webhook URL.
    return "failed";
  }
}

export async function drainMacroAnnouncements() {
  let sent = 0;
  for (let i = 0; i < 10; i++) {
    const result = await sendMacroAnnouncement();
    if (result !== "sent") return { sent, failed: result === "failed" };
    sent++;
  }
  return { sent, failed: false };
}
