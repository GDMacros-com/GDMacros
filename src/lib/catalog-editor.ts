import { RECORDERS, type LevelInput, type MacroInput } from "./types";
import { parseFps } from "./fps";

export type EditorFields = {
  name: string; creator: string; levelId: string; slug: string;
  description: string; video: string; thumbnail: string; addedAt: string;
  author: string; recorder: string; fps: string;
  downloadType: string; downloadLink: string; testedAt: string;
};
export const editorSlug = (name: string) => name.toLowerCase().normalize("NFKD")
  .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function validDate(value: string, today = new Date().toISOString().slice(0, 10)): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function editorFields(level: LevelInput, macro: MacroInput): EditorFields {
  return { name:level.name, creator:level.creator, levelId:String(level.levelId),
    slug:level.slug || editorSlug(level.name), description:level.description || "",
    video:level.video || "", thumbnail:level.thumbnail || "", addedAt:level.addedAt || "",
    author:macro.author, recorder:macro.recorder, fps:String(macro.fps),
    downloadType:macro.downloadType, downloadLink:macro.downloadLink, testedAt:macro.testedAt || "" };
}
function httpsUrl(value: string): boolean {
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password && !!u.hostname; }
  catch { return false; }
}
export function validateEditor(value: unknown, oldThumbnail = ""): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "The edit is not valid.";
  const fields = value as EditorFields;
  const limits: Record<keyof EditorFields, number> = {
    name:100, creator:50, levelId:12, slug:150, description:5000, video:500,
    thumbnail:1000, addedAt:10, author:50, recorder:20, fps:100,
    downloadType:50, downloadLink:2000, testedAt:10,
  };
  for (const [key, limit] of Object.entries(limits)) {
    const v = fields[key as keyof EditorFields];
    if (typeof v !== "string" || v.length > limit || (/[\u0000-\u0008]/.test(v) || /<\/?[a-z][^>]*>/i.test(v))) return `Check ${key}; it is missing, too long or contains unsupported characters.`;
  }
  for (const key of ["name", "creator", "author", "downloadType"] as const) if (!fields[key].trim()) return `Enter ${key}.`;
  if (!/^(?:0|[1-9][0-9]{0,11})$/.test(fields.levelId)) return "Enter a numeric level ID.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.slug)) return "Use lowercase letters, numbers and hyphens for the page URL.";
  if (!RECORDERS.includes(fields.recorder as MacroInput["recorder"])) return "Choose a supported recorder.";
  if (parseFps(fields.fps) === null) return "Enter a positive recording FPS.";
  if (!httpsUrl(fields.downloadLink)) return "Use a complete HTTPS download link without credentials.";
  if (fields.video) {
    if (!httpsUrl(fields.video)) return "Use an HTTPS YouTube video link.";
    const url = new URL(fields.video);
    const id = url.hostname === "youtu.be" ? url.pathname.slice(1) : url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)$/)?.[1];
    if (!["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname) || !id || !/^[\w-]{11}$/.test(id)) return "Use a complete YouTube video link.";
  }
  if (fields.thumbnail && fields.thumbnail !== oldThumbnail && !httpsUrl(fields.thumbnail)) return "Use an HTTPS thumbnail link, or leave it blank for the video thumbnail.";
  for (const key of ["addedAt", "testedAt"] as const) if (fields[key] && !validDate(fields[key])) return `Enter a real ${key} date that is not in the future.`;
  return null;
}
/** Indices refer to the exact snapshot checked by the caller's whole-file SHA. */
export function editCatalog(text: string, levelIndex: number, macroIndex: number,
  operation: "save" | "remove", fields?: EditorFields): string {
  const levels: LevelInput[] = JSON.parse(text);
  if (!Array.isArray(levels) || !Number.isInteger(levelIndex) || !Number.isInteger(macroIndex)
    || levelIndex < 0 || macroIndex < 0) throw new Error("Choose a macro from the current catalog.");
  const level = levels[levelIndex];
  const macro = level?.macros?.[macroIndex];
  if (!level || !macro) throw new Error("That macro no longer exists. Reload the catalog.");
  if (operation === "remove") {
    level.macros!.splice(macroIndex, 1);
    if (!level.macros!.length) levels.splice(levelIndex, 1);
  } else if (operation === "save") {
    const error = validateEditor(fields, level.thumbnail);
    if (error || !fields) throw new Error(error || "Missing edit.");
    if (levels.some((other, i) => i !== levelIndex &&
      (String(other.levelId) === fields.levelId || (other.slug || editorSlug(other.name)) === fields.slug))) {
      throw new Error("Another level already uses that ID or page URL.");
    }
    Object.assign(level, { name:fields.name.trim(), creator:fields.creator.trim(), levelId:fields.levelId, slug:fields.slug });
    for (const key of ["description", "video", "thumbnail", "addedAt"] as const) {
      const value = fields[key].trim();
      if (value) level[key] = value; else delete level[key];
    }
    Object.assign(macro, { author:fields.author.trim(), recorder:fields.recorder,
      fps:parseFps(fields.fps), downloadType:fields.downloadType.trim(), downloadLink:fields.downloadLink,
      testedAt:fields.testedAt || null });
  } else throw new Error("Unknown operation.");
  return JSON.stringify(levels, null, 2) + "\n";
}
