import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadRecording, loadRecording, MAX_RECORDING_BYTES, recordingFileName, serializeRecording } from "./file";
import { makeRecording, snap } from "./test-helpers";

const sample = () =>
  makeRecording(
    [
      { type: "keyframe", t: 0, snapshot: snap("/Genesis.1") },
      { type: "change", t: 120, change: { url: "/Genesis.2" } },
      { type: "keyframe", t: 300, snapshot: snap("/Genesis.2") },
    ],
    400,
  );

describe("recordingFileName", () => {
  it("names the file by the local start time", () => {
    expect(recordingFileName(sample())).toBe("sefaria-recording-2026-11-01-1432.json");
  });
  it("falls back when startedAt is not a date", () => {
    expect(recordingFileName({ ...sample(), startedAt: "nope" })).toBe("sefaria-recording.json");
  });
});

describe("loadRecording", () => {
  it("round-trips a string, a Blob and a File", async () => {
    const rec = sample();
    const text = serializeRecording(rec);
    for (const input of [text, new Blob([text]), new File([text], "r.json")]) {
      const out = await loadRecording(input);
      expect(out).toEqual({ recording: rec });
    }
  });

  const rejects = async (input: string | Blob, match: RegExp) => {
    const out = await loadRecording(input);
    expect("error" in out && out.error).toMatch(match);
  };

  it("rejects files over 20 MB without reading them", async () => {
    const big = new Blob([new Uint8Array(MAX_RECORDING_BYTES + 1)]);
    await rejects(big, /too large/);
    await rejects("x".repeat(MAX_RECORDING_BYTES + 1), /too large/);
  });

  it("rejects text that is not JSON", async () => {
    await rejects("{not json", /not JSON/);
  });

  it("rejects JSON that is not a recording", async () => {
    await rejects(JSON.stringify({ hello: "world" }), /not a valid recording/);
  });

  it("rejects messages out of time order", async () => {
    const rec = sample();
    rec.messages[1] = { ...rec.messages[1]!, t: 500 };
    await rejects(serializeRecording(rec), /out of order/);
  });

  it("rejects a first message that is not a keyframe", async () => {
    const rec = makeRecording([
      { type: "change", t: 0, change: { url: "/Genesis.2" } },
      { type: "keyframe", t: 10, snapshot: snap("/Genesis.2") },
    ]);
    await rejects(serializeRecording(rec), /keyframe/);
  });

  it("rejects seq that does not increase by one", async () => {
    const rec = sample();
    rec.messages[2] = { ...rec.messages[2]!, seq: 5 };
    await rejects(serializeRecording(rec), /missing messages/);
  });

  it("rejects an empty recording", async () => {
    await rejects(serializeRecording(makeRecording([])), /empty|not a valid/);
  });
});

describe("downloadRecording", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("returns false where object URLs are unavailable", () => {
    const original = URL.createObjectURL;
    // @ts-expect-error -- simulate an environment without object URLs
    URL.createObjectURL = undefined;
    try {
      expect(downloadRecording(sample())).toBe(false);
    } finally {
      URL.createObjectURL = original;
    }
  });

  it("clicks a temporary download link and revokes its URL", () => {
    vi.useFakeTimers();
    const create = vi.fn(() => "blob:fake");
    const revoke = vi.fn();
    const originals = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    let clicked: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked = this;
    });
    try {
      expect(downloadRecording(sample())).toBe(true);
      expect(create).toHaveBeenCalledWith(expect.any(Blob));
      expect(clicked).not.toBeNull();
      expect(clicked!.download).toBe("sefaria-recording-2026-11-01-1432.json");
      expect(clicked!.isConnected).toBe(false);
      vi.runAllTimers();
      expect(revoke).toHaveBeenCalledWith("blob:fake");
    } finally {
      URL.createObjectURL = originals.create;
      URL.revokeObjectURL = originals.revoke;
    }
  });
});
