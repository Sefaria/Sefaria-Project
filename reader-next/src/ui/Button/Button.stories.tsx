import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Button } from "./Button";

const meta = {
  title: "Primitives/Button",
  component: Button,
  tags: ["autodocs"],
  args: { children: "Go to translations", onClick: fn() },
  parameters: {
    docs: {
      description: {
        component:
          "The one button. `<button>` for actions, `<a>` (through the injected Link) when `href` is set. Replaces `.button`, `.btn`, `.sefaria-common-button`, `.sidebarButton` and `common/Button.jsx`. Atlas: GUI-*, SHL-*.",
      },
    },
  },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Secondary: Story = {};
export const Primary: Story = { args: { variant: "primary", children: "Sign up" } };
export const Tertiary: Story = { args: { variant: "tertiary", children: "Maybe later" } };
export const Danger: Story = { args: { variant: "danger", children: "Delete sheet" } };
export const Small: Story = { args: { size: "sm" } };
export const Large: Story = { args: { size: "lg", variant: "primary" } };
export const Disabled: Story = { args: { disabled: true } };
export const Loading: Story = { args: { loading: true, variant: "primary", children: "Publishing" } };
export const AsLink: Story = { args: { href: "/texts", children: "Browse texts" } };
export const Block: Story = { args: { block: true, variant: "primary" }, parameters: { layout: "padded" } };
export const Hebrew: Story = { args: { children: "לרשימת התרגומים" }, globals: { interfaceLang: "hebrew" } };
export const AuthPrimary: Story = { args: { variant: "primary", size: "xl", block: true, children: "Continue with Email" }, decorators: [(Story) => <div style={{ width: 348 }}><Story /></div>] };
