// Ported from Sefaria-Project static/js/auth/tests/GoogleOneTap.test.js
// @feature ACC-002 @feature ACC-013 @feature ANL-013
import { act, renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../test/msw/server";

const a = vi.hoisted(() => ({ fireFlowStarted: vi.fn(), fireMethodChosen: vi.fn(), fireProcessStarted: vi.fn(), fireProcessEnded: vi.fn(), fireFlowEnded: vi.fn() }));
const uuid = vi.hoisted(() => ({ n: 0 }));
vi.mock("~/lib/auth/analytics", async (orig) => ({ ...(await orig<typeof import("~/lib/auth/analytics")>()), ...a }));
vi.mock("~/lib/auth/utils", async (orig) => ({ ...(await orig<typeof import("~/lib/auth/utils")>()), makeUuid: () => `id-${++uuid.n}` }));
const { useGoogleOneTap } = await import("./use-google-one-tap");

let gis: { initialize: ReturnType<typeof vi.fn>; renderButton: ReturnType<typeof vi.fn>; prompt: ReturnType<typeof vi.fn> };
let reload: ReturnType<typeof vi.fn>;
const mount = (enabled = true) => renderHook(() => useGoogleOneTap({ googleClientId: "gid", enabled, reload: reload as never }));
const flush = () => act(() => void vi.advanceTimersByTime(1200));
const credential = () => gis.initialize.mock.calls[0]![0].callback as (r: { credential: string }) => Promise<void>;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  Object.values(a).forEach((f) => f.mockClear());
  uuid.n = 0;
  sessionStorage.clear();
  reload = vi.fn();
  gis = { initialize: vi.fn(), renderButton: vi.fn(), prompt: vi.fn() };
  window.google = { accounts: { id: gis as never } };
  window.history.pushState({}, "", "/");
});
afterEach(() => {
  vi.useRealTimers();
  delete window.google;
  document.querySelectorAll("[data-interruptive-ui]").forEach((e) => e.remove());
});

describe("credential callback (the reader picked an account)", () => {
  it("fires flow_started / method_chosen / process_started before the request answers", () => {
    server.use(http.post("*/_allauth/browser/v1/auth/provider/token", () => new Promise(() => {})));
    mount();
    flush();
    act(() => void credential()({ credential: "tok" }));
    expect(a.fireFlowStarted).toHaveBeenCalledWith("id-1", "one_tap");
    expect(a.fireMethodChosen).toHaveBeenCalledWith("id-1", "id-2", "google_one_tap");
    expect(a.fireProcessStarted).toHaveBeenCalledWith("id-1", "id-2");
    expect(a.fireProcessEnded).not.toHaveBeenCalled();
  });
  it("success: process and flow end as success, then the page reloads", async () => {
    server.use(http.post("*/_allauth/browser/v1/auth/provider/token", () => HttpResponse.json({})));
    mount();
    flush();
    await act(async () => credential()({ credential: "tok" }));
    expect(a.fireProcessEnded).toHaveBeenCalledWith("id-1", "id-2", "success", null);
    expect(a.fireFlowEnded).toHaveBeenCalledWith("id-1", "success", null);
    expect(reload).toHaveBeenCalled();
  });
  it("refused: failure with the server's error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.post("*/_allauth/browser/v1/auth/provider/token", () => HttpResponse.json({ error: "invalid_token" }, { status: 400 })));
    mount();
    flush();
    await act(async () => credential()({ credential: "tok" }));
    expect(a.fireProcessEnded).toHaveBeenCalledWith("id-1", "id-2", "failure", "invalid_token");
    expect(a.fireFlowEnded).toHaveBeenCalledWith("id-1", "failure", "invalid_token");
    expect(reload).not.toHaveBeenCalled();
  });
  it("network failure: network_error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.post("*/_allauth/browser/v1/auth/provider/token", () => HttpResponse.error()));
    mount();
    flush();
    await act(async () => credential()({ credential: "tok" }));
    expect(a.fireProcessEnded).toHaveBeenCalledWith("id-1", "id-2", "failure", "network_error");
  });
});

describe("when it shows", () => {
  it("nothing fires if the reader never engages", () => {
    mount();
    flush();
    expect(a.fireFlowStarted).not.toHaveBeenCalled();
    expect(gis.prompt).toHaveBeenCalledWith(expect.any(Function));
    expect(sessionStorage.getItem("sefaria_interruptive_ui_shown")).toBe("1");
  });
  it("never on /login or /register, even if navigated there during the delay", () => {
    window.history.pushState({}, "", "/login");
    mount();
    flush();
    expect(gis.initialize).not.toHaveBeenCalled();
    window.history.pushState({}, "", "/");
    const h = mount();
    act(() => window.history.pushState({}, "", "/register"));
    flush();
    expect(gis.prompt).not.toHaveBeenCalled();
    h.unmount();
  });
  it("still shows after navigating somewhere that is not an auth page", () => {
    mount();
    act(() => window.history.pushState({}, "", "/Genesis.1"));
    flush();
    expect(gis.prompt).toHaveBeenCalled();
  });
  it("once per session, not for signed-in readers, and not over the cookie notice", () => {
    sessionStorage.setItem("sefaria_interruptive_ui_shown", "1");
    mount();
    flush();
    expect(gis.prompt).not.toHaveBeenCalled();
    sessionStorage.clear();
    mount(false);
    flush();
    expect(gis.prompt).not.toHaveBeenCalled();
    const notice = document.createElement("div");
    notice.setAttribute("data-interruptive-ui", "");
    document.body.appendChild(notice);
    mount();
    flush();
    expect(gis.prompt).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("sefaria_interruptive_ui_shown")).toBe("1");
  });
  it("waits for google-identity-loaded when the SDK is not there yet", () => {
    delete window.google;
    mount();
    flush();
    window.google = { accounts: { id: gis as never } };
    act(() => void window.dispatchEvent(new Event("google-identity-loaded")));
    flush();
    expect(gis.prompt).toHaveBeenCalled();
  });
});
