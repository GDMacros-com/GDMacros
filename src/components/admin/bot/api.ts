export async function botApi<T>(
  path: string,
  options?: { method?: string; data?: unknown },
): Promise<T> {
  const response = await fetch(`/api/admin/bot/${path}`, {
    method: options?.method ?? "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body:
      options?.data === undefined ? undefined : JSON.stringify(options.data),
  });
  const data = await response.json();
  if (!response.ok) {
    const issues = Array.isArray(data.issues)
      ? data.issues
          .map((i: { field: string; type: string }) => i.field || i.type)
          .join(", ")
      : "";
    throw new Error(
      (data.error || "The request could not be completed.") +
        (issues ? ` (${issues})` : ""),
    );
  }
  return data as T;
}
export const dateTime = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString();
