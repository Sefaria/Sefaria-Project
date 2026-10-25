import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ContextMenu } from "./ContextMenu";

const meta = {
  title: "Primitives/ContextMenu",
  component: ContextMenu,
  args: {
    x: 40,
    y: 40,
    label: "Genesis 1:3",
    onClose: fn(),
    groups: [
      { key: "main", items: [{ key: "res", label: "Resources", onSelect: fn() }, { key: "bm", label: "Move bookmark here", onSelect: fn() }] },
      { key: "com", heading: "Commentaries", items: [{ key: "rashi", label: "Rashi", onSelect: fn() }, { key: "ramban", label: "Ramban", onSelect: fn() }] },
      { key: "copy", items: [{ key: "cite", label: "Copy with citation", onSelect: fn() }, { key: "off", label: "Unavailable", disabled: true }] },
    ],
  },
} satisfies Meta<typeof ContextMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
