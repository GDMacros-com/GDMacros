const archiveDownloadRoot =
  "https://github.com/GDMacros-com/GDMacros-downloads/releases/download/";

export function legacyReleaseTag(tag: string): string | null {
  return /^level-\d{1,12}$/.test(tag) ? `legacy-${tag}` : null;
}

export function legacyReleaseDownload(url: string): string | null {
  if (!url.startsWith(archiveDownloadRoot)) return null;
  const [tag, file, ...extra] = url.slice(archiveDownloadRoot.length).split("/");
  const newTag = legacyReleaseTag(tag);
  return newTag && file && !extra.length ? `${archiveDownloadRoot}${newTag}/${file}` : null;
}
