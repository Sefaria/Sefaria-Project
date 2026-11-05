import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ICON_NAMES } from "../Icon/Icon";
import { IconButton } from "./IconButton";

const meta = {
  title: "Primitives/IconButton",
  component: IconButton,
  tags: ["autodocs"],
  args: { icon: "close", label: "Close panel", onClick: fn() },
  argTypes: { icon: { options: ICON_NAMES, control: "select" } },
  parameters: { docs: { description: { component: "An icon-only control. `label` is required and becomes the accessible name and tooltip. Use `pressed` for toggles like Save. Atlas: SHL-*, USL-*." } } },
} satisfies Meta<typeof IconButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Close: Story = {};
export const SaveOff: Story = { args: { icon: "bookmark", label: "Save", pressed: false } };
export const SaveOn: Story = { args: { icon: "bookmark", label: "Save", pressed: true } };
export const Small: Story = { args: { size: "sm" } };
export const Disabled: Story = { args: { disabled: true } };
