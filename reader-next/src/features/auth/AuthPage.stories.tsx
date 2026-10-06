import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AuthPage } from "./AuthPage";

/** Answer the auth page's POSTs in the story (no network): path → [status, json]. */
const stubFetch = (answers: Record<string, [number, unknown]>) => () => {
  const real = window.fetch;
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
    const hit = Object.entries(answers).find(([p]) => url.pathname === p);
    if (hit && (init?.method ?? "GET") === "POST") return new Response(JSON.stringify(hit[1][1]), { status: hit[1][0], headers: { "content-type": "application/json" } });
    if (url.pathname.startsWith("/_allauth/")) return new Response("{}", { status: 401, headers: { "content-type": "application/json" } });
    return real(input, init);
  }) as typeof fetch;
  return () => {
    window.fetch = real;
  };
};

const meta = {
  title: "Auth/AuthPage",
  component: AuthPage,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "The login / register / reset page, ported from Sefaria-Project's AuthPage (spec 1602): one state machine, one card at a time. Atlas: ACC-001, ACC-008…ACC-012." } },
  },
  decorators: [(Story) => <div style={{ height: 900 }}><Story /></div>],
  args: { loadSdks: false, navigate: fn(), onNavigate: fn(), googleClientId: "", appleClientId: "", recaptchaSiteKey: "" },
} satisfies Meta<typeof AuthPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LogIn: Story = { args: { initialPath: "/login" } };
export const LogInWithProviders: Story = { args: { initialPath: "/login", googleClientId: "g", appleClientId: "a" } };
export const SignUp: Story = { args: { initialPath: "/register", googleClientId: "g", appleClientId: "a" } };
export const LogInEmail: Story = { args: { initialPath: "/login", initialView: "email" } };
export const SignUpEmail: Story = { args: { initialPath: "/register", initialView: "email" } };
export const ForgotPassword: Story = { args: { initialPath: "/login", initialView: "forgot" } };
export const ResetLinkSent: Story = { args: { initialPath: "/login", initialView: "forgot-sent" } };
export const ResetPassword: Story = { args: { initialPath: "/password/reset/confirm/MTI/set-password/", resetValid: true } };
export const ResetLinkExpired: Story = { args: { initialPath: "/password/reset/confirm/MTI/set-password/", resetValid: false } };
export const ResetSuccess: Story = { args: { initialPath: "/password/reset/confirm/MTI/set-password/", initialView: "reset-success" } };
export const Hebrew: Story = { args: { initialPath: "/register", initialView: "email" }, globals: { interfaceLang: "hebrew" } };
export const Phone: Story = { args: { initialPath: "/login", googleClientId: "g", appleClientId: "a" }, globals: { viewport: { value: "mobile" } } };

export const WrongPassword: Story = {
  args: { initialPath: "/login", initialView: "email" },
  beforeEach: stubFetch({ "/api/auth/login": [401, { error: "auth.invalid_credentials" }] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByLabelText("Email Address"), "reader@example.org");
    await userEvent.type(c.getByLabelText("Password"), "wrong");
    await userEvent.click(c.getByRole("button", { name: "Log in" }));
    await expect(await c.findByRole("alert")).toHaveTextContent("Email and/or password are incorrect");
  },
};

export const GoogleOnlyAccount: Story = {
  args: { initialPath: "/login", initialView: "email" },
  beforeEach: stubFetch({ "/api/auth/login": [401, { error: "auth.generic_error", _auth: { code: "sso_only_account", providers: ["google"] } }] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "Log in" }));
    await expect(await c.findByRole("alert")).toHaveTextContent("This email address is registered via Google Sign-In.");
  },
};

export const SignUpErrors: Story = {
  args: { initialPath: "/register", initialView: "email" },
  beforeEach: stubFetch({ "/register": [200, { email: "email_exists", password1: "This password is too short. It must contain at least 8 characters.", first_name: "required" }] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "Create Account" }));
    await expect(await c.findByText("An account with this email address already exists.")).toBeInTheDocument();
    await expect(c.getByText("Required field")).toBeInTheDocument();
  },
};
