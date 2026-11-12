import type { Meta, StoryObj } from "@storybook/react-vite";
import { Divider } from "./Divider";

const meta = {
  title: "Primitives/Divider",
  component: Divider,
  tags: ["autodocs"],
  parameters: { docs: { description: { component: "A rule; with a label, the auth page’s centred “or” separator. Atlas: ACC-008." } } },
  decorators: [(Story) => <div style={{ width: 348 }}><Story /></div>],
} satisfies Meta<typeof Divider>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Rule: Story = {};
export const Strong: Story = { args: { strong: true } };
export const Or: Story = { args: { label: "or" } };
export const OrHebrew: Story = { args: { label: "או" }, globals: { interfaceLang: "hebrew" } };
