/**
 * Recordings as files: serialize, download, and load back. A loaded file is input from outside — someone else may have made it, or edited
 * it — so it is parsed with the core schema and then checked for the stream's own invariants before the player ever sees it.
 */
import { parseRecording } from "~/lib/reader-state/core/schema";
import type { Recording, StreamMessage } from "~/lib/reader-state/core/types";

/** Larger than any honest recording (hours of reading); refused before parsing so a huge file cannot stall the tab. */
export const MAX_RECORDING_BYTES = 20 * 1024 * 1024;

export function serializeRecording(rec: Recording): string {
  return JSON.stringify(rec);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "sefaria-recording-2026-11-01-1432.json", in the person's local time (it is their file, named for when they made it). */
export function recordingFileName(rec: Recording): string {
  const d = new Date(rec.startedAt);
  if (Number.isNaN(d.getTime())) return "sefaria-recording.json";
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `sefaria-recording-${date}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

/**
 * Save the recording as a file through a temporary <a download>. Returns false where that is impossible (server rendering, or an
 * environment without object URLs such as jsdom), so callers can say so instead of failing silently.
 */
export function downloadRecording(rec: Recording): boolean {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return false;
  const blob = new Blob([serializeRecording(rec)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = recordingFileName(rec);
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    // Revoked on the next task: some browsers start the download asynchronously after click().
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return true;
}

function readBlob(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsText(blob);
  });
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** The stream invariants the schema cannot express: a keyframe first, seq +1 per message, t never going back. */
export function checkRecording(rec: Recording): string | null {
  const msgs = rec.messages;
  const first = msgs[0];
  if (!first) return "The recording is empty.";
  if (first.type !== "keyframe") return "The recording does not start with a keyframe.";
  let prev: StreamMessage = first;
  for (const m of msgs.slice(1)) {
    if (m.t < prev.t) return "The recording's messages are out of order.";
    if (m.seq !== prev.seq + 1) return "The recording is missing messages.";
    prev = m;
  }
  return null;
}

export async function loadRecording(file: File | Blob | string): Promise<{ recording: Recording } | { error: string }> {
  let text: string;
  if (typeof file === "string") {
    if (byteLength(file) > MAX_RECORDING_BYTES) return { error: "The file is too large to be a recording." };
    text = file;
  } else {
    if (file.size > MAX_RECORDING_BYTES) return { error: "The file is too large to be a recording." };
    try {
      text = await readBlob(file);
    } catch {
      return { error: "The file could not be read." };
    }
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { error: "The file is not a recording (not JSON)." };
  }

  const recording = parseRecording(json);
  if (!recording) return { error: "The file is not a valid recording." };
  const problem = checkRecording(recording);
  if (problem) return { error: problem };
  return { recording };
}
