// Ported from Sefaria-Project static/js/auth/tests/useSsoSignIn.test.js
// @feature ACC-012 @feature ANL-013
import { act, render } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../test/msw/server";

const redirect = vi.hoisted(() => ({ on: false }));
const persisted = vi.hoisted(() => vi.fn());
vi.mock("~/lib/auth/sdk", async (orig) => ({ ...(await orig<typeof import("~/lib/auth/sdk")>()), ssoUseRedirect: () => redirect.on }));
vi.mock("~/lib/auth/analytics", async (orig) => ({ ...(await orig<typeof import("~/lib/auth/analytics")>()), persistPendingAttempt: persisted }));
const { useProviderTriggers } = await import("./use-provider-triggers");
type Api = ReturnType<typeof useProviderTriggers>;

let api: Api;
let tracking: { chooseMethod: ReturnType<typeof vi.fn>; startProcess: ReturnType<typeof vi.fn>; endProcess: ReturnType<typeof vi.fn>; getIds: () => { flowId: string }; suppressFlowEndRef: { current: boolean } };
let navigate: ReturnType<typeof vi.fn>;
let gis: { initialize: ReturnType<typeof vi.fn>; renderButton: ReturnType<typeof vi.fn>; prompt: ReturnType<typeof vi.fn> };

function Harness({ apple }: { apple?: string }) {
  api = useProviderTriggers({ next: "/Genesis.1", tracking: tracking as never, googleClientId: "gid", appleClientId: apple, navigate: navigate as never });
  return (
    <>
      <div data-testid="google-target" ref={api.registerGoogleTarget} />
      {api.overlayNode}
    </>
  );
}
const mount = (apple?: string) => render(<Harness apple={apple} />);
const clickListener = () => gis.renderButton.mock.calls[0]![1].click_listener as () => void;
const initConfig = () => gis.initialize.mock.calls[0]![0] as Record<string, unknown> & { callback: (r: { credential: string }) => Promise<void> };

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  redirect.on = false;
  persisted.mockClear();
  gis = { initialize: vi.fn(), renderButton: vi.fn(), prompt: vi.fn() };
  window.google = { accounts: { id: gis as never } };
  navigate = vi.fn();
  tracking = { chooseMethod: vi.fn(() => "attempt-1"), startProcess: vi.fn(), endProcess: vi.fn(), getIds: () => ({ flowId: "flow-1" }), suppressFlowEndRef: { current: false } };
  document.cookie = "csrftoken=tok; path=/";
});
afterEach(() => {
  vi.useRealTimers();
  delete window.google;
  delete window.AppleID;
});

describe("Google button", () => {
  it("is rendered with the old options (FedCM opt-in, popup on desktop, locale)", () => {
    mount();
    expect(initConfig()).toMatchObject({ client_id: "gid", ux_mode: "popup", use_fedcm_for_button: true });
    expect(gis.renderButton.mock.calls[0]![1]).toMatchObject({ type: "standard", theme: "outline", size: "large", text: "continue_with", locale: "en" });
    expect(api.googleReady).toBe(true);
  });
  it("redirect mode (phones): login_uri and the sefaria_sso_next cookie, still FedCM", () => {
    redirect.on = true;
    mount();
    expect(initConfig()).toMatchObject({ ux_mode: "redirect", use_fedcm_for_button: true, login_uri: `${window.location.origin}/api/auth/google/redirect` });
  });
  it("the click fires chooseMethod/startProcess; popup mode persists nothing", () => {
    mount();
    act(() => clickListener()());
    expect(tracking.chooseMethod).toHaveBeenCalledWith("google");
    expect(tracking.startProcess).toHaveBeenCalled();
    expect(persisted).not.toHaveBeenCalled();
    expect(tracking.suppressFlowEndRef.current).toBe(false);
  });
  it("redirect mode persists a pending attempt and suppresses the flow end", () => {
    redirect.on = true;
    mount();
    act(() => clickListener()());
    expect(persisted).toHaveBeenCalledWith({ flowId: "flow-1", attemptId: "attempt-1", method: "google" });
    expect(tracking.suppressFlowEndRef.current).toBe(true);
  });
  it("a credential is posted to allauth's provider-token endpoint; success goes to next", async () => {
    let body: unknown;
    server.use(http.post("*/_allauth/browser/v1/auth/provider/token", async ({ request }) => {
      body = await request.json();
      expect(request.headers.get("x-csrftoken")).toBe("tok");
      return HttpResponse.json({});
    }));
    mount();
    act(() => clickListener()());
    await act(async () => initConfig().callback({ credential: "cred" }));
    expect(body).toEqual({ provider: "google", process: "login", token: { client_id: "gid", id_token: "cred" } });
    expect(tracking.chooseMethod).toHaveBeenCalledTimes(1);
    expect(tracking.endProcess).toHaveBeenCalledWith("success", null);
    expect(navigate).toHaveBeenCalledWith("/Genesis.1");
  });
  it("a refused credential shows in the active view and ends the attempt as failure", async () => {
    server.use(http.post("*/_allauth/browser/v1/auth/provider/token", () => HttpResponse.json({ errors: [{ message: "bad token" }] }, { status: 400 })));
    const shown = vi.fn();
    mount();
    act(() => api.setActiveErrorHandler(shown));
    await act(async () => initConfig().callback({ credential: "cred" }));
    expect(shown).toHaveBeenCalledWith(expect.objectContaining({ message: "bad token" }));
    expect(tracking.endProcess).toHaveBeenCalledWith("failure", "bad token");
  });
});

