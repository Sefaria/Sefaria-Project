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
      { key: "main", items: [{ key: "res", label: "Resources", icon: "layers", onSelect: fn() }, { key: "bm", label: "Move bookmark here", icon: "bookmark", onSelect: fn() }] },
      { key: "com", items: [{ key: "rashi", label: "Rashi", icon: "star", onSelect: fn() }, { key: "all", label: "All commentaries…", icon: "list", onSelect: fn() }] },
      { key: "copy", items: [{ key: "cite", label: "Copy with citation", icon: "copy", onSelect: fn() }, { key: "off", label: "Unavailable", disabled: true }] },
    ],
  },
} satisfies Meta<typeof ContextMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
