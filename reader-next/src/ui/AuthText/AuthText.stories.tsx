import type { Meta, StoryObj } from "@storybook/react-vite";
import { AuthText } from "./AuthText";

const meta = {
  title: "Auth/AuthText",
  component: AuthText,
  tags: ["autodocs"],
  parameters: { docs: { description: { component: "An auth string by its old key (auth.*), in the interface language; unknown keys (server messages) shown as they are. Atlas: ACC-008." } } },
  args: { k: "auth.continue_with_email" },
} satisfies Meta<typeof AuthText>;
export default meta;
type Story = StoryObj<typeof meta>;
export const English: Story = {};
export const Hebrew: Story = { globals: { interfaceLang: "hebrew" } };
export const ServerMessage: Story = { args: { k: "This password reset link is no longer valid." } };