describe("popup abandonment", () => {
  it("reports popup_closed_by_user once focus returns and nothing resolved", () => {
    mount();
    act(() => clickListener()());
    act(() => void window.dispatchEvent(new Event("focus")));
    act(() => void vi.advanceTimersByTime(1200));
    expect(tracking.endProcess).toHaveBeenCalledWith("failure", "popup_closed_by_user");
  });
  it("not while our own request is in flight", () => {
    server.use(http.post("*/_allauth/browser/v1/auth/provider/token", () => new Promise(() => {})));
    mount();
    act(() => clickListener()());
    act(() => void initConfig().callback({ credential: "t" }));
    act(() => void window.dispatchEvent(new Event("focus")));
    act(() => void vi.advanceTimersByTime(1200));
    expect(tracking.endProcess).not.toHaveBeenCalled();
  });
  it("a second click replaces the watch", () => {
    mount();
    act(() => clickListener()());
    act(() => clickListener()());
    act(() => void window.dispatchEvent(new Event("focus")));
    act(() => void vi.advanceTimersByTime(1200));
    expect(tracking.endProcess).toHaveBeenCalledTimes(1);
  });
  it("unmounting clears the watch", () => {
    const r = mount();
    act(() => clickListener()());
    r.unmount();
    act(() => void window.dispatchEvent(new Event("focus")));
    act(() => void vi.advanceTimersByTime(1200));
    expect(tracking.endProcess).not.toHaveBeenCalled();
  });
});

describe("placement of the real Google button", () => {
  it("portals it into the registered target, follows the target, and leaves nothing without one", () => {
    const r = mount();
    const target = r.getByTestId("google-target");
    expect(target.querySelector("[data-provider-sdk-overlay]")).not.toBeNull();
    const other = document.createElement("div");
    document.body.appendChild(other);
    act(() => api.registerGoogleTarget(other));
    expect(other.querySelector("[data-provider-sdk-overlay]")).not.toBeNull();
    act(() => api.registerGoogleTarget(null));
    expect(document.querySelector("[data-provider-sdk-overlay]")).toBeNull();
  });
});

describe("Apple", () => {
  it("popup: init with the old options; triggerApple calls signIn; a refusal from our endpoint shows the generic error", async () => {
    const signIn = vi.fn(() => new Promise(() => {}));
    const init = vi.fn();
    window.AppleID = { auth: { init, signIn } };
    const shown = vi.fn();
    mount("org.example");
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ clientId: "org.example", scope: "name email", usePopup: true, redirectURI: `${window.location.origin}/accounts/apple/login/callback/` }));
    act(() => api.setActiveErrorHandler(shown));
    act(() => api.triggerApple());
    expect(signIn).toHaveBeenCalled();
    expect(tracking.chooseMethod).toHaveBeenCalledWith("apple");
    let body: unknown;
    server.use(http.post("*/api/auth/apple/callback", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ error: "auth.social_signin_failed" }, { status: 400 });
    }));
    await act(async () => {
      document.dispatchEvent(new CustomEvent("AppleIDSignInOnSuccess", { detail: { authorization: { id_token: "idt" }, user: { email: "a@b.org", name: { firstName: "A", lastName: "B" } } } }));
      await vi.waitFor(() => expect(shown).toHaveBeenCalled());
    });
    expect(body).toEqual({ id_token: "idt", first_name: "A", last_name: "B", email: "a@b.org" });
    expect(tracking.endProcess).toHaveBeenCalledWith("failure", "apple_callback_failed");
    expect(shown).toHaveBeenCalledWith(expect.objectContaining({ message: "auth.generic_error" }));
  });
  it("closing Apple's popup is tracked but shows nothing", () => {
    window.AppleID = { auth: { init: vi.fn(), signIn: vi.fn() } };
    const shown = vi.fn();
    mount("org.example");
    act(() => api.setActiveErrorHandler(shown));
    act(() => void document.dispatchEvent(new CustomEvent("AppleIDSignInOnFailure", { detail: { error: "popup_closed_by_user" } })));
    expect(tracking.endProcess).toHaveBeenCalledWith("failure", "popup_closed_by_user");
    expect(shown).not.toHaveBeenCalled();
  });
  it("redirect mode goes to allauth's Apple login with next", () => {
    redirect.on = true;
    mount("org.example");
    act(() => api.triggerApple());
    expect(persisted).toHaveBeenCalledWith({ flowId: "flow-1", attemptId: "attempt-1", method: "apple" });
    expect(navigate).toHaveBeenCalledWith("/accounts/apple/login/?next=%2FGenesis.1");
  });
});
