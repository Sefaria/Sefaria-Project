import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { LibraryHome } from "../LibraryHome/LibraryHome";
import { SidebarFooter, SupportSefaria, Visualizations } from "../NavSidebar/NavSidebar";
import { CategoryPage } from "./CategoryPage";
import { TREE, contentsOf, he, withDefaultCorpus } from "./story-data";

const meta = {
  title: "Pages/CategoryPage",
  component: CategoryPage,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen", docs: { description: { component: "A category's page from a trimmed copy of the real catalog." } } },
  args: { cats: ["Tanakh", "Torah"], contents: contentsOf(["Tanakh", "Torah"]), he, footer: <SidebarFooter />, sidebar: <><Visualizations categories={["Tanakh", "Torah"]} /><SupportSefaria /></> },
} satisfies Meta<typeof CategoryPage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Torah: Story = {};
export const TanakhWithSections: Story = { args: { cats: ["Tanakh"], contents: contentsOf(["Tanakh"]) } };
export const TalmudWithToggle: Story = { args: { cats: withDefaultCorpus(["Talmud"]), contents: contentsOf(["Talmud"]) } };
export const HebrewContent: Story = { args: { hebrewContent: true }, decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><Story /></InterfaceLangProvider>] };
export const Home: StoryObj = { render: () => <LibraryHome tree={TREE} footer={<SidebarFooter />} /> };
