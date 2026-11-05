import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { SourceCard } from "./SourceCard";
import { AuthorWorks, SourceFilterBar, TopicHeader, TopicPageLayout, TopicTabs } from "./TopicPage";
import { PortalModules, TopicSideColumn } from "./TopicSide";

const LEGACY_LINKS = { a11y: { config: { rules: [{ id: "link-in-text-block", enabled: false }] } } };
const IMAGE = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="390"><rect width="300" height="390" fill="#ccb479"/></svg>');

const CARD = {
  analytics: { position: 0, ai: "human", item_id: "Deuteronomy 34:10-12", content_id: "Deuteronomy", content_type: "Tanakh|Torah" },
  visible: true,
  color: "var(--sefaria-cat-tanakh)",
  href: "/Deuteronomy.34.10-12",
  citation: { en: "Deuteronomy 34:10-12", he: "דברים ל״ד:י׳-י״ב" },
  text: {
    en: "Never again did there arise in Israel a prophet like Moses—whom G<small>OD</small> singled out, face to face.",
    he: "וְלֹא־קָם נָבִיא עוֹד בְּיִשְׂרָאֵל כְּמֹשֶׁה אֲשֶׁר יְדָעוֹ יְהֹוָה פָּנִים אֶל־פָּנִים׃",
  },
  language: "english" as const,
};
const INTRO = { title: { en: "An Unmatched Prophet", he: "לא קם נביא עוד בישראל כמשה" }, prompt: { en: "Moses is considered the greatest prophet who ever lived.", he: "משה היה החשוב מבין נביאי ישראל." }, categoryLabel: "TANAKH", open: true };

/**
 * The single topic page's parts (the old TopicPage, Story's TopicTextPassage, TopicSideColumn and PortalNavSideBar): a source card in
 * its three forms, the header, the tabs with the funnel and the language choice, the filter bar, an author's works, the side column
 * and a partner portal's modules.
 */
const meta = {
  title: "Topics/Topic page",
  component: SourceCard,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 680, padding: 16 }}><Story /></div>],
  args: CARD,
} satisfies Meta<typeof SourceCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A source on Sources or Top Citations: the text (a link to it) and its citation, with its category's colour bar. */
export const Source: Story = {};

/** A notable source: its curated title and the book's category over the prompt, folded in a <details> (the first one open). */
export const NotableSource: Story = {
  args: { intro: INTRO },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const title = /An Unmatched Prophet|לא קם נביא עוד בישראל כמשה/;
    const prompt = /the greatest prophet who ever lived|החשוב מבין נביאי ישראל/;
    await expect(c.getByText(title)).toBeVisible();
    await expect(c.getByText(prompt)).toBeVisible();
    await userEvent.click(c.getByText(title));
    await expect(c.getByText(prompt)).not.toBeVisible();
  },
};

/** Source with Translation: the Hebrew first, then the English. */
export const Bilingual: Story = { args: { language: "bilingual" } };

/** Moderators on the Admin tab: a review state per language (click: Reviewed). */
export const AdminReview: Story = { args: { intro: INTRO, review: { en: "not reviewed", he: "reviewed", onMark: fn() } } };

/** The header of a Torah portion: category, dedication, description, Read the Portion and the Study Companion; the AI marker. */
export const Header: Story = {
  parameters: LEGACY_LINKS,
  render: () => (
    <TopicHeader
      title={{ en: "Parashat Bereshit", he: "פרשת בראשית" }}
      aiNotice
      category={{ href: "/topics/category/torah-portions", en: "Torah Portions", he: "פרשות השבוע" }}
      dedication={{ en: "Parashat Bereshit is dedicated to the [Sefaria Pioneers](/pioneers).", he: "פרשת בראשית מוקדשת [לחלוצי ספריא](/pioneers)." }}
      description={{ en: "Bereshit is the first parashah of the annual Torah reading cycle.", he: "פרשת בראשית, הפרשה הראשונה בתורה." }}
      refButton={{ href: "/Genesis.1.1-6.8", en: "Read the Portion", he: "קראו את הפרשה", studyCompanion: true }}
      admin={{ buttons: [{ en: "Add a source", he: "Add a source", onClick: fn() }, { en: "Edit", he: "Edit", onClick: fn() }, { en: "Generate", he: "Generate", onClick: fn() }] }}
    />
  ),
  // the AI notice's links are in the page from the start (hidden), shown while the marker is hovered
  play: async ({ canvasElement }) => {
    const learn = canvasElement.querySelector<HTMLAnchorElement>('[data-anl-event="learn_more_click:click"]')!;
    await expect(learn).toBeInTheDocument();
    await expect(learn).not.toBeVisible();
    await userEvent.hover(canvasElement.querySelector('img[data-anl-event="ai_marker_hover:mouseover"]')!);
    await waitFor(() => expect(learn).toBeVisible()); // it fades in over 0.5s
  },
};

