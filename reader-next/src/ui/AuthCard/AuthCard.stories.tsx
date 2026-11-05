import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { AuthCard, AuthLoadingLine } from "./AuthCard";

const meta = {
  title: "Auth/AuthCard",
  component: AuthCard,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen", docs: { description: { component: "The white auth card on the navy page (Figma Form Card). Heading focused on mount; optional back arrow; content capped at 348px. Atlas: ACC-008." } } },
  decorators: [(Story) => <div style={{ background: "#18345d", padding: "56px 32px", display: "flex", justifyContent: "center" }}><Story /></div>],
  args: { heading: "Log in", sub: <>Don't have an account? <a href="#">Sign up</a></> },
} satisfies Meta<typeof AuthCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { children: <p style={{ margin: 0 }}>Content, up to 348px wide.</p> } };
export const WithBack: Story = { args: { onBack: fn(), size: "login-email", children: <p style={{ margin: 0 }}>The email step.</p> } };
export const Loading: Story = { args: { sub: <AuthLoadingLine label="Loading" /> } };
export const Message: Story = { args: { size: "message", heading: "Reset Link Sent", sub: "Check your email and follow the instructions to reset your password." } };
