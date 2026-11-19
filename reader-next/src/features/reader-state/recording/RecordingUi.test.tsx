import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createSliceRegistry } from "~/lib/reader-state/core/registry";
import { serializeRecording } from "~/lib/reader-state/recording";
import { createFakeApi, makeRecording, snap } from "~/lib/reader-state/recording/test-helpers";
import { ReaderStateContext } from "../context";
import { useRecordSessionEntry } from "./entry";
import { recordingHandleFor } from "./handle";
import { RecordingUi } from "./RecordingUi";

const rec = makeRecording(
  [
    { type: "keyframe", t: 0, snapshot: snap("/Genesis.1") },
    { type: "keyframe", t: 10_000, snapshot: snap("/Genesis.2") },
  ],
  20_000,
);

/** Stands in for the display settings menu's entry. */
function Entry() {
  const entry = useRecordSessionEntry();
  return entry ? <button onClick={entry.onRecordSession}>Record session</button> : null;
}

/** The recording lab is on (remote config, as the root loader leaves it in the cache) unless `lab: false`. */
function setup({ lab = true } = {}) {
  const api = createFakeApi(snap("/Exodus.4"));
  const qc = new QueryClient();
  qc.setQueryData(["remote-config"], { "feature.reader.labs.recording": lab });
  render(
    <QueryClientProvider client={qc}>
      <ReaderStateContext.Provider value={{ api, registry: createSliceRegistry() }}>
        <Entry />
        <RecordingUi />
      </ReaderStateContext.Provider>
    </QueryClientProvider>,
  );
  return { api, handle: recordingHandleFor(api) };
}

describe("RecordingUi", () => {
  it("shows nothing but the hidden picker until there is something to show", () => {
    setup();
    expect(screen.queryByTestId("recording-dock")).toBeNull();
    expect(screen.getByTestId("recording-file-input")).toHaveAttribute("accept", ".json,application/json");
  });

  it("offers no menu entry while the recording lab is off", () => {
    setup({ lab: false });
    expect(screen.queryByRole("button", { name: "Record session" })).toBeNull();
  });

  it("loads nothing of the feature until it is used", () => {
    const { handle } = setup();
    expect(handle.controller()).toBeNull();
  });

  it("records from the entry, stops, and offers Download, Replay and Discard", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Record session" }));
    // The controller and the dock load on first use.
    expect(await screen.findByRole("region", { name: "Session recording" })).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "Elapsed time" })).toHaveTextContent(/^0:0\d$/);
    // the entry hides while recording: there is nothing for it to do
    expect(screen.queryByRole("button", { name: "Record session" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    for (const name of ["Download", "Replay", "Discard", "Load recording…"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByTestId("recording-dock")).toBeNull();
    expect(screen.getByRole("button", { name: "Record session" })).toBeInTheDocument();
  });

  it("loads a file from the picker into playback with a timeline, and exits back to the saved place", async () => {
    const { api } = setup();
    const file = new File([serializeRecording(rec)], "r.json", { type: "application/json" });
    await userEvent.upload(screen.getByTestId("recording-file-input"), file);
    const slider = await screen.findByRole("slider", { name: "Replay position" });
    expect(slider).toHaveAttribute("aria-valuemax", "20000");
    expect(document.querySelectorAll("[data-testid=timeline-marker]")).toHaveLength(2);
    await act(async () => {
      fireEvent.keyDown(slider, { key: "End" });
    });
    await waitFor(() => expect(api.applied.at(-1)?.snapshot.url).toBe("/Genesis.2"));
    await userEvent.click(screen.getByRole("button", { name: "Exit replay" }));
    await waitFor(() => expect(api.applied.at(-1)?.snapshot.url).toBe("/Exodus.4"));
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("shows why a dropped file would not load", async () => {
    const { handle } = setup();
    const c = await handle.load();
    act(() => {
      c.start();
      c.stop();
    });
    const dock = await screen.findByTestId("recording-dock");
    const bad = new File(["{}"], "bad.json", { type: "application/json" });
    fireEvent.drop(dock, { dataTransfer: { files: [bad], types: ["Files"] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("not a valid recording");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
