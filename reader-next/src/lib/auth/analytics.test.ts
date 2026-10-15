// Ported from Sefaria-Project static/js/auth/tests/signupAnalytics.test.js
// @feature ANL-013 @feature ANL-002
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./utils", async (orig) => ({ ...(await orig<typeof import("./utils")>()), makeUuid: () => "generated-uuid" }));

const {
  SIGNUP_EVENT, SIGNUP_METHOD, SSO_REFERRER_ORIGIN, fireFlowStarted, persistPendingAttempt, persistActiveFlow, clearActiveFlow,
  clearPendingAttempt, resumePendingSignUpAttempt, trackAuthEvent,
} = await import("./analytics");

const PENDING_ATTEMPT_KEY = "sefaria_pending_sso_attempt";
const ACTIVE_FLOW_KEY = "sefaria_active_signup_flow";
const setReferrer = (value: string) => Object.defineProperty(document, "referrer", { value, configurable: true });
let gtag: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;

beforeEach(() => {
  sessionStorage.clear();
  gtag = vi.fn<(...args: unknown[]) => void>();
  window.gtag = gtag;
  setReferrer("");
});
afterEach(() => {
  delete window.gtag;
});

describe("trackAuthEvent / sendEvent", () => {
  it("calls gtag('event', name, params) exactly", () => {
    trackAuthEvent("x", { a: 1 });
    expect(gtag).toHaveBeenCalledWith("event", "x", { a: 1 });
  });
  it("merges the shared defaults with the call's params", () => {
    fireFlowStarted("flow-1", "nav_bar");
    expect(gtag).toHaveBeenCalledWith("event", SIGNUP_EVENT.FLOW_STARTED, {
      project: "site_registration",
      feature_name: "site_registration_form",
      transport_type: "beacon",
      flow_id: "flow-1",
      source: "nav_bar",
    });
  });
  it("is a no-op without gtag (ad blocker, development)", () => {
    delete window.gtag;
    expect(() => fireFlowStarted("flow-1", "nav_bar")).not.toThrow();
  });
});

describe("persistence", () => {
  it("persistPendingAttempt stores flowId/attemptId/method with a timestamp", () => {
    persistPendingAttempt({ flowId: "flow-1", attemptId: "attempt-1", method: SIGNUP_METHOD.APPLE });
    const stored = JSON.parse(sessionStorage.getItem(PENDING_ATTEMPT_KEY)!);
    expect(stored).toMatchObject({ flowId: "flow-1", attemptId: "attempt-1", method: "apple" });
    expect(typeof stored.ts).toBe("number");
    clearPendingAttempt();
    expect(sessionStorage.getItem(PENDING_ATTEMPT_KEY)).toBeNull();
    expect(() => clearPendingAttempt()).not.toThrow();
  });
  it("persistActiveFlow / clearActiveFlow", () => {
    persistActiveFlow({ flowId: "flow-2" });
    expect(JSON.parse(sessionStorage.getItem(ACTIVE_FLOW_KEY)!)).toMatchObject({ flowId: "flow-2" });
    clearActiveFlow();
    expect(sessionStorage.getItem(ACTIVE_FLOW_KEY)).toBeNull();
  });
});

describe("resumePendingSignUpAttempt", () => {
  it("a pending Apple attempt back from appleid.apple.com resolves as success and clears both keys", () => {
    persistPendingAttempt({ flowId: "flow-1", attemptId: "attempt-1", method: SIGNUP_METHOD.APPLE });
    persistActiveFlow({ flowId: "flow-1" });
    setReferrer(`${SSO_REFERRER_ORIGIN.APPLE}/auth/authorize`);
    resumePendingSignUpAttempt();
    expect(gtag).toHaveBeenCalledWith("event", SIGNUP_EVENT.PROCESS_ENDED, expect.objectContaining({ flow_id: "flow-1", attempt_id: "attempt-1", status: "success", error: null }));
    expect(gtag).toHaveBeenCalledWith("event", SIGNUP_EVENT.FLOW_ENDED, expect.objectContaining({ flow_id: "flow-1", status: "success", error: null }));
    expect(sessionStorage.getItem(PENDING_ATTEMPT_KEY)).toBeNull();
    expect(sessionStorage.getItem(ACTIVE_FLOW_KEY)).toBeNull();
  });
  it("a pending attempt from a non-provider referrer resolves as failure", () => {
    persistPendingAttempt({ flowId: "flow-1", attemptId: "attempt-1", method: SIGNUP_METHOD.APPLE });
    setReferrer("https://www.sefaria.org/some/other/page");
    resumePendingSignUpAttempt();
    expect(gtag).toHaveBeenCalledWith("event", SIGNUP_EVENT.FLOW_ENDED, expect.objectContaining({ status: "failure", error: "unexpected_return_without_provider_referrer" }));
  });
  it("ignores a pending attempt older than 10 minutes", () => {
    sessionStorage.setItem(PENDING_ATTEMPT_KEY, JSON.stringify({ flowId: "f", attemptId: "a", method: "apple", ts: Date.now() - 11 * 60 * 1000 }));
    setReferrer(SSO_REFERRER_ORIGIN.APPLE);
    resumePendingSignUpAttempt();
    expect(gtag).not.toHaveBeenCalled();
  });
  it("an active flow back from accounts.google.com synthesizes the whole burst", () => {
    persistActiveFlow({ flowId: "flow-2" });
    setReferrer(`${SSO_REFERRER_ORIGIN.GOOGLE}/o/oauth2/x`);
    resumePendingSignUpAttempt();
    expect(gtag).toHaveBeenCalledWith("event", SIGNUP_EVENT.METHOD_CHOSEN, expect.objectContaining({ flow_id: "flow-2", attempt_id: "generated-uuid", method: "google" }));
    expect(gtag).toHaveBeenCalledWith("event", SIGNUP_EVENT.PROCESS_STARTED, expect.objectContaining({ flow_id: "flow-2", attempt_id: "generated-uuid" }));
    expect(gtag).toHaveBeenCalledWith("event", SIGNUP_EVENT.PROCESS_ENDED, expect.objectContaining({ status: "success", error: null }));
    expect(gtag).toHaveBeenCalledWith("event", SIGNUP_EVENT.FLOW_ENDED, expect.objectContaining({ flow_id: "flow-2", status: "success" }));
    expect(sessionStorage.getItem(ACTIVE_FLOW_KEY)).toBeNull();
  });
  it("an active flow without a provider referrer is left alone", () => {
    persistActiveFlow({ flowId: "flow-2" });
    setReferrer("https://www.sefaria.org/register");
    resumePendingSignUpAttempt();
    expect(gtag).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(ACTIVE_FLOW_KEY)).not.toBeNull();
  });
  it("does nothing with no markers", () => {
    resumePendingSignUpAttempt();
    expect(gtag).not.toHaveBeenCalled();
  });
});
