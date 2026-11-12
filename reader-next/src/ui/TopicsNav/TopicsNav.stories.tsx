import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { AlphabetNav, TopicFilterBox } from "./AllTopics";
import { TopicCard, TopicCardGrid } from "./TopicCard";
import { FeaturedTopic, ParashaCard, SeasonalCard, TopicDeck, TopicLandingSearch, TopicNewsletter, TopicSalad } from "./TopicLanding";
import { CATEGORIES, PARASHA, SEASONAL, TOPICS } from "./story-data";

const href = (s: string) => `https://www.sefaria.org/topics/${s}`;
/**
 * The old cards' description links are blue (#4B71B7) on grey text with no underline, which axe's link-in-text-block flags (1.18:1).
 * Kept for parity with sefaria.org and recorded as an open accessibility question (wiki projects/reader-next/topics); only that one
 * rule is off, and only on the stories that show such a link.
 */
const LEGACY_LINKS = { a11y: { config: { rules: [{ id: "link-in-text-block", enabled: false }] } } };

/**
 * The topics navigation pages' parts (the old TopicsLandingPage, TopicCategory and TopicPageAll): a topic card and its grid, the
 * word cloud, the featured topic, the newsletter, the random cards, the portion and calendar cards, the landing search, the A–Z bar.
 */
const meta = {
  title: "Topics/Navigation",
  component: TopicCard,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 783, padding: 16 }}><Story /></div>],
  args: { href: href("tallit"), title: TOPICS[0]!.primaryTitle, description: TOPICS[0]!.description, analyticsEvent: "navto_topic:click" },
} satisfies Meta<typeof TopicCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One card of a category or the A–Z list: the title, three lines of description. */
export const Card: Story = {};

/** The landing page's card: fixed height, blue top, "Explore … ›". */
export const DescribedCard: Story = {
  args: { variant: "described", bottomLink: { href: href("sarah"), en: "Explore Sarah ›", he: "למדו עוד על שרה ›" }, title: TOPICS[1]!.primaryTitle, description: TOPICS[1]!.description },
  decorators: [(Story) => <div style={{ display: "flex", width: 248 }}><Story /></div>],
};

/** Two to a row, a hairline over the first row; a markdown link in a description is blue. */
export const Grid: Story = {
  parameters: LEGACY_LINKS,
  render: () => (
    <TopicCardGrid>
      {TOPICS.slice(0, 3).map((t) => <TopicCard key={t.slug} href={href(t.slug)} title={t.primaryTitle} description={t.description} />)}
    </TopicCardGrid>
  ),
};

/** The word cloud: five centred lines, bullets between items on a line. */
export const Salad: Story = { render: () => <TopicSalad items={TOPICS} phone={false} topicHref={href} /> };
/** On a phone: one scrolling row of blue pills. */
export const SaladPhone: Story = { render: () => <div style={{ width: 360 }}><TopicSalad items={TOPICS} phone topicHref={href} /></div> };
/** Waiting for the sample: the upper rainbow slides, no lower one. */
export const SaladLoading: Story = { render: () => <TopicSalad items={undefined} phone={false} topicHref={href} /> };

export const Featured: Story = {
  render: () => <FeaturedTopic topic={{ ...TOPICS[0]!, imageUrl: "https://storage.googleapis.com/img.sefaria.org/topics/tallit-secondary.jpg", imageCaption: { en: "Men praying in tallitot", he: "" } }} topicHref={href} />,
};

/** The newsletter form: checks the names and address before asking the server (faked here: it resolves). */
export const Newsletter: Story = {
  render: () => <TopicNewsletter validEmail={(e) => /@/.test(e)} subscribe={async () => {}} analytics={{ form_name: "newsletter_topics" }} />,
  play: async ({ canvasElement, globals }) => {
    const he = globals.interfaceLang === "hebrew";
    const t = (en: string, h: string) => (he ? h : en);
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: t("Sign Up", "להרשמה") }));
    await expect(c.getByRole("status")).toHaveTextContent(t("Please enter a valid first and last name.", "נא להוסיף שם פרטי ושם משפחה."));
    await userEvent.type(c.getByLabelText(t("First Name", "שם פרטי")), "Ada");
    await userEvent.type(c.getByLabelText(t("Last Name", "שם משפחה")), "Lovelace");
    await userEvent.type(c.getByLabelText(t("Email Address", 'כתובת דוא"ל')), "ada@example.com");
    await userEvent.click(c.getByRole("button", { name: t("Sign Up", "להרשמה") }));
    await expect(await c.findByText(t("Subscribed! Welcome to our list.", "הרשמה בוצעה בהצלחה!"))).toBeVisible();
  },
};

export const Deck: Story = { parameters: LEGACY_LINKS, render: () => <TopicDeck topics={TOPICS.slice(0, 3)} topicHref={href} /> };

export const PortionAndCalendar: Story = {
  render: () => (
    <div style={{ display: "flex" }}>
      <ParashaCard parasha={PARASHA} reading={{ url: "Genesis.23.1-25.18", ref: { en: "Genesis 23:1-25:18", he: "בראשית כ״ג:א׳-כ״ה:י״ח" } }} topicHref={href} />
      <SeasonalCard seasonal={SEASONAL} topicHref={href} />
    </div>
  ),
};

/** The landing search with its suggestions open (typing shows them after two letters). */
export const Search: Story = {
  render: () => <TopicLandingSearch numOfTopics={5768} suggestions={[{ text: "Shabbat", categoryText: "(Jewish Calendar)", slug: "shabbat" }, { text: "Shabbat Candles", categoryText: "(Jewish Calendar > Shabbat)", slug: "shabbat-candles" }]} onInput={() => {}} onChoose={() => {}} />,
  play: async ({ canvasElement, globals }) => {
    const c = within(canvasElement);
    const box = c.getByRole("combobox");
    await expect(box).toHaveAttribute("placeholder", globals.interfaceLang === "hebrew" ? "חיפוש לפי נושא" : "Search 5,768 Topics A-Z");
    await userEvent.type(box, "sh");
    await expect(c.getAllByRole("option")).toHaveLength(2);
    await userEvent.keyboard("{ArrowDown}");
    await expect(c.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
  },
};

export const AToZ: Story = {
  render: () => (
    <>
      <TopicFilterBox value="" onChange={() => {}} />
      <AlphabetNav letters={"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")} />
    </>
  ),
};

/** The Hebrew interface: cards from the right; an English-only description stays a left-to-right block. */
export const Hebrew: Story = {
  render: () => (
    <InterfaceLangProvider lang="hebrew">
      <div dir="rtl" lang="he">
        <TopicLandingSearch numOfTopics={5768} suggestions={[]} onInput={() => {}} onChoose={() => {}} />
        <TopicCardGrid>
          {CATEGORIES.map((c) => <TopicCard key={c.slug} routed href={`/topics/category/${c.slug}`} title={c.primaryTitle} description={{ en: "An English-only description." }} />)}
        </TopicCardGrid>
        <AlphabetNav letters={["א", "ב", "ג", "ד"]} />
      </div>
    </InterfaceLangProvider>
  ),
};