function TabsDemo() {
  const [tab, setTab] = useState("sources");
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState("translation");
  const [sort, setSort] = useState("Relevance");
  return (
    <TopicTabs
      tabs={[{ id: "notable-sources", title: { en: "Notable Sources", he: "מקורות מרכזיים" } }, { id: "sources", title: { en: "Sources", he: "מקורות" } }]}
      current={tab}
      onSelect={setTab}
      {...(tab !== "notable-sources" ? { filter: { open, onToggle: () => setOpen((o) => !o), sort } } : {})}
      language={{ choice, choices: [{ id: "source", en: "Source", he: "מקור" }, { id: "translation", en: "Translation", he: "תרגום" }, { id: "sourcewtrans", en: "Source with Translation", he: "מקור ותרגום" }], onChoose: setChoice }}
    >
      {open ? <SourceFilterBar filter="" onFilter={fn()} options={[{ id: "Relevance", en: "Relevance", he: "רלוונטיות" }, { id: "Chronological", en: "Chronological", he: "כרונולוגי" }]} sort={sort} onSort={setSort} /> : null}
      <SourceCard {...CARD} />
    </TopicTabs>
  );
}

/** The tabs: the funnel (not on Notable Sources) opens the filter and sort bar; the "A" chooses the texts' language. */
export const Tabs: Story = {
  render: () => <TabsDemo />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: /Filter and sort|סינון ומיון/ }));
    await expect(c.getByRole("button", { name: /Chronological|כרונולוגי/ })).toBeVisible();
    await userEvent.click(c.getByRole("button", { name: /^(A|א)$/ }));
    await expect(c.getByRole("radio", { name: /^(Translation|תרגום)$/ })).toBeChecked();
    await userEvent.click(c.getByRole("tab", { name: /Notable Sources|מקורות מרכזיים/ }));
    await expect(c.queryByRole("button", { name: /Filter and sort|סינון ומיון/ })).toBeNull();
  },
};

/** Works on Sefaria (an author): titles and descriptions, two to a row. */
export const Works: Story = {
  render: () => (
    <AuthorWorks
      works={[
        { href: "/texts/Tanakh/Rishonim on Tanakh/Rashi", title: { en: "Rashi on Tanakh", he: "רש״י על תנ״ך" }, description: { en: "Most widely-read biblical commentary.", he: "הפירוש הנפוץ ביותר לתורה." } },
        { href: "/Rashi_on_Avot", title: { en: "Rashi on Avot", he: "רש״י על משנה אבות" }, description: {} },
        { href: "/texts/Talmud/Rishonim on Talmud/Rashi", title: { en: "Rashi on Talmud", he: "רש״י על תלמוד" }, description: { en: "Classic 11th-century commentary." } },
      ]}
    />
  ),
};

/** The side column: the picture, Lived, Learn More, Readings and related topics (ten, then More). */
export const SideColumn: Story = {
  decorators: [(Story) => <div style={{ width: 420, background: "var(--sefaria-color-surface-subtle)" }}><Story /></div>],
  render: () => (
    <TopicSideColumn
      image={{ uri: IMAGE, caption: { en: "Creation of the World, 1905", he: "בריאת העולם, 1905" } }}
      lived={{ name: { en: "", he: "" }, yearRange: { en: "1040 – 1105 CE", he: "1040 – 1105 לספירה" } }}
      learnMore={[{ url: "https://en.wikipedia.org/wiki/Rashi", en: "Wikipedia", he: "ויקיפדיה" }]}
      readings={{
        date: { en: "October 30, 2027", he: "30 באוקטובר 2027" },
        hebrewDate: { en: "29th of Tishrei, 5788", he: "כ״ט תִשְׁרֵי תשפ״ח" },
        torah: { href: "/Genesis.1.1-6.8", en: "Genesis 1:1-6:8", he: "בראשית א:א-ו:ח" },
        aliyot: ["1", "2", "3", "4", "5", "6", "7", "M"].map((en, i) => ({ href: `/Genesis.${i + 1}`, ref: `Genesis ${i + 1}`, en, he: en === "M" ? "מ" : en })),
        haftarot: [{ href: "/I_Samuel.20.18-42", en: "I Samuel 20:18-42", he: "שמואל א כ:יח-מב" }],
      }}
      sections={[{ title: { en: "Related", he: "ראו גם" }, links: Array.from({ length: 12 }, (_, i) => ({ href: `/topics/t${i}`, title: { en: `Topic ${i + 1}`, he: `נושא ${i + 1}` } })) }]}
    />
  ),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getAllByRole("link", { name: /^(Topic|נושא) \d+$/ })).toHaveLength(10);
    await userEvent.click(c.getByRole("button", { name: /^(More|עוד)$/ }));
    await expect(c.getAllByRole("link", { name: /^(Topic|נושא) \d+$/ })).toHaveLength(12);
  },
};

/** A partner portal's modules in place of the side column. */
export const Portal: Story = {
  decorators: [(Story) => <div style={{ width: 420 }}><Story /></div>],
  render: () => (
    <TopicPageLayout
      batch={{ project: "topics" }}
      sideKind="portal"
      main={null}
      side={
        <PortalModules
          about={{ title: { en: "About the Collection", he: "על ספרי הרב זקס" }, imageUri: IMAGE, imageCaption: { en: "Credit: The Rabbi Sacks Legacy" }, description: { en: "Sefaria is proud to collaborate with The Rabbi Sacks Legacy.", he: "ספריא גאה לשתף פעולה עם מורשת הרב זקס." } }}
          organization={{ title: { en: "The Rabbi Sacks Legacy", he: "מורשת הרב זקס" }, description: { en: "Preserving and teaching the work of Rabbi Sacks.", he: "שימור והוראה." } }}
        />
      }
    />
  ),
};
