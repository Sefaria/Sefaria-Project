// Component tests of the ported auth page against mocked Django endpoints (MSW). Never a real account.
// @feature ACC-001 @feature ACC-008 @feature ACC-009 @feature ACC-010 @feature ACC-011 @feature ACC-012 @feature ANL-013 @feature ANL-002
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../test/msw/server";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { AuthPage, type AuthPageProps } from "./AuthPage";

type Sent = { url: string; body: string; csrf: string | null; type: string | null };
const sent: Sent[] = [];
const answer = (path: string, status: number, json: unknown) =>
  server.use(
    http.post(`*${path}`, async ({ request }) => {
      sent.push({ url: new URL(request.url).pathname, body: await request.text(), csrf: request.headers.get("x-csrftoken"), type: request.headers.get("content-type") });
      return HttpResponse.json(json as object, { status });
    }),
  );

let navigate: ReturnType<typeof vi.fn<(href: string) => void>>;
let onNavigate: ReturnType<typeof vi.fn<(path: string, source?: string) => void>>;
let events: unknown[][];
const setup = (props: Partial<AuthPageProps> = {}, lang: "english" | "hebrew" = "english") => {
  const user = userEvent.setup();
  render(
    <InterfaceLangProvider lang={lang}>
      <AuthPage loadSdks={false} navigate={navigate} onNavigate={onNavigate} googleClientId="" appleClientId="" recaptchaSiteKey="" {...props} />
    </InterfaceLangProvider>,
  );
  return user;
};

