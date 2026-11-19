import { describe, expect, it, vi } from "vitest";
import { createFakeApi } from "~/lib/reader-state/recording/test-helpers";
import { createRecordingController } from "./controller";
import { createRecordingHandle, IDLE_RECORDING_STATE } from "./handle";

describe("recording handle", () => {
  it("is idle and loads nothing until asked; then loads the controller once and forwards its state", async () => {
    const api = createFakeApi();
    const controller = createRecordingController(api);
    const loadModule = vi.fn(async () => ({ recordingControllerFor: () => controller }));
    const h = createRecordingHandle(api, loadModule);
    expect(h.getState()).toBe(IDLE_RECORDING_STATE);
    expect(h.controller()).toBeNull();
    expect(loadModule).not.toHaveBeenCalled();

    const cb = vi.fn();
    h.subscribe(cb);
    const [a, b] = await Promise.all([h.load(), h.load()]);
    expect(a).toBe(controller);
    expect(b).toBe(controller);
    expect(loadModule).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledTimes(1);
    controller.start();
    expect(cb).toHaveBeenCalledTimes(2);
    expect(h.getState().view.mode).toBe("recording");
  });

  it("tries the import again after it failed", async () => {
    const api = createFakeApi();
    const loadModule = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ recordingControllerFor: () => createRecordingController(api) });
    const h = createRecordingHandle(api, loadModule);
    await expect(h.load()).rejects.toThrow("offline");
    await expect(h.load()).resolves.toBeTruthy();
  });

  it("opens the picker the dock registered, synchronously", () => {
    const h = createRecordingHandle(createFakeApi());
    const open = vi.fn();
    h.setFilePicker(open);
    h.pickFile();
    expect(open).toHaveBeenCalledTimes(1);
  });
});
