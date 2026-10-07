import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Switch } from "./Switch";

const meta = {
  title: "Primitives/Switch",
  component: Switch,
  tags: ["autodocs"],
  parameters: { layout: "padded", docs: { description: { component: "A labelled on/off setting; the whole row is the control. Replaces ToggleSwitch and ToggleSwitchLine. Atlas: TXD-037, TXD-038, TXT-003, TXT-006." } } },
  args: { label: "Vowels", checked: true, onCheckedChange: () => {} },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
} satisfies Meta<typeof Switch>;
export default meta;
type Story = StoryObj<typeof meta>;

export const On: Story = {};
export const Off: Story = { args: { checked: false } };
export const DisabledWithReason: Story = { args: { label: "Cantillation", checked: false, disabled: true, disabledReason: "Turn on vowels first" } };
export const WithDescription: Story = { args: { label: "Aliyot", checked: false, description: "Show the seven aliyot inside each parasha" } };
export const Interactive: Story = { render: () => { const [c, setC] = useState(false); return <Switch label="Punctuation" checked={c} onCheckedChange={setC} />; } };
