import type { Meta, StoryObj } from "@storybook/react-vite";
import { categoryView, essaysFor, linkSummary, topLevelSummary } from "~/lib/connections/summary";
import { linksForRefs } from "~/lib/connections/links";
import { PASSAGES } from "../TextSection/passages";
import { CategoryView } from "./CategoryView";
import { ConnectionsPanel, ResourcesTitle } from "./ConnectionsPanel";
import { ResourcesView } from "./ResourcesView";
import { STORY_CATALOG, STORY_LINKS } from "./story-data";
import { TextList, type LinkedTextItem } from "./TextList";

const meta = {
  title: "Reader/ConnectionsPanel",
  component: ConnectionsPanel,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The resources sidebar and its views, built from real recorded Genesis 1:1 links. Resources shows the connection categories (Quoting Commentary folded into Commentary, four rows until More); a category shows its books; a filter shows the connected texts, one language at a time. Atlas: CON-003, CON-012, CON-019, CON-023–026, CON-030–033, CON-070.",
      },
    },
  },
  args: { label: "Resources", children: null },
  decorators: [(Story) => <div style={{ width: 410, height: 720, border: "1px solid var(--sefaria-color-border)" }}><Story /></div>],
} satisfies Meta<typeof ConnectionsPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

const BASE = "/Genesis.1.1";
const verse = linksForRefs(STORY_LINKS, ["Genesis 1:1"]);
const summary = linkSummary(verse, { catalog: STORY_CATALOG, baseCategory: "Tanakh" });

export const Resources: Story = {
  render: () => (
    <ConnectionsPanel label="Resources" title={<ResourcesTitle />} onClose={() => {}}>
      <ResourcesView
        summary={topLevelSummary(summary, essaysFor(STORY_LINKS, { en: "THE JPS TANAKH: Gender-Sensitive Edition" }))}
        catalog={STORY_CATALOG}
        basePath={BASE}
        counts={{ sheets: 979, webpages: null, audio: 1, topics: 7, manuscripts: 1, guides: 0, translations: 46 }}
        sheetsHref="https://voices.sefaria.org/sheets-with-ref/Genesis.1.1"
      />
    </ConnectionsPanel>
  ),
};

export const CommentaryCategory: Story = {
  render: () => (
    <ConnectionsPanel label="Commentary" back={{ href: `${BASE}?with=all`, label: "Resources" }} onClose={() => {}}>
      <CategoryView categories={categoryView(summary, "Commentary")} catalog={STORY_CATALOG} basePath={BASE} />
    </ConnectionsPanel>
  ),
};

export const TalmudCategory: Story = {
  render: () => (
    <ConnectionsPanel label="Talmud" back={{ href: `${BASE}?with=all`, label: "Resources" }} onClose={() => {}}>
      <CategoryView categories={categoryView(summary, "Talmud")} catalog={STORY_CATALOG} basePath={BASE} />
    </ConnectionsPanel>
  ),
};

const rashi = PASSAGES.rashiGenesis1_1;
const items: LinkedTextItem[] = rashi.segments.map((s) => ({
  id: s.ref,
  sourceRef: s.ref,
  sourceHeRef: s.ref,
  href: `/${s.ref.replace(/ /g, "_").replace(/:/g, ".")}`,
  primary: s.primary ? { html: s.primary, lang: "he", dir: "rtl" } : undefined,
  translation: s.translation ? { html: s.translation, lang: "en", dir: "ltr" } : undefined,
}));

export const RashiTextList: Story = {
  render: () => (
    <ConnectionsPanel label="Rashi" back={{ href: `${BASE}?with=Commentary+ConnectionsList`, label: "Commentary" }} onClose={() => {}}>
      <TextList title={{ en: "Rashi", he: 'רש"י' }} color="var(--sefaria-cat-commentary)" language="english" hideItemTitles items={items} />
    </ConnectionsPanel>
  ),
};

export const RashiTextListHebrew: Story = {
  render: () => (
    <ConnectionsPanel label="Rashi" back={{ href: BASE, label: "Resources" }}>
      <TextList title={{ en: "Rashi", he: 'רש"י' }} color="var(--sefaria-cat-commentary)" language="hebrew" hideItemTitles items={items} />
    </ConnectionsPanel>
  ),
};

export const TalmudTextListWithTitles: Story = {
  render: () => (
    <ConnectionsPanel label="Talmud" back={{ href: BASE, label: "Resources" }}>
      <TextList title={{ en: "Talmud", he: "תלמוד" }} color="var(--sefaria-cat-talmud)" language="english" hideItemTitles={false} items={items.slice(0, 2).map((i) => ({ ...i, sourceRef: "Chagigah 11b:5" }))} />
    </ConnectionsPanel>
  ),
};

export const TextListLoading: Story = {
  render: () => (
    <ConnectionsPanel label="Rashi" back={{ href: BASE, label: "Resources" }}>
      <TextList title={{ en: "Rashi", he: 'רש"י' }} language="english" hideItemTitles items={[]} loading />
    </ConnectionsPanel>
  ),
};

export const NoConnections: Story = {
  render: () => (
    <ConnectionsPanel label="Resources" title={<ResourcesTitle />} onClose={() => {}}>
      <ResourcesView summary={topLevelSummary([])} catalog={STORY_CATALOG} basePath={BASE} />
    </ConnectionsPanel>
  ),
};

export const HebrewInterface: Story = {
  globals: { interfaceLang: "hebrew" },
  render: () => (
    <ConnectionsPanel label="Resources" title={<ResourcesTitle />} onClose={() => {}}>
      <ResourcesView summary={topLevelSummary(summary)} catalog={STORY_CATALOG} basePath={BASE} />
    </ConnectionsPanel>
  ),
};
