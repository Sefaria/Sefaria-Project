import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { EntityResults, ExactToggle, MobileFilterButton, MobileFilterPanel, PanelSection, SearchError, SearchSkeleton, SortRadios, NoResults, SearchBar, SearchFilters, SearchResultCard, SearchTabs, SortMenu } from "./SearchPage";
import { ENTITY_SORTS } from "~/lib/search/search-page";
import { AUTHORS, BOOKS, HITS, TOPICS, TREE, TREE_APPLIED, hrefFor } from "./story-data";

const meta = {
  title: "Search/SearchPage",
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 700, padding: 16 }}><Story /></div>],
  parameters: { docs: { description: { component: "The pieces of the search results page, from real responses for 'light'." } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const hebrew = (S: () => React.ReactNode) => <InterfaceLangProvider lang="hebrew"><div dir="rtl">{S()}</div></InterfaceLangProvider>;

export const Bar: Story = { render: () => <SearchBar query="light" onSubmit={() => {}} /> };
export const Tabs: Story = { render: () => <SearchTabs active="sources" counts={{ sources: "10,000+", books: "1", authors: "1", topics: "21" }} hrefFor={(t) => `?tab=${t}`} onTab={() => {}} /> };
export const TabsLoading: Story = { render: () => <SearchTabs active="sources" counts={{}} hrefFor={(t) => `?tab=${t}`} onTab={() => {}} /> };
export const Toggle: Story = { render: () => <ExactToggle exact={false} onChange={() => {}} /> };
export const ToggleExact: Story = { render: () => <ExactToggle exact onChange={() => {}} /> };
export const Sort: Story = { render: () => <SortMenu sort="relevance" onChange={() => {}} /> };
export const SortDisabled: Story = { render: () => <SortMenu sort="relevance" onChange={() => {}} disabled /> };
export const Card: Story = { render: () => <SearchResultCard hit={HITS[0]!} hrefFor={hrefFor} onOpen={() => {}} /> };
export const Cards: Story = { render: () => <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 20 }}>{HITS.slice(0, 4).map((h) => <li key={h._id}><SearchResultCard hit={h} hrefFor={hrefFor} onOpen={() => {}} /></li>)}</ul> };
export const Filters: Story = { render: () => <SearchFilters tree={TREE} applied={[]} onToggle={() => {}} /> };
export const FiltersApplied: Story = { render: () => <SearchFilters tree={TREE_APPLIED} applied={["Kabbalah"]} onToggle={() => {}} /> };
export const Books: Story = { render: () => <EntityResults type="book" hits={BOOKS} empty={null} /> };
export const Authors: Story = { render: () => <EntityResults type="author" hits={AUTHORS} empty={null} /> };
export const Topics: Story = { render: () => <EntityResults type="topic" hits={TOPICS} empty={null} /> };
export const Empty: Story = { render: () => <NoResults tab="sources" query="zzzxqkw" /> };
export const HebrewTabs: Story = { render: () => hebrew(() => <SearchTabs active="sources" counts={{ sources: "10,000+", books: "1" }} hrefFor={(t) => `?tab=${t}`} onTab={() => {}} />) };
export const HebrewFilters: Story = { render: () => hebrew(() => <SearchFilters tree={TREE} applied={[]} onToggle={() => {}} />) };
export const SortEntity: Story = { render: () => <SortMenu sort="relevance" options={ENTITY_SORTS.book} onChange={() => {}} /> };
export const BooksHebrew: Story = { render: () => hebrew(() => <EntityResults type="book" hits={BOOKS} empty={null} />) };
export const MobileTabs: Story = { render: () => <div style={{ width: 390 }}><SearchTabs mobile active="sources" counts={{ sources: "10,000+", books: "1", authors: "1", topics: "21" }} hrefFor={(t) => `?tab=${t}`} onTab={() => {}} /></div> };
export const MobileButton: Story = { render: () => <div style={{ width: 390 }}><MobileFilterButton onClick={() => {}} /></div> };
export const MobilePanel: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <MobileFilterPanel title="Filters" onClose={() => {}}>
      <PanelSection title="Search Type"><ExactToggle block exact={false} onChange={() => {}} /></PanelSection>
      <PanelSection title="Sort by"><SortRadios name="s" value="relevance" options={ENTITY_SORTS.topic} onChange={() => {}} /></PanelSection>
      <PanelSection title="Filters"><SearchFilters tree={TREE} applied={[]} onToggle={() => {}} /></PanelSection>
    </MobileFilterPanel>
  ),
};
export const Loading: Story = { render: () => <SearchSkeleton /> };
export const Failed: Story = { render: () => <SearchError onRetry={() => {}} /> };
export const FailedMore: Story = { render: () => <SearchError more onRetry={() => {}} /> };
