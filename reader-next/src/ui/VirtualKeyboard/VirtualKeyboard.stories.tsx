import type { Meta, StoryObj } from "@storybook/react-vite";
import { VirtualKeyboard } from "./VirtualKeyboard";

const meta = {
  title: "Search/VirtualKeyboard",
  component: VirtualKeyboard,
  tags: ["autodocs"],
  args: { onType: () => {}, onControl: () => {} },
  parameters: { docs: { description: { component: "The old site's on-screen Hebrew keyboard (Shift / Caps / Alt-Gr faces)." } } },
} satisfies Meta<typeof VirtualKeyboard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Hebrew: Story = {};
