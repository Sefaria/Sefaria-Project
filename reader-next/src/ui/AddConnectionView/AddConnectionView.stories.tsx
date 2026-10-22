import type { Meta, StoryObj } from "@storybook/react-vite";
import { AddConnectionView } from "./AddConnectionView";

const meta = {
  title: "Connections/AddConnectionView",
  component: AddConnectionView,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 420, padding: 16 }}><Story /></div>],
  args: { refs: ["Genesis 1:1", "Psalms 33:6"], onAdd: async () => {} },
} satisfies Meta<typeof AddConnectionView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const TwoTexts: Story = {};
export const OneText: Story = { args: { refs: ["Genesis 1:1"], onBrowse: () => {} } };
export const TooMany: Story = { args: { refs: ["Genesis 1:1", "Psalms 33:6", "John 1:1"] } };
