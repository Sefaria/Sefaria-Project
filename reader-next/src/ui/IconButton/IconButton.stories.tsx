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
  parameters: { docs: { description: { component: "An icon-only control. `label` is required and becomes the accessible name and tooltip. Use `pressed` for toggles: a bookmark or star fills, other icons sit on a tinted disc. Atlas: SHL-*, USL-*." } } },
} satisfies Meta<typeof IconButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Close: Story = {};
export const SaveOff: Story = { args: { icon: "bookmark", label: "Save", pressed: false } };
export const SaveOn: Story = { args: { icon: "bookmark", label: "Save", pressed: true } };
/** An open shape cannot fill, so "on" is a tinted disc (Resources open). */
export const PressedTinted: Story = { args: { icon: "layers", label: "Resources", pressed: true } };
/** Scroll together (link, on) and locked in place (broken link, off). */
export const LinkTogether: Story = { args: { icon: "link", label: "Scrolls with the other texts", pressed: true } };
export const LinkLocked: Story = { args: { icon: "link-off", label: "Locked in place", pressed: false } };
export const Small: Story = { args: { size: "sm" } };
export const Disabled: Story = { args: { disabled: true } };
