// Ported from Sefaria-Project static/js/auth/tests/utils.test.js
// @feature ACC-007 @feature ACC-008 @feature RTE-052
import { describe, expect, it, vi } from "vitest";
import {
  authError, checkPasswordsMatch, emailValidate, flowToPath, isAuthPath, nextFromPath, onBlurValidate, onChangeClear, pathToFlow,
  pickFirstError, requiredFieldValidate, safeNext, whenReady, withNext,
} from "./utils";

describe("safeNext", () => {
  it("allows a plain relative path", () => expect(safeNext("/sheets/123")).toBe("/sheets/123"));
  it("rejects a protocol-relative path (open redirect via //)", () => expect(safeNext("//evil.example.com")).toBe("/"));
  it("rejects an absolute URL", () => expect(safeNext("https://evil.example.com")).toBe("/"));
  it("allows a bare relative path", () => expect(safeNext("sheets/123")).toBe("sheets/123"));
  it("defaults to / for empty/undefined input", () => {
    expect(safeNext("")).toBe("/");
    expect(safeNext(undefined)).toBe("/");
  });
  it("rejects a backslash that browsers normalize into //", () => expect(safeNext("/\\evil.example.com")).toBe("/"));
  it("rejects embedded tabs/newlines that browsers strip into //", () => {
    expect(safeNext("/\t/evil.example.com")).toBe("/");
    expect(safeNext("/\n/evil.example.com")).toBe("/");
  });
});

describe("pathToFlow / isAuthPath", () => {
  it("reads reset for the reset-confirm path", () => expect(pathToFlow("/password/reset/confirm/abc123/token/")).toBe("reset"));
  it("reads register for /register and its variants", () => {
    expect(pathToFlow("/register")).toBe("register");
    expect(pathToFlow("/register/")).toBe("register");
    expect(pathToFlow("/register?next=/sheets/1")).toBe("register");
  });
  it("defaults to login for everything else", () => {
    expect(pathToFlow("/login")).toBe("login");
    expect(pathToFlow("/texts/Genesis")).toBe("login");
  });
  it("isAuthPath: /login and /register (trailing slash ok), never the reset link", () => {
    expect(isAuthPath("/login")).toBe(true);
    expect(isAuthPath("/register/")).toBe(true);
    expect(isAuthPath("/password/reset/confirm/a/b/")).toBe(false);
    expect(isAuthPath("/loginx")).toBe(false);
  });
});

describe("withNext / flowToPath / nextFromPath", () => {
  it("appends an encoded next param when next is not the default", () =>
    expect(withNext("/login", "/sheets/1?x=y")).toBe("/login?next=%2Fsheets%2F1%3Fx%3Dy"));
  it('omits the next param when next is "/" or absent', () => {
    expect(withNext("/login", "/")).toBe("/login");
    expect(withNext("/login")).toBe("/login");
  });
  it("flowToPath maps register/login to their base paths", () => {
    expect(flowToPath("register", "/sheets/1")).toBe("/register?next=%2Fsheets%2F1");
    expect(flowToPath("login")).toBe("/login");
  });
  it("nextFromPath extracts and safety-checks next", () => {
    expect(nextFromPath("/login?next=%2Fsheets%2F1")).toBe("/sheets/1");
    expect(nextFromPath("/login")).toBe("/");
    expect(nextFromPath("/login?next=https%3A%2F%2Fevil.example.com")).toBe("/");
  });
});

describe("validators", () => {
  it("checkPasswordsMatch", () => {
    expect(checkPasswordsMatch("abc", "")).toBeNull();
    expect(checkPasswordsMatch("abc", "abc")).toBeNull();
    expect(checkPasswordsMatch("abc", "abd")).toBe("auth.passwords_dont_match");
  });
  it("requiredFieldValidate", () => {
    expect(requiredFieldValidate("")).toBe("auth.required_field");
    expect(requiredFieldValidate("   ")).toBe("auth.required_field");
    expect(requiredFieldValidate("Alice")).toBeNull();
  });
  it("emailValidate uses the input's own type check", () => {
    expect(emailValidate({ validity: { typeMismatch: true } })).toBe("auth.invalid_email");
    expect(emailValidate({ validity: { typeMismatch: false } })).toBeNull();
  });
});

describe("onBlurValidate / onChangeClear field-error contract", () => {
  const validate = (v: string) => (v ? null : "auth.required_field");
  it("onBlurValidate sets whatever the validator returns", () => {
    const setFieldError = vi.fn();
    onBlurValidate("first", () => "auth.required_field", setFieldError)();
    expect(setFieldError).toHaveBeenCalledWith("first", "auth.required_field");
  });
  it("onChangeClear clears an existing error once the value is valid", () => {
    const onChange = vi.fn();
    const setFieldError = vi.fn();
    onChangeClear("first", onChange, validate, { first: "auth.required_field" }, setFieldError)({ target: { value: "Alice" } });
    expect(onChange).toHaveBeenCalled();
    expect(setFieldError).toHaveBeenCalledWith("first", null);
  });
  it("onChangeClear leaves the error alone while the value is still invalid", () => {
    const setFieldError = vi.fn();
    onChangeClear("first", vi.fn(), validate, { first: "auth.required_field" }, setFieldError)({ target: { value: "" } });
    expect(setFieldError).not.toHaveBeenCalled();
  });
  it("onChangeClear never sets an error when none is shown", () => {
    const setFieldError = vi.fn();
    onChangeClear("first", vi.fn(), () => "auth.required_field", {}, setFieldError)({ target: { value: "" } });
    expect(setFieldError).not.toHaveBeenCalled();
  });
});

describe("pickFirstError / authError", () => {
  it("prefers a top-level error string", () => expect(pickFirstError({ error: "auth.invalid_credentials", email: "x" })).toBe("auth.invalid_credentials"));
  it("falls back to allauth-shaped errors[0].message", () => expect(pickFirstError({ errors: [{ message: "bad token" }] })).toBe("bad token"));
  it("falls back to the first string field, skipping _auth and errors", () => expect(pickFirstError({ _auth: { code: "x" }, password1: "Too short" })).toBe("Too short"));
  it("returns null for empty/non-object input", () => {
    expect(pickFirstError(null)).toBeNull();
    expect(pickFirstError({})).toBeNull();
  });
  it("authError carries the message key (translated when shown) and the _auth metadata", () => {
    expect(authError({ _auth: { code: "sso_only_account", providers: ["google"] }, error: "auth.generic_error" }, "auth.fallback")).toEqual({
      message: "auth.generic_error",
      code: "sso_only_account",
      providers: ["google"],
    });
    expect(authError(null, "auth.fallback")).toEqual({ message: "auth.fallback", code: undefined, providers: [] });
  });
});

describe("whenReady", () => {
  it("polls until ready, and can be cancelled", () => {
    vi.useFakeTimers();
    let ready = false;
    const cb = vi.fn();
    whenReady(() => ready, cb);
    vi.advanceTimersByTime(300);
    expect(cb).not.toHaveBeenCalled();
    ready = true;
    vi.advanceTimersByTime(100);
    expect(cb).toHaveBeenCalledTimes(1);
    const cb2 = vi.fn();
    let r2 = false;
    const cancel = whenReady(() => r2, cb2);
    cancel();
    r2 = true;
    vi.advanceTimersByTime(1000);
    expect(cb2).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
