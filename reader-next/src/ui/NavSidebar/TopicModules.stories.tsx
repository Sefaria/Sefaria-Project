import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { AboutTopics, AZTopicsLink, BrowseTopics, GetTheApp, SponsorADay, StudyCompanion, TrendingTopics } from "./TopicModules";

const CATS = [
  { slug: "jewish-calendar2", primaryTitle: { en: "Jewish Calendar", he: "מועדי השנה" } },
  { slug: "torah-portions", primaryTitle: { en: "Torah Portions", he: "פרשות השבוע" } },
  { slug: "prayer", primaryTitle: { en: "Prayer", he: "תפילה" } },
];
const TRENDING = [
  { slug: "rashi", primaryTitle: { en: "Rashi", he: "רש״י" } },
  { slug: "lilith", primaryTitle: { en: "Lilith", he: "לילית" } },
  { slug: "noah", primaryTitle: { en: "Noah", he: "נח" } },
];

/** The topics pages' sidebar modules (the old NavSidebar's AboutTopics, TrendingTopics, TopicLandingTopicCatList, AZTopicsLink, SponsorADay, StudyCompanion, GetTheApp). */
const meta = {
  title: "Library/NavSidebar/Topic modules",
  component: TrendingTopics,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ width: 332, padding: "56px 44px", background: "var(--sefaria-color-surface-subtle)" }}><Story /></div>],
  args: { topics: TRENDING },
} satisfies Meta<typeof TrendingTopics>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Trending: Story = {};
/** The landing page's sidebar. */
export const LandingSidebar: Story = { render: () => <><BrowseTopics categories={CATS} /><TrendingTopics topics={TRENDING} /><AZTopicsLink /></> };
/** A category's sidebar (Torah Portions in English adds the Study Companion). */
export const CategorySidebar: Story = { render: () => <><AboutTopics /><StudyCompanion /><TrendingTopics topics={TRENDING} /><SponsorADay /></> };
/** The A–Z page's Get the Mobile App. */
export const MobileApp: Story = { render: () => <GetTheApp /> };
export const Hebrew: Story = {
  render: () => (
    <InterfaceLangProvider lang="hebrew">
      <div dir="rtl" lang="he"><BrowseTopics categories={CATS} /><TrendingTopics topics={TRENDING} /><AZTopicsLink /><SponsorADay /><GetTheApp /></div>
    </InterfaceLangProvider>
  ),
};
