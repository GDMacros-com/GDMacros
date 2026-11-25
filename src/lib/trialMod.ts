import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { SUPABASE_URL } from "@/lib/supabase/config";

const OWNER_DISCORD_ID = "1488686761264549939";

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

type ActivityView =
  | "review_queue_viewed"
  | "submission_inspected"
  | "submission_download_requested"
  | "publish_status_viewed"
  | "quality_macro_selected"
  | "quality_history_viewed";

export async function logTrialModView(
  actorId: string, action: ActivityView, target: string | null, level: string | null = null, detail: string | null = null,
): Promise<boolean> {
  const db = serviceClient();
  if (!db) return false;
  const { error } = await db.rpc("log_trial_mod_view", {
    p_actor: actorId, p_action: action, p_target: target, p_level: level, p_detail: detail,
  });
  if (error) {
    console.error("[trial-mod] Could not queue a view event");
    return false;
  }
  scheduleTrialModLogDelivery(actorId);
  return true;
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

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `<@${OWNER_DISCORD_ID}>`,
          allowed_mentions: { parse: [], users: [OWNER_DISCORD_ID] },
          embeds: [{
            title: `Trial Mod · ${job.action.replaceAll("_", " ")}`,
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
      const { error: deleteError } = await db.from("trial_mod_log_jobs").delete()
        .eq("id", job.id).eq("lease_id", job.lease_id);
      if (deleteError) return { sent, failed: true };
      sent++;
    }
    return { sent, failed: false };
  } catch {
    // Fetch errors can contain the webhook URL.
    return { sent, failed: true };
  }
}
