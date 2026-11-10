import { afterEach, describe, expect, it, vi } from "vitest";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act } from "react";
import { installPageMonitoring, pageContext } from "./browser";
import { pageReporter, setPageReporter, type ErrorReport } from "./error-reporter";

afterEach(() => {
  setPageReporter(null);
  vi.unstubAllGlobals();
});

const beaconsTo = (endpoint: string) => {
  const sent: ErrorReport[] = [];
  // the beacon's body as the reporter built it (jsdom's Blob cannot be read back)
  vi.stubGlobal("Blob", class { constructor(readonly parts: string[]) {} });
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: (url: string, blob: { parts: string[] }) => (url === endpoint && sent.push(JSON.parse(blob.parts[0]!)), true) });
  return sent;
};
const flush = () => new Promise((r) => setTimeout(r, 20));

// @feature ANL-017
describe("the page's reporter, installed before React", () => {
  it("catches an error thrown before the shell's Monitoring has mounted, with the signed-in flag set later", async () => {
    setPageReporter(null);
    const sent = beaconsTo("/__errors");
    const win = new EventTarget() as unknown as Window;
    installPageMonitoring(win, { errorEndpoint: "/__errors", release: "v1" });
    expect(pageReporter()?.enabled).toBe(true);
    // nothing has rendered yet: an early error
    win.dispatchEvent(new ErrorEvent("error", { error: new Error("early boom") }));
    pageContext.signedIn = true; // what Monitoring does once it mounts
    win.dispatchEvent(new ErrorEvent("error", { error: new Error("later boom") }));
    await flush();
    expect(sent.map((s) => [s.message, s.signedIn])).toEqual([["Error: early boom", false], ["Error: later boom", true]]);
    pageContext.signedIn = false;
  });

  it("a real hydration mismatch, as React 19 reports it, is sent as kind hydration", async () => {
    setPageReporter(null);
    const sent = beaconsTo("/__errors");
    const win = new EventTarget() as unknown as Window;
    installPageMonitoring(win, { errorEndpoint: "/__errors", release: "v1" });
    const container = document.createElement("div");
    container.innerHTML = renderToString(<p>server text</p>);
    // React's default onRecoverableError is window.reportError, which dispatches an ErrorEvent on window: done here on the stand-in
    await act(async () => {
      hydrateRoot(container, <p>client text</p>, { onRecoverableError: (error) => void win.dispatchEvent(new ErrorEvent("error", { error })) });
    });
    await flush();
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0]!.kind).toBe("hydration");
  });
});
