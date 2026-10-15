import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { SidebarSearch } from "./SidebarSearch";
import { HEBREW_OR, LIGHT, hrefFor } from "./story-data";

const meta = {
  title: "Connections/SidebarSearch",
  component: SidebarSearch,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 420, padding: 16 }}><Story /></div>],
  parameters: { docs: { description: { component: "Search in this text: a box and the matches in the book, from real search responses (Genesis, 'light' and 'אור')." } } },
  args: { query: "light", results: LIGHT, hrefFor, onSearch: () => {}, onOpen: () => {} },
} satisfies Meta<typeof SidebarSearch>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Results: Story = {};
export const Hebrew: Story = { args: { query: "אור", results: HEBREW_OR } };
export const NoResults: Story = { args: { query: "zzzxqkw", results: [] } };
export const Searching: Story = { args: { results: undefined, loading: true } };
export const LoadingMore: Story = { args: { hasMore: true, loadingMore: true } };
export const Failed: Story = { args: { results: undefined, error: true } };
export const Empty: Story = { args: { query: "", results: undefined } };
export const HebrewInterface: Story = {
  decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><div dir="rtl"><Story /></div></InterfaceLangProvider>],
};
