import type { Meta, StoryObj } from "@storybook/react-vite";
import { column, leaf, row, split, type LayoutNode } from "~/lib/layout/tree";
import { SplitView } from "./SplitView";

const Pane = ({ id }: { id: string }) => (
  <div style={{ padding: 16, height: "100%", boxSizing: "border-box", background: "var(--sefaria-color-surface-subtle, #f9f9f7)" }}>
    <strong>{id}</strong>
  </div>
);
const frame = (Story: () => React.ReactNode) => <div style={{ height: 320, border: "1px solid var(--sefaria-color-border)" }}><Story /></div>;

const meta = {
  title: "Layout/SplitView",
  component: SplitView,
  tags: ["autodocs"],
  decorators: [frame],
  parameters: { docs: { description: { component: "Renders a layout tree (rows and columns of leaves with fractional sizes). The single layout primitive for panels in the workspace and for the main view and side panels inside a panel. See docs/WORKSPACE.md." } } },
  args: { node: leaf("Text") as LayoutNode<string>, renderLeaf: (id: string) => <Pane id={id} /> },
} satisfies Meta<typeof SplitView<string>>;
export default meta;
type Story = StoryObj<typeof meta>;

export const OnePanel: Story = {};
/** Old reader: a text with its sidebar, 68/32. */
export const TextWithSidebar: Story = { args: { node: split("row", [leaf("Text"), leaf("Connections")], [0.68, 0.32]) } };
/** Old reader: text · sidebar · text, 37/26/37. */
export const ThreeColumns: Story = { args: { node: split("row", [leaf("Genesis 1"), leaf("Connections"), leaf("Exodus 1")], [0.37, 0.26, 0.37]) } };
/** Future: one panel above another. */
export const Stacked: Story = { args: { node: row(leaf("Genesis 1"), column(leaf("Exodus 1"), leaf("Leviticus 1"))) } };
/** Future: two side panels, one above the other. */
export const TwoSidePanels: Story = { args: { node: split("row", [leaf("Text"), column(leaf("Rashi"), leaf("Sheets"))], [0.68, 0.32]) } };
/** More panels than fit: each keeps its minimum width and the row scrolls sideways (old panel cap). */
export const Overflowing: Story = { args: { minLeafSize: 200, node: row(leaf("A"), leaf("B"), leaf("C"), leaf("D"), leaf("E"), leaf("F")) } };
/** Hebrew interface: panels run right to left. */
export const RightToLeft: Story = { args: { node: row(leaf("ראשון"), leaf("שני")) }, decorators: [(Story) => <div dir="rtl" style={{ height: "100%" }}><Story /></div>] };
