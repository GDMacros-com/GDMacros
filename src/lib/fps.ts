/** A recording rate, not a limit imposed by the catalog. */
export function isValidFps(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function parseFps(value: string): number | null {
  const text = value.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
  const fps = Number(text);
  return isValidFps(fps) ? fps : null;
}

export function fpsLabel(macros: readonly { fps: number }[]): string {
  const rates = [...new Set(macros.map(m => m.fps))];
  return rates.length === 1 ? `${rates[0]} FPS` : "Mixed FPS";
}
