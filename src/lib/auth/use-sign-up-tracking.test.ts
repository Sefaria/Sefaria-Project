// Ported from Sefaria-Project static/js/auth/tests/useSignUpTracking.test.js
// @feature ANL-013
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthFlow } from "./utils";

const a = vi.hoisted(() => ({
  persistActiveFlow: vi.fn(), clearActiveFlow: vi.fn(), clearPendingAttempt: vi.fn(), fireFlowStarted: vi.fn(),
  fireMethodChosen: vi.fn(), fireProcessStarted: vi.fn(), fireProcessEnded: vi.fn(), fireFlowEnded: vi.fn(),
}));
const uuid = vi.hoisted(() => ({ n: 0 }));
vi.mock("./analytics", () => a);
vi.mock("./utils", () => ({ makeUuid: () => `id-${++uuid.n}` }));
const { useSignUpTracking } = await import("./use-sign-up-tracking");

type P = { flow: AuthFlow; source: string };
const mount = (props: P) => renderHook((p: P) => useSignUpTracking(p), { initialProps: props });
const pageShow = (persisted: boolean) => {
  const e = new Event("pageshow");
  Object.defineProperty(e, "persisted", { value: persisted });
  return e;
};

beforeEach(() => {
  Object.values(a).forEach((f) => f.mockClear());
  uuid.n = 0;
});

describe("flow start", () => {
  it("mounting on register persists and fires flow_started", () => {
    const { result } = mount({ flow: "register", source: "nav_bar" });
    expect(a.persistActiveFlow).toHaveBeenCalledWith({ flowId: "id-1" });
    expect(a.fireFlowStarted).toHaveBeenCalledWith("id-1", "nav_bar");
    expect(result.current.getIds()).toEqual({ flowId: "id-1" });
  });
  it("a non-register flow starts nothing", () => {
    mount({ flow: "login", source: "nav_bar" });
    expect(a.fireFlowStarted).not.toHaveBeenCalled();
  });
});

describe("attempts", () => {
  it("threads flowId and attemptId through every event", () => {
    const { result } = mount({ flow: "register", source: "nav_bar" });
    const id = result.current.chooseMethod("email");
    expect(a.fireMethodChosen).toHaveBeenCalledWith("id-1", id, "email");
    result.current.startProcess();
    expect(a.fireProcessStarted).toHaveBeenCalledWith("id-1", id);
    result.current.endProcess("success", null);
    expect(a.fireProcessEnded).toHaveBeenCalledWith("id-1", id, "success", null);
  });
  it("a new method while an attempt is open ends the old one as abandoned_for_new_attempt", () => {
    const { result } = mount({ flow: "register", source: "nav_bar" });
    const first = result.current.chooseMethod("email");
    result.current.startProcess();
    a.fireProcessEnded.mockClear();
    const second = result.current.chooseMethod("google");
    expect(a.fireProcessEnded).toHaveBeenCalledWith("id-1", first, "failure", "abandoned_for_new_attempt");
    expect(a.fireMethodChosen).toHaveBeenLastCalledWith("id-1", second, "google");
  });
  it("endProcess fires once per attempt", () => {
    const { result } = mount({ flow: "register", source: "nav_bar" });
    result.current.chooseMethod("email");
    result.current.endProcess("success", null);
    a.fireProcessEnded.mockClear();
    result.current.endProcess("failure", "network_error");
    expect(a.fireProcessEnded).not.toHaveBeenCalled();
  });
});

