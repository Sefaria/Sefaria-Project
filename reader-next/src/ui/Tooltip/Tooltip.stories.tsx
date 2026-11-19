import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { SourceNote } from "./SourceNote";
import { Tooltip } from "./Tooltip";

const NOTE = 'This topic is connected to "Genesis 1:2" by Aspaklaria.';

const meta = {
  title: "Primitives/Tooltip",
  component: Tooltip,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ padding: "60px 16px 60px 260px" }}><Story /></div>],
  parameters: { docs: { description: { component: "A short plain-text hint on hover and focus, drawn as the old white card; Escape hides it. Replaces the old `ToolTipped` (Misc.jsx). `SourceNote` is the three-dots button beside a topic (CON-045, CON-046). Interactive content belongs in a Popover." } } },
  args: { content: "Text display options", side: "below", children: (p) => <button type="button" {...p}>Aa</button> },
} satisfies Meta<typeof Tooltip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Below: Story = {};
export const SourceNoteDots: Story = {
  name: "SourceNote (three dots)",
  render: () => <SourceNote note={NOTE} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const button = c.getByRole("button", { name: NOTE });
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await waitFor(() => expect(c.getByRole("tooltip")).toBeVisible(), { timeout: 2000 }); // fades in over .75s
  },
};
export const SourceNoteHebrew: Story = {
  render: () => <div dir="rtl" lang="he" style={{ marginInlineStart: 220 }}><SourceNote note='נושא הזה קשור ל-"בראשית א׳:ב׳" על ידי אספקלריא.' /></div>,
};
