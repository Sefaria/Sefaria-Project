import type { Meta, StoryObj } from "@storybook/react-vite";
import { MaskIcon } from "./MaskIcon";

const meta = {
  title: "Primitives/MaskIcon",
  component: MaskIcon,
  tags: ["autodocs"],
  args: { src: "/icons/search_mdl.svg", size: 24 },
  parameters: { docs: { description: { component: "sefaria.org's icon files, coloured by the text colour (a token) so they follow the theme." } } },
} satisfies Meta<typeof MaskIcon>;
export default meta;
type Story = StoryObj<typeof meta>;

const ICONS = ["search_mdl", "heavy-x", "sort", "chevron-down-line", "sliders-horizontal", "book", "collection", "topic", "iconmonstr-pen-17", "iconmonstr-book-15", "iconmonstr-view-6", "iconmonstr-script-2", "iconmonstr-hashtag-1", "iconmonstr-magnifier-2", "profile", "chevron-right-sm"];

export const Default: Story = {};
export const All: Story = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, color: "var(--sefaria-color-text-dark-grey)" }}>
      {ICONS.map((n) => <span key={n} title={n}><MaskIcon src={`/icons/${n}.svg`} size={24} /></span>)}
    </div>
  ),
};
