import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import type { TranslationCorpus } from "~/lib/translations/translations-page";
import { AboutTranslatedText } from "../NavSidebar/AboutTranslatedText";
import { PromoSlot, SidebarFooter } from "../NavSidebar/NavSidebar";
import { TranslationsPage } from "./TranslationsPage";

const v = (book: string, title = "Die Heilige Schrift, trans. Dr. Simon Bernfeld, Berlin, 1902 - German [de]") =>
  `/${book.replace(/ /g, "_")}.1?ven=german%7C${encodeURIComponent(title).replace(/%20/g, "+")}&lang=bi`;
const SECTIONS: TranslationCorpus[] = [
  {
    corpus: { en: "Tanakh", he: 'תנ"ך' },
    prioritized: null,
    groups: [
      { category: { en: "Torah", he: "תורה" }, items: [["Genesis", "בראשית"], ["Exodus", "שמות"], ["Leviticus", "ויקרא"], ["Numbers", "במדבר"], ["Deuteronomy", "דברים"]].map(([en, he]) => ({ title: { en: en!, he: he! }, url: v(en!) })) },
      { category: { en: "Prophets", he: "נביאים" }, items: [["Joshua", "יהושע"], ["Judges", "שופטים"], ["I Samuel", "שמואל א"], ["II Samuel", "שמואל ב"]].map(([en, he]) => ({ title: { en: en!, he: he! }, url: v(en!) })) },
    ],
    uncategorized: [],
  },
  {
    corpus: { en: "Halakhah", he: "הלכה" },
    prioritized: [{ title: { en: "Kitzur Shulchan Arukh", he: "קיצור שלחן ערוך" }, url: v("Kitzur Shulchan Arukh") }],
    groups: [{ category: { en: "Mishneh Torah", he: "משנה תורה" }, items: [{ title: { en: "Mishneh Torah, Foundations of the Torah", he: "משנה תורה, הלכות יסודי התורה" }, url: v("Mishneh Torah, Foundations of the Torah") }] }],
    uncategorized: [{ title: { en: "A Text Outside The Catalog", he: "A Text Outside The Catalog" }, url: "/A_Text.1" }],
  },
];
const ABOUT = { title: "Eine lebendige Bibliothek der Tora", body: "Sefaria ist eine Bibliothek für jüdische Texte aus 3.000 Jahren." };

const meta = {
  title: "Pages/TranslationsPage",
  component: TranslationsPage,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen", docs: { description: { component: "/translations/<lang>: the texts in one translation language, by corpus (LIB-020)." } } },
  args: {
    title: "Jüdische Texte in Deutscher Sprache",
    titleLang: "de",
    titleDir: "ltr",
    sections: SECTIONS,
    sidebar: <><AboutTranslatedText about={ABOUT} lang="de" dir="ltr" /><PromoSlot /></>,
    footer: <SidebarFooter />,
  },
} satisfies Meta<typeof TranslationsPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const German: Story = {};
/** The English page starts with every block closed; its About module is the library's own. */
export const EnglishCollapsed: Story = {
  args: { title: "Jewish Texts in English", titleLang: "en", collapsed: true, sidebar: <AboutTranslatedText lang="en" dir="ltr" /> },
};
/** A right-to-left language's title in the English interface: the row stays left-aligned, the title reads right to left. */
export const Yiddish: Story = {
  args: { title: "יידישע טעקסטן אויף יידיש", titleLang: "yi", titleDir: "rtl", sidebar: <AboutTranslatedText about={{ title: "א לעבעדיקע ביבליאטעק פון תורה", body: "אין ספֿריאַ איז אַ היים פֿון 3,000 יאָר ייִדישע טעקסטן." }} lang="yi" dir="rtl" /> },
};
/** The list did not load (the API failed, as /api/texts/translations/he does on sefaria.org): the title and an empty tab. */
export const Empty: Story = { args: { sections: undefined } };
export const HebrewInterface: Story = { decorators: [(S) => <InterfaceLangProvider lang="hebrew"><S /></InterfaceLangProvider>] };
