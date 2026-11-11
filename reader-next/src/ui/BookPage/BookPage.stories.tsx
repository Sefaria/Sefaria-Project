import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { tocStructures, type TocIndexRecord } from "~/lib/toc/model";
import { TocView } from "../TocView/TocView";
import genesis from "../../../fixtures/api/genesis-1/index-contracted.json";
import berakhot from "../../../fixtures/api/berakhot-2a/index-contracted.json";
import berakhotVersions from "../../../fixtures/api/berakhot-2a/versions.json";
import { DownloadVersions } from "../DownloadVersions/DownloadVersions";
import { RelatedTopics } from "../RelatedTopics/RelatedTopics";
import { BookPage } from "./BookPage";

const g = genesis as unknown as TocIndexRecord;
const meta = {
  title: "Pages/BookPage",
  component: BookPage,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen", docs: { description: { component: "A book's own page, from the real Genesis index record." } } },
  args: {
    title: { en: "Genesis", he: "בראשית" },
    category: { en: "Tanakh", he: "תנ״ך", href: "https://www.sefaria.org/texts/Tanakh" },
    readHref: "/Genesis.1",
    tab: "contents",
    tabHref: (t: string) => `/Genesis?tab=${t}`,
    contents: <TocView structures={tocStructures(g)} variant="page" />,
    versionHref: () => "/Genesis.1",
    description: { en: (genesis as { enDesc?: string }).enDesc, he: (genesis as { heDesc?: string }).heDesc },
    colorCategory: "Tanakh",
  },
} satisfies Meta<typeof BookPage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Genesis: Story = {};
export const Talmud: Story = {
  args: {
    title: { en: "Berakhot", he: "ברכות" },
    category: { en: "Talmud", he: "תלמוד", href: "https://www.sefaria.org/texts/Talmud/Bavli" },
    attribution: { en: "The William Davidson Edition", he: "מהדורת ויליאם דוידסון", href: "https://www.sefaria.org/william-davidson-talmud" },
    contents: <TocView structures={tocStructures(berakhot as unknown as TocIndexRecord)} variant="page" />,
    colorCategory: "Talmud",
  },
};
export const ContinueReading: Story = { args: { continueReading: true, readHref: "/Genesis.12.3" } };
export const VersionsLoading: Story = { args: { tab: "versions", versions: undefined } };
export const Hebrew: Story = { decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><Story /></InterfaceLangProvider>] };

/** The Versions tab keeps the sidebar (About, related topics, Download Text), as on sefaria.org. Data: Berakhot's real index and versions. */
const berakhotIndex = berakhot as unknown as { enDesc?: string; heShortDesc?: string; relatedTopics: { slug: string; title: { en: string; he: string } }[] };
const versionsTab = {
  title: { en: "Berakhot", he: "ברכות" },
  category: { en: "Talmud", he: "תלמוד", href: "https://www.sefaria.org/texts/Talmud/Bavli" },
  readHref: "/Berakhot.2a",
  tab: "versions" as const,
  tabHref: (t: string) => `/Berakhot?tab=${t}`,
  contents: <TocView structures={tocStructures(berakhot as unknown as TocIndexRecord)} variant="page" />,
  versions: berakhotVersions as never,
  // each version's own first section, as BookRoute links it
  versionHref: ((v: { versionTitle: string; isPrimary: boolean; languageFamilyName: string; firstSectionRef?: string }) =>
    `/${(v.firstSectionRef ?? "Berakhot 2a").replace(/ /g, ".")}?${v.isPrimary ? "vhe" : "ven"}=${v.languageFamilyName}|${v.versionTitle.replace(/ /g, "_")}`) as never,
  description: { en: berakhotIndex.enDesc, heShort: berakhotIndex.heShortDesc },
  colorCategory: "Talmud",
  sidebar: (
    <>
      <RelatedTopics topics={berakhotIndex.relatedTopics} topicHref={(slug) => `/topics/${slug}`} />
      <DownloadVersions title="Berakhot" versions={berakhotVersions as never} origin="" />
    </>
  ),
};
export const VersionsTab: Story = { args: versionsTab };
export const VersionsTabModerator: Story = { args: { ...versionsTab, editVersion: (v, close) => <button type="button" onClick={close}>Close editor for {v.versionTitle}</button> } };
export const VersionsTabHebrew: Story = {
  args: versionsTab,
  decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><div dir="rtl" lang="he"><Story /></div></InterfaceLangProvider>],
};
