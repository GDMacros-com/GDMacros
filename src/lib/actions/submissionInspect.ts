"use server";

import { createHash } from "node:crypto";
import { isCurrentUserAdmin } from "@/lib/admin";
import { getUser, createClient } from "@/lib/supabase/server";
import { downloadSubmissionObject } from "@/lib/supabase/storage-admin";
import { readGdrMetadata } from "@/lib/gdr";
import { readGdr2Metadata } from "@/lib/gdr2";
import { getReleaseByTag, listReleaseAssets } from "@/lib/github/releases";
import { getAllLevels } from "@/lib/macros";
import {
  findExistingEntry,
  hasWarnings,
  reviewGdrFindings,
  reviewFindings,
  type Finding,
} from "@/lib/gdr2Review";

/**
 * Reading an uploaded macro's own header, for the reviewer.
 *
 * The file already sits in private Storage and only an admin can open it. This
 * reads the same bytes on the server and reports what the header says, so a
 * disagreement between the file and the form is visible BEFORE anything is
 * published rather than after a release asset already carries the wrong name.
 *
 * As everywhere else the server action is not the boundary: it checks the role,
 * the Storage helper is server-only and builds its own object path from two
 * validated uuids, and RLS decides which submission rows are visible at all.
 *
 * Read-only. It downloads and hashes; it never writes, never publishes, and
 * never changes a submission.
 */

export interface InspectResult {
  ok: boolean;
  error?: string;
  findings?: Finding[];
  warnings?: boolean;
  /** Set when the catalog already has this level and recorder. */
  existing?: { recorder: string; author: string } | null;
  /** Byte-for-byte comparison against published GitHub assets for this level. */
  duplicateCheck?:
    | {
        status: "match";
        assetName: string;
        downloadUrl: string;
        recorder: string | null;
        author: string | null;
      }
    | { status: "clear" }
    | { status: "unavailable" };
}

/**
 * Compares the upload with the immutable SHA-256 digests GitHub records on the
 * level's release assets. This answers a different question from the catalog
 * warning: the latter means "same level and recorder", while this means the
 * bytes themselves are identical.
 *
 * A missing digest never becomes a false "different" answer. In that case the
 * admin still sees the existing-entry warning and the hash from the file, but
 * the exact comparison is honestly marked unavailable.
 */
async function checkPublishedDuplicate(levelId: string, sha256: string): Promise<NonNullable<InspectResult["duplicateCheck"]>> {
  try {
    const release = await getReleaseByTag(`level-${levelId}`);
    if (!release) return { status: "clear" };

    const assets = await listReleaseAssets(release.id);
    const match = assets.find(
      (asset) => asset.digest?.toLowerCase() === `sha256:${sha256.toLowerCase()}`,
    );

    if (match) {
      const catalogMacro = getAllLevels()
        .flatMap((level) => level.macros)
        .find((macro) => macro.downloadLink === match.browser_download_url);
      return {
        status: "match",
        assetName: match.name,
        downloadUrl: match.browser_download_url,
        recorder: catalogMacro?.recorder ?? null,
        author: catalogMacro?.author ?? null,
      };
    }

    return assets.every((asset) => Boolean(asset.digest))
      ? { status: "clear" }
      : { status: "unavailable" };
  } catch {
    // Inspection remains useful if GitHub is temporarily unavailable or the
    // publisher is not configured on a local/preview deployment.
    return { status: "unavailable" };
  }
}

export async function inspectSubmission(id: string): Promise<InspectResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "Not authorised." };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };

  /*
   * The claim comes from the ROW, not from the caller. The browser sends a
   * submission id and nothing else, so a modified request cannot make this
   * compare the file against level details somebody made up.
   */
  const { data, error } = await supabase
    .from("submissions")
    .select("id,submitted_by,level_id,level_name,recorder,file_size")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return { ok: false, error: "That submission could not be read." };

  const file = await downloadSubmissionObject(data.submitted_by as string, data.id as string);
  if (!file.ok) return { ok: false, error: "The uploaded file could not be opened." };

  const recorder = String(data.recorder ?? "");
  const gdrMeta = recorder === "zBot" ? readGdrMetadata(file.bytes) : null;
  const gdr2Meta = recorder !== "zBot" ? readGdr2Metadata(file.bytes) : null;
  if (!gdrMeta && !gdr2Meta) {
    return {
      ok: false,
      error:
        "The header could not be read. The file passed the upload check, so this is worth opening by hand before publishing.",
    };
  }

  const sha256 = createHash("sha256").update(file.bytes).digest("hex");

  const claim = {
    levelId: String(data.level_id ?? ""),
    levelName: String(data.level_name ?? ""),
    recorder: String(data.recorder ?? ""),
  };

  const findings = gdrMeta
    ? reviewGdrFindings(gdrMeta, claim, file.bytes.byteLength, sha256)
    : reviewFindings(gdr2Meta!, claim, file.bytes.byteLength, sha256);
  const duplicateCheck = await checkPublishedDuplicate(claim.levelId, sha256);

  return {
    ok: true,
    findings,
    warnings: hasWarnings(findings) || duplicateCheck.status === "match",
    existing: findExistingEntry(
      getAllLevels() as unknown as Parameters<typeof findExistingEntry>[0],
      claim,
    ),
    duplicateCheck,
  };
}