describe("endFlow", () => {
  it("leaving with no method chosen reports failure / no_attempt and clears the markers", () => {
    const h = mount({ flow: "register", source: "nav_bar" });
    h.rerender({ flow: "login", source: "nav_bar" });
    expect(a.fireFlowEnded).toHaveBeenCalledWith("id-1", "failure", "no_attempt");
    expect(a.clearActiveFlow).toHaveBeenCalled();
    expect(a.clearPendingAttempt).toHaveBeenCalled();
  });
  it("an attempt started but never ended is reported as left_page on unmount", () => {
    const h = mount({ flow: "register", source: "nav_bar" });
    const id = h.result.current.chooseMethod("email");
    h.result.current.startProcess();
    h.unmount();
    expect(a.fireProcessEnded).toHaveBeenCalledWith("id-1", id, "failure", "left_page");
    expect(a.fireFlowEnded).toHaveBeenCalledWith("id-1", "failure", "left_page");
  });
  it("an attempt ended as success is reported as is", () => {
    const h = mount({ flow: "register", source: "nav_bar" });
    h.result.current.chooseMethod("email");
    h.result.current.startProcess();
    h.result.current.endProcess("success", null);
    h.rerender({ flow: "login", source: "nav_bar" });
    expect(a.fireFlowEnded).toHaveBeenCalledWith("id-1", "success", null);
  });
  it("is idempotent", () => {
    const h = mount({ flow: "register", source: "nav_bar" });
    h.rerender({ flow: "login", source: "nav_bar" });
    h.unmount();
    expect(a.fireFlowEnded).toHaveBeenCalledTimes(1);
  });
});

describe("window events", () => {
  it("popstate concludes the register flow", () => {
    mount({ flow: "register", source: "nav_bar" });
    act(() => void window.dispatchEvent(new Event("popstate")));
    expect(a.fireFlowEnded).toHaveBeenCalledWith("id-1", "failure", "no_attempt");
  });
  it("popstate outside register does nothing", () => {
    mount({ flow: "login", source: "nav_bar" });
    act(() => void window.dispatchEvent(new Event("popstate")));
    expect(a.fireFlowEnded).not.toHaveBeenCalled();
  });
  it("beforeunload ends the flow unless an SSO redirect suppressed it", () => {
    const h = mount({ flow: "register", source: "nav_bar" });
    h.result.current.suppressFlowEndRef.current = true;
    act(() => void window.dispatchEvent(new Event("beforeunload")));
    expect(a.fireFlowEnded).not.toHaveBeenCalled();
    h.result.current.suppressFlowEndRef.current = false;
    act(() => void window.dispatchEvent(new Event("beforeunload")));
    expect(a.fireFlowEnded).toHaveBeenCalledTimes(1);
  });
  it("pageshow persisted:false is a no-op", () => {
    const h = mount({ flow: "register", source: "nav_bar" });
    h.result.current.chooseMethod("google");
    h.result.current.startProcess();
    act(() => void window.dispatchEvent(pageShow(false)));
    expect(a.fireProcessEnded).not.toHaveBeenCalled();
  });
  it("pageshow persisted:true ends the attempt as back_navigation and re-arms a fresh flow", () => {
    const h = mount({ flow: "register", source: "nav_bar" });
    const id = h.result.current.chooseMethod("google");
    h.result.current.startProcess();
    act(() => void window.dispatchEvent(pageShow(true)));
    expect(a.fireProcessEnded).toHaveBeenCalledWith("id-1", id, "failure", "back_navigation");
    expect(a.fireFlowEnded).toHaveBeenCalledWith("id-1", "failure", "back_navigation");
    expect(a.fireFlowStarted).toHaveBeenCalledWith("id-3", "nav_bar");
    expect(h.result.current.getIds()).toEqual({ flowId: "id-3" });
  });
  it("pageshow bypasses suppressFlowEndRef", () => {
    const h = mount({ flow: "register", source: "nav_bar" });
    h.result.current.suppressFlowEndRef.current = true;
    act(() => void window.dispatchEvent(pageShow(true)));
    expect(a.fireFlowEnded).toHaveBeenCalledWith("id-1", "failure", "no_attempt");
  });
  it("re-entering register resets a stale suppression", () => {
    const h = mount({ flow: "register", source: "nav_bar" });
    h.result.current.suppressFlowEndRef.current = true;
    h.rerender({ flow: "login", source: "nav_bar" });
    h.rerender({ flow: "register", source: "nav_bar" });
    expect(h.result.current.suppressFlowEndRef.current).toBe(false);
  });
});
