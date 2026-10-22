import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { AuthErrorBanner } from "./AuthErrorBanner";

const meta = {
  title: "Auth/AuthErrorBanner",
  component: AuthErrorBanner,
  tags: ["autodocs"],
  parameters: { docs: { description: { component: "A form's error banner: a message (with an optional link) or, for accounts with only Google/Apple sign-in, one line per provider with Continue links. Atlas: ACC-009, ACC-012." } } },
  decorators: [(Story) => <div style={{ width: 348 }}><Story /></div>],
  args: { onLinkClick: fn(), triggerApple: fn() },
} satisfies Meta<typeof AuthErrorBanner>;
export default meta;
type Story = StoryObj<typeof meta>;
export const InvalidCredentials: Story = { args: { error: { message: "auth.invalid_credentials" } } };
export const EmailExists: Story = { args: { error: { message: "auth.email_exists_generic", linkText: "auth.log_in_link" } } };
export const GoogleOnlyAccount: Story = { args: { error: { code: "sso_only_account", providers: ["google"] } } };
export const GoogleAndAppleAccount: Story = { args: { error: { code: "sso_only_account", providers: ["google", "apple"] } } };
export const Hebrew: Story = { args: { error: { message: "auth.invalid_credentials" } }, globals: { interfaceLang: "hebrew" } };
