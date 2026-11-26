import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { SUPABASE_URL } from "@/lib/supabase/config";

const OWNER_DISCORD_ID = "1488686761264549939";
const LOG_TITLES = new Map([
  ["rejected", "Submission denied"],
  ["accepted", "Submission accepted"],
  ["details_edited", "Submission details edited"],
  ["publish_not_started", "Publishing started"],
  ["publish_live_verified", "Publishing done"],
  ["quality_check_good", "Quality check passed"],
  ["quality_check_issue", "Quality check found an issue"],
]);

function serviceClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key || !SUPABASE_URL) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function trialModStaffClient(actorId: string): Pick<SupabaseClient, "rpc" | "from"> | null {
  const db = serviceClient();
  if (!db) return null;
  return {
    from: db.from.bind(db),
    rpc: (operation, args) => db.rpc("trial_mod_staff_rpc", {
      p_actor: actorId,
      p_operation: operation,
      p_args: args,
    }),
  };
}

export function trialModSubmissions() {
  return serviceClient()?.from("submissions");
}

export async function recordTrialModQualityCheck(actorId: string, args: Record<string, string | null>) {
  const db = serviceClient();
  if (!db) return { error: "Quality checks are unavailable right now." };
  return db.rpc("record_trial_mod_quality_check", { ...args, p_actor: actorId });
}

export function scheduleTrialModLogDelivery(actorId: string) {
  if (process.env.TMOD_LOG_WEBHOOK) {
    after(async () => {
      const result = await drainTrialModLogs(actorId);
      if (result.failed) console.error("[trial-mod] Discord delivery failed and will be retried");
    });
  }
}

export async function drainTrialModLogs(actorId?: string) {
  const db = serviceClient();
  const webhook = process.env.TMOD_LOG_WEBHOOK?.trim();
  let sent = 0;
  if (!db || !webhook) return { sent, failed: false };

  try {
    const url = new URL(webhook);
    if (url.protocol !== "https:" || !["discord.com", "canary.discord.com", "ptb.discord.com", "discordapp.com"].includes(url.hostname)
      || !/^\/api\/(?:v\d+\/)?webhooks\/\d+\/[^/]+$/.test(url.pathname)) return { sent, failed: true };
    url.searchParams.set("wait", "true");
    for (let i = 0; i < 10; i++) {
      const { data, error } = await db.rpc("claim_trial_mod_log", { p_actor: actorId ?? null });
      if (error) return { sent, failed: true };
      const job = data?.[0];
      if (!job) break;
      const title = LOG_TITLES.get(job.action);

      if (title) {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `<@${OWNER_DISCORD_ID}>`,
            allowed_mentions: { parse: [], users: [OWNER_DISCORD_ID] },
            embeds: [{
              title: `Trial Mod · ${title}`,
              description: [
                `Account · ${job.actor_username} (${job.actor_id})`,
                job.level_name && `Level · ${job.level_name}`,
                job.target_id && `Reference · ${job.target_id}`,
                job.detail,
              ].filter(Boolean).join("\n"),
              timestamp: job.created_at,
              footer: { text: `Event ${job.id}` },
            }],
          }),
          signal: AbortSignal.timeout(5_000),
          redirect: "error",
          cache: "no-store",
        });
        if (!response.ok) return { sent, failed: true };
      }
      const { error: deleteError } = await db.from("trial_mod_log_jobs").delete()
        .eq("id", job.id).eq("lease_id", job.lease_id);
      if (deleteError) return { sent, failed: true };
      if (title) sent++;
    }
    return { sent, failed: false };
  } catch {
    // Fetch errors can contain the webhook URL.
    return { sent, failed: true };
  }
}
