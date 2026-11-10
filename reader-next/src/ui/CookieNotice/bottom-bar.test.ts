import { afterEach, describe, expect, it, vi } from "vitest";
import { reserveBottomBar } from "./bottom-bar";

afterEach(() => vi.unstubAllGlobals());

// @feature GUI-007 (master #3948, static/js/tests/launcherOffset.test.js)
describe("reserveBottomBar", () => {
  it("publishes the bar's height as --bottom-bar-height and --lc-launcher-bottom-offset, and gives it back", () => {
    let cb: () => void = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class { constructor(f: () => void) { cb = f; } observe() {} disconnect() { disconnect(); } });
    const el = document.createElement("div");
    Object.defineProperty(el, "offsetHeight", { value: 101 });
    const root = document.createElement("html");
    const release = reserveBottomBar(el, root);
    cb();
    expect(root.style.getPropertyValue("--bottom-bar-height")).toBe("101px");
    expect(root.style.getPropertyValue("--lc-launcher-bottom-offset")).toBe("101px");
    release();
    expect(disconnect).toHaveBeenCalled();
    expect(root.style.getPropertyValue("--bottom-bar-height")).toBe("");
    expect(root.style.getPropertyValue("--lc-launcher-bottom-offset")).toBe("");
  });
  it("does nothing without an element", () => {
    expect(reserveBottomBar(null)()).toBeUndefined();
  });
});
