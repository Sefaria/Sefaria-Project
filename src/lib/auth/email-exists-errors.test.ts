// Ported from Sefaria-Project static/js/auth/tests/emailExistsErrors.test.js
// @feature ACC-010
import { describe, expect, it } from "vitest";
import { EMAIL_EXISTS_ERRORS } from "./email-exists-errors";

describe("EMAIL_EXISTS_ERRORS", () => {
  it("is keyed by backend error codes, not message text", () =>
    expect(Object.keys(EMAIL_EXISTS_ERRORS).sort()).toEqual(["email_exists", "sso_apple_exists", "sso_google_exists"]));
  it("does not match the old raw English sentences", () => {
    expect(EMAIL_EXISTS_ERRORS["This email address is already registered via Google Sign-In."]).toBeUndefined();
    expect(EMAIL_EXISTS_ERRORS["An account with this email address already exists."]).toBeUndefined();
  });
  it("maps the SSO codes to the sso_only_account banner shape, email_exists to message + link", () => {
    expect(EMAIL_EXISTS_ERRORS.sso_google_exists).toEqual({ code: "sso_only_account", providers: ["google"] });
    expect(EMAIL_EXISTS_ERRORS.sso_apple_exists).toEqual({ code: "sso_only_account", providers: ["apple"] });
    expect(EMAIL_EXISTS_ERRORS.email_exists).toEqual({ message: "auth.email_exists_generic", linkText: "auth.log_in_link" });
  });
});
