import type { Meta, StoryObj } from "@storybook/react-vite";
import { WebPagesView } from "./WebPagesView";
import { ALL, HADRAN, SITES } from "./story-data";

const meta = {
  title: "Connections/WebPagesView",
  component: WebPagesView,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 420, padding: 16 }}><Story /></div>],
  parameters: { docs: { description: { component: "Web pages that cite the selected passage: the sites with their page counts, and one site's pages. Data: the real pages for Berakhot 2a:1." } } },
  args: { pages: ALL, sites: SITES, siteHref: (n: string) => `?with=WebPage:${n}`, refLabel: (r: string) => r },
} satisfies Meta<typeof WebPagesView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Sites: Story = {};
export const OneSite: Story = { args: { site: "Hadran", pages: HADRAN } };
export const Loading: Story = { args: { loading: true, pages: [], sites: [] } };
export const NothingKnown: Story = { args: { pages: [], sites: [] } };
export const NothingFromSite: Story = { args: { site: "Hadran", pages: [] } };
