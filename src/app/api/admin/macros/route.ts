import { NextResponse, type NextRequest } from "next/server";
import { isCurrentUserAdmin } from "@/lib/admin";
import { getCatalogFile, commitCatalog, isConcurrencyConflict } from "@/lib/github/contents";
import { isPublisherConfigured } from "@/lib/github/config";
import { createLevelRelease, getReleaseByTag, uploadMacroAsset, sha256Hex } from "@/lib/github/releases";
import { assetBaseName, releaseTagFor } from "@/lib/publish/assetName";
import { editCatalog, type EditorFields } from "@/lib/catalog-editor";
import { macroFileExtension } from "@/lib/types";
import { MAX_FILE_BYTES, validateFile } from "@/lib/submissions";
import { checkGdr } from "@/lib/gdr";
import { checkGdr2 } from "@/lib/gdr2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const bad = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function GET() {
  if (!(await isCurrentUserAdmin())) return bad(403, "Only admins can edit published macros.");
  if (!isPublisherConfigured) return bad(503, "The catalog editor is not configured.");
  try {
    const catalog = await getCatalogFile();
    return NextResponse.json({ sha: catalog.sha, levels: JSON.parse(catalog.text) },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch { return bad(502, "The current catalog could not be loaded. Try again."); }
}

export async function POST(request: NextRequest) {
  // Check origin as well as fresh server-side roles; never rely on hidden UI.
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return bad(403, "Reload this page and try again.");
  if (!(await isCurrentUserAdmin())) return bad(403, "Only admins can edit published macros.");
  if (!isPublisherConfigured) return bad(503, "The catalog editor is not configured.");
  if (Number(request.headers.get("content-length")) > MAX_FILE_BYTES + 64 * 1024) return bad(413, "The file limit is 2 MB.");
  let form: FormData;
  try { form = await request.formData(); } catch { return bad(400, "The upload could not be read."); }
  if (form.get("confirmed") !== "yes") return bad(400, "Review and confirm the change first.");
  const sha = String(form.get("sha") ?? "");
  const levelIndex = Number(form.get("levelIndex"));
  const macroIndex = Number(form.get("macroIndex"));
  const operation = form.get("operation");
  if (!/^[a-f0-9]{40}$/.test(sha) || !form.has("levelIndex") || !form.has("macroIndex")
    || (operation !== "save" && operation !== "remove")) return bad(400, "The edit is not valid.");
  let fields: EditorFields | undefined;
  if (operation === "save") {
    const raw = form.get("fields");
    if (typeof raw !== "string" || raw.length > 16000) return bad(400, "The edit is too large.");
    try { fields = JSON.parse(raw); } catch { return bad(400, "The edit could not be read."); }
  }
  try {
    const current = await getCatalogFile();
    if (current.sha !== sha) return bad(409, "The catalog changed while you were editing. Reload it and review your change again.");
    let updated: string;
    try { updated = editCatalog(current.text, levelIndex, macroIndex, operation, fields); }
    catch (error) { return bad(400, error instanceof Error ? error.message : "Check the edit."); }
    const file = form.get("file");
    if (operation === "save" && fields && file instanceof File && file.size) {
      const fileError = validateFile(file, fields.recorder);
      if (fileError) return bad(400, fileError);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_FILE_BYTES) return bad(400, "The file limit is 2 MB.");
      const checked = fields.recorder === "zBot" ? checkGdr(bytes) : checkGdr2(bytes);
      if (!checked.ok) return bad(400, checked.error || "The replacement is not a valid replay file.");
      // Content-addressed replacement: never overwrite or delete the old asset.
      // A retry reuses this upload, including after a failed catalog commit.
      const tag = releaseTagFor(fields.levelId);
      const release = await getReleaseByTag(tag) ?? await createLevelRelease(tag, fields.name, fields.levelId);
      const name = `${assetBaseName({ macroAuthor:fields.author, levelName:fields.name, recorder:fields.recorder })}-edit-${sha256Hex(bytes)}${macroFileExtension(fields.recorder)}`;
      const result = await uploadMacroAsset(release.id, name, bytes);
      if ("taken" in result) return bad(409, "A conflicting file exists. Reload and try again.");
      fields = { ...fields, downloadType:"GitHub", downloadLink:result.asset.browser_download_url };
      updated = editCatalog(current.text, levelIndex, macroIndex, operation, fields);
    } else if (file instanceof File && file.name && !file.size) {
      return bad(400, "The replacement file is empty.");
    }
    if (updated === current.text) return NextResponse.json({ unchanged:true });
    // Roles can be revoked while a replacement uploads. Recheck before committing.
    if (!(await isCurrentUserAdmin())) return bad(403, "Your admin access changed. The catalog was not updated.");
    const result = await commitCatalog(updated, current.sha,
      `${operation === "remove" ? "Remove" : "Update"} macro through admin catalog editor`);
    return NextResponse.json({ commitSha: result.commitSha });
  } catch (error) {
    if (isConcurrencyConflict(error)) return bad(409, "Another catalog change was saved first. Reload and review again.");
    return bad(502, "GitHub could not confirm this change. Reload the catalog before retrying; it may already have saved. Replacement uploads are retained for safe retries.");
  }
}
