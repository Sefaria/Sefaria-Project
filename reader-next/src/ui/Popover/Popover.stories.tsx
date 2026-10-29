import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { useState } from "react";
import { Button } from "../Button/Button";
import { IconButton } from "../IconButton/IconButton";
import { Popover } from "./Popover";

const meta = {
  title: "Primitives/Popover",
  component: Popover,
  tags: ["autodocs"],
  parameters: { layout: "padded", docs: { description: { component: "A non-modal floating panel for interactive content. Focus moves in on open and returns to the trigger on close; Escape and outside clicks close it. Atlas: SHL-017." } } },
  args: { open: false, onOpenChange: () => {}, label: "Options", trigger: () => null, children: null },
} satisfies Meta<typeof Popover>;
export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ align }: { align?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: "flex", justifyContent: align === "start" ? "flex-start" : "flex-end", minHeight: 220 }}>
      <Popover open={open} onOpenChange={setOpen} label="Example options" align={align} trigger={(p) => <IconButton {...p} icon="menu" label="Options" />}>
        <div style={{ display: "grid", gap: 8 }}>
          <Button size="sm">First action</Button>
          <Button size="sm" variant="tertiary">Second action</Button>
        </div>
      </Popover>
    </div>
  );
}

export const AlignedToEnd: Story = { render: () => <Demo /> };
export const AlignedToStart: Story = { render: () => <Demo align="start" /> };
export const OpensAndClosesWithKeyboard: Story = {
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Options" });
    await userEvent.click(trigger);
    await expect(canvas.getByRole("dialog", { name: "Example options" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "First action" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("dialog")).toBeNull();
    await expect(trigger).toHaveFocus();
  },
};
