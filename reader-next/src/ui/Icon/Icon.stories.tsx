import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon, ICON_NAMES } from "./Icon";

const meta = {
  title: "Primitives/Icon",
  component: Icon,
  tags: ["autodocs"],
  args: { name: "search" },
  argTypes: { name: { options: ICON_NAMES, control: "select" } },
  parameters: { docs: { description: { component: "Stroke icons that follow `currentColor`. Decorative by default; pass `label` to make one meaningful. Add icons to the registry, never inline SVG in features." } } },
} satisfies Meta<typeof Icon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {};
export const Labelled: Story = { args: { label: "Search" } };
export const Gallery: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 16, width: 520 }}>
      {ICON_NAMES.map((n) => (
        <div key={n} style={{ display: "grid", justifyItems: "center", gap: 6, fontSize: 12 }}>
          <Icon name={n} size={28} />
          {n}
        </div>
      ))}
    </div>
  ),
};