beforeEach(() => {
  sent.length = 0;
  navigate = vi.fn();
  onNavigate = vi.fn();
  events = [];
  window.gtag = (...a: unknown[]) => void events.push(a);
  document.cookie = "csrftoken=tok123; path=/";
  sessionStorage.clear();
});
afterEach(() => {
  delete window.gtag;
  document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("choose", () => {
  it("login: heading focused, cross-link to sign up carries next and login_crosslink", async () => {
    const user = setup({ initialPath: "/login?next=%2FGenesis.1" });
    const h = screen.getByRole("heading", { name: "Log in" });
    expect(h).toHaveFocus();
    expect(screen.getByRole("separator")).toHaveTextContent("or");
    expect(screen.getByRole("link", { name: "Terms of Use" })).toHaveAttribute("target", "_blank");
    await user.click(screen.getByRole("link", { name: "Sign up" }));
    expect(onNavigate).toHaveBeenCalledWith("/register?next=%2FGenesis.1", "login_crosslink");
  });

  it("register: Create Account and Already have an account? Log In", async () => {
    const user = setup({ initialPath: "/register" });
    expect(screen.getByRole("heading", { name: "Create Account" })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Log In" }));
    expect(onNavigate).toHaveBeenCalledWith("/login", undefined);
  });

  it("shows Google and Apple only when their client IDs are configured (disabled until the SDKs are ready)", () => {
    setup({ googleClientId: "g", appleClientId: "a" });
    expect(screen.getByRole("button", { name: "Continue with Apple" })).toBeDisabled();
    expect(document.getElementById("google-signin-button")).toHaveAttribute("data-disabled", "true");
    expect(screen.getByText("Continue with Google")).toBeInTheDocument();
  });

  it("Hebrew: the old site's Hebrew strings", () => {
    setup({ initialPath: "/login" }, "hebrew");
    expect(screen.getByRole("heading", { name: "התחברות" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "המשך עם דוא״ל" })).toBeInTheDocument();
    expect(screen.getByText("אין לך חשבון?")).toBeInTheDocument();
  });
});

describe("login", () => {
  const toEmail = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Continue with Email" }));

  it("success: JSON with the CSRF header, then a full load of next", async () => {
    answer("/api/auth/login", 200, {});
    const user = setup({ initialPath: "/login?next=%2FGenesis.1" });
    await toEmail(user);
    expect(screen.getByRole("heading", { name: "Log in" })).toHaveFocus();
    await user.type(screen.getByLabelText("Email Address"), "a@example.org");
    await user.type(screen.getByLabelText("Password"), "pw");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/Genesis.1"));
    expect(sent[0]).toEqual({ url: "/api/auth/login", body: JSON.stringify({ email: "a@example.org", password: "pw" }), csrf: "tok123", type: "application/json" });
  });

  it("wrong credentials: the inline error, no navigation", async () => {
    answer("/api/auth/login", 401, { error: "auth.invalid_credentials" });
    const user = setup();
    await toEmail(user);
    await user.type(screen.getByLabelText("Email Address"), "a@example.org");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email and/or password are incorrect");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("an SSO-only account: the banner names the provider with an inline Continue link", async () => {
    answer("/api/auth/login", 401, { error: "auth.generic_error", _auth: { code: "sso_only_account", providers: ["google", "apple"] } });
    const user = setup();
    await toEmail(user);
    await user.click(screen.getByRole("button", { name: "Log in" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This email address is registered via Google Sign-In.");
    expect(alert).toHaveTextContent("This email address is registered via Apple.");
    expect(within(alert).getByRole("link", { name: "Continue with Apple" })).toBeInTheDocument();
  });

  it("network failure falls back to the invalid-credentials message, as the old page did", async () => {
    server.use(http.post("*/api/auth/login", () => HttpResponse.error()));
    const user = setup();
    await toEmail(user);
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email and/or password are incorrect");
  });

  it("the password field shows / hides its value", async () => {
    const user = setup();
    await toEmail(user);
    const pw = screen.getByLabelText("Password");
    await user.type(pw, "secret");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(pw).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(pw).toHaveAttribute("type", "password");
  });

  it("back returns to the choice", async () => {
    const user = setup();
    await toEmail(user);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Continue with Email" })).toBeInTheDocument();
  });
});

describe("register", () => {
  const toForm = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Continue with Email" }));

  it("required fields: set on blur, cleared while typing", async () => {
    const user = setup({ initialPath: "/register" });
    await toForm(user);
    await user.click(screen.getByLabelText("Email Address"));
    await user.tab();
    expect(await screen.findByText("Required field")).toBeInTheDocument();
    const email = screen.getByLabelText("Email Address");
    expect(email).toHaveAttribute("aria-invalid", "true");
    await user.type(email, "a@b.org");
    await waitFor(() => expect(email).not.toHaveAttribute("aria-invalid"));
    await user.click(screen.getByLabelText("First Name"));
    await user.tab();
    expect(screen.getByLabelText("First Name")).toHaveAttribute("aria-invalid", "true");
  });

  it("success: form-encoded noredirect POST to /register, then the server's redirect; funnel success", async () => {
    answer("/register", 200, { redirect: "/texts?welcome=to-sefaria" });
    const user = setup({ initialPath: "/register?next=%2FGenesis.1", authSource: "nav_bar" });
    await toForm(user);
    await user.type(screen.getByLabelText("Email Address"), "new@example.org");
    await user.type(screen.getByLabelText("Password"), "Xk7mQ9zLp2!");
    await user.type(screen.getByLabelText("First Name"), "QA");
    await user.type(screen.getByLabelText("Last Name"), "Test");
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/texts?welcome=to-sefaria"));
    const body = new URLSearchParams(sent[0]!.body);
    expect(sent[0]!.type).toBe("application/x-www-form-urlencoded");
    expect(Object.fromEntries(body)).toEqual({
      email: "new@example.org", password1: "Xk7mQ9zLp2!", first_name: "QA", last_name: "Test", "g-recaptcha-response": "", next: "/Genesis.1", noredirect: "1",
    });
    const names = events.map((e) => e[1]);
    expect(names).toEqual(["sign_up_flow_started", "sign_up_method_chosen", "sign_up_process_started", "sign_up_process_ended"]);
    expect(events[0]![2]).toMatchObject({ source: "nav_bar", project: "site_registration", transport_type: "beacon" });
    expect(events[1]![2]).toMatchObject({ method: "email" });
    expect(events[3]![2]).toMatchObject({ status: "success", error: null });
  });

  it("email exists: the banner with a Log In link; field errors under their fields (stable codes mapped)", async () => {
    answer("/register", 200, { email: "email_exists", password1: "This password is too short.", first_name: "required", captcha: "x" });
    const user = setup({ initialPath: "/register" });
    await toForm(user);
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    const banner = await screen.findByText("An account with this email address already exists.");
    expect(banner.closest("[role=alert]")).toBeTruthy();
    expect(screen.getByText("This password is too short.")).toBeInTheDocument();
    expect(screen.getByText("Required field")).toBeInTheDocument();
    await user.click(within(banner.closest("[role=alert]") as HTMLElement).getByRole("link", { name: "Log In" }));
    expect(onNavigate).toHaveBeenCalledWith("/login", undefined);
    const ended = events.find((e) => e[1] === "sign_up_process_ended")![2] as { status: string; error: string };
    expect(ended.status).toBe("failure");
    expect(ended.error).toContain("email: email_exists");
  });

  it("an address registered with Google: the provider banner", async () => {
    answer("/register", 200, { email: "sso_google_exists" });
    const user = setup({ initialPath: "/register" });
    await toForm(user);
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This email address is registered via Google Sign-In.");
  });

  it("a captcha failure marks the captcha", async () => {
    answer("/register", 200, { captcha: "invalid" });
    const user = setup({ initialPath: "/register", recaptchaSiteKey: "k" });
    await toForm(user);
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByText("Verify that you are not a robot")).toBeInTheDocument();
  });

  it("network failure: generic error and funnel network_error", async () => {
    server.use(http.post("*/register", () => HttpResponse.error()));
    const user = setup({ initialPath: "/register" });
    await toForm(user);
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
    expect(events.find((e) => e[1] === "sign_up_process_ended")![2]).toMatchObject({ status: "failure", error: "network_error" });
  });
});

describe("forgot password", () => {
  it("sends the email and shows Reset Link Sent", async () => {
    answer("/api/auth/password/reset", 200, {});
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Continue with Email" }));
    await user.type(screen.getByLabelText("Email Address"), "a@example.org");
    await user.click(screen.getByText("Forgot Password?"));
    expect(screen.getByRole("heading", { name: "Forgot Password?" })).toHaveFocus();
    expect(screen.getByLabelText("Email Address")).toHaveValue("a@example.org");
    await user.click(screen.getByRole("button", { name: "Send Reset Link" }));
    expect(await screen.findByRole("heading", { name: "Reset Link Sent" })).toBeInTheDocument();
    expect(screen.getByText("Check your email and follow the instructions to reset your password.")).toBeInTheDocument();
    expect(JSON.parse(sent[0]!.body)).toEqual({ email: "a@example.org" });
  });

  it("an invalid address shows the server's key", async () => {
    answer("/api/auth/password/reset", 400, { error: "auth.invalid_email" });
    const user = setup({ initialView: "forgot" });
    await user.click(screen.getByRole("button", { name: "Send Reset Link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email address");
  });
});

describe("reset link", () => {
  const PATH = "/password/reset/confirm/MTI/set-password";

  it("asks Django whether the link is good (empty POST), then sets the password and offers Log In", async () => {
    let n = 0;
    server.use(
      http.post("*/password/reset/confirm/MTI/set-password/", async ({ request }) => {
        const body = (await request.json()) as Record<string, string>;
        sent.push({ url: new URL(request.url).pathname, body: JSON.stringify(body), csrf: request.headers.get("x-csrftoken"), type: null });
        n++;
        if (!body.new_password1) return HttpResponse.json({ new_password1: "This field is required.", new_password2: "This field is required." }, { status: 400 });
        return HttpResponse.json({});
      }),
    );
    const user = setup({ initialPath: PATH });
    expect(screen.getByRole("heading", { name: "Reset Password" })).toBeInTheDocument();
    const pw1 = await screen.findByLabelText("New Password");
    expect(sent[0]).toMatchObject({ url: "/password/reset/confirm/MTI/set-password/", body: "{}", csrf: "tok123" });
    await user.type(pw1, "abcdefgh1!");
    await user.type(screen.getByLabelText("Confirm New Password"), "abcdefgh1?");
    await user.tab();
    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Confirm New Password"));
    await user.type(screen.getByLabelText("Confirm New Password"), "abcdefgh1!");
    await waitFor(() => expect(screen.queryByText("Passwords don't match")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Reset Password" }));
    expect(await screen.findByRole("heading", { name: "Password Reset Successfully" })).toBeInTheDocument();
    expect(n).toBe(2);
    await user.click(screen.getByRole("button", { name: "Log In" }));
    expect(onNavigate).toHaveBeenCalledWith("/login", undefined);
  });

  it("an expired link: Request New Link re-sends to the account's email", async () => {
    server.use(
      http.post("*/password/reset/confirm/MTI/set-password/", async ({ request }) => {
        const body = (await request.json()) as Record<string, string>;
        if (body.action === "resend") return HttpResponse.json({});
        return HttpResponse.json({ error: "This password reset link is no longer valid.", _auth: { code: "invalid_reset_link" } }, { status: 400 });
      }),
    );
    const user = setup({ initialPath: PATH });
    expect(await screen.findByRole("heading", { name: "Password Reset Link Expired" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Request New Link" }));
    expect(await screen.findByRole("heading", { name: "Reset Link Sent" })).toBeInTheDocument();
  });

  it("no account for the link: the banner's Request New Link goes to Forgot Password (fixed: the old page fell back to the choice)", async () => {
    answer("/password/reset/confirm/MTI/set-password/", 400, { error: "We couldn't find an account for this link.", _auth: { code: "no_account_for_link" } });
    const user = setup({ initialPath: PATH, resetValid: false });
    await user.click(screen.getByRole("button", { name: "Request New Link" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't find an account for this link.");
    await user.click(within(alert).getByRole("link", { name: "Request New Link" }));
    expect(onNavigate).toHaveBeenCalledWith("/login");
    expect(screen.getByRole("heading", { name: "Forgot Password?" })).toBeInTheDocument();
  });

  it("a server-side password rule shows under its field", async () => {
    answer("/password/reset/confirm/MTI/set-password/", 400, { new_password2: "This password is too common." });
    const user = setup({ initialPath: PATH, resetValid: true });
    await user.type(screen.getByLabelText("New Password"), "password");
    await user.type(screen.getByLabelText("Confirm New Password"), "password");
    await user.click(screen.getByRole("button", { name: "Reset Password" }));
    expect(await screen.findByText("This password is too common.")).toBeInTheDocument();
  });
});
