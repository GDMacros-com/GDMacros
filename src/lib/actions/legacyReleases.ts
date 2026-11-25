"use server";

import { isCurrentUserAdmin } from "@/lib/admin";
import { isPublisherConfigured } from "@/lib/github/config";
import { renameLegacyReleases } from "@/lib/github/releases";

export async function renameLegacyReleaseBatch() {
  if (!(await isCurrentUserAdmin())) return { error: "You do not have permission to rename releases." };
  if (!isPublisherConfigured) return { error: "The GitHub publisher is unavailable." };
  try {
    return await renameLegacyReleases();
  } catch (error) {
    console.error("[legacy releases] publisher failed", error);
    return { error: "GitHub could not finish the batch. Try again to resume the rename." };
  }
}
