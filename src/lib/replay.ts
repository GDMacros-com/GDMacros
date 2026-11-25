import { checkGdr } from "./gdr";
import { checkGdr2 } from "./gdr2";

const invalidSilicate = { ok: false as const, error: "Choose a valid Silicate .slc replay file." };

/** Read the SLC v2/v3 container markers and tick rate without parsing its actions. */
export function readSilicateHeader(bytes: Uint8Array): { version: number; tps: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  let version: number;
  let tps: number;
  if (bytes.length >= 75 && text(0, 8) === "SLC3RPLY"
      && view.getUint16(8, true) === 64 && bytes.at(-1) === 0xcc) {
    version = 3;
    tps = view.getFloat64(10, true);
  } else if (bytes.length >= 39 && text(0, 4) === "SILL" && text(bytes.length - 3, bytes.length) === "EOM"
      && view.getBigUint64(12, true) <= BigInt(bytes.length - 39)) {
    version = 2;
    tps = view.getFloat64(4, true);
  } else {
    return null;
  }
  return Number.isFinite(tps) && tps > 0 ? { version, tps } : null;
}

export function checkReplay(bytes: Uint8Array, recorder: string) {
  if (recorder === "Silicate") return readSilicateHeader(bytes) ? { ok: true as const } : invalidSilicate;
  return recorder === "zBot" ? checkGdr(bytes) : checkGdr2(bytes);
}
