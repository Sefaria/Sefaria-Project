import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ProviderButton } from "./ProviderButton";

const meta = {
  title: "Auth/ProviderButton",
  component: ProviderButton,
  tags: ["autodocs"],
  parameters: { docs: { description: { component: "Continue with Google / Apple. Google renders a shell the real (invisible) Google button is placed over. Atlas: ACC-012." } } },
  decorators: [(Story) => <div style={{ width: 348 }}><Story /></div>],
  args: { provider: "apple", label: "Continue with Apple", onClick: fn() },
} satisfies Meta<typeof ProviderButton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Apple: Story = {};
export const AppleDisabled: Story = { args: { disabled: true } };
export const GoogleShell: Story = { args: { provider: "google", label: "Continue with Google", trackingRef: () => {} } };
export const GoogleNotReady: Story = { args: { provider: "google", label: "Continue with Google", trackingRef: () => {}, disabled: true } };
export const Hebrew: Story = { args: { label: "המשך עם אפל" }, globals: { interfaceLang: "hebrew" } };
