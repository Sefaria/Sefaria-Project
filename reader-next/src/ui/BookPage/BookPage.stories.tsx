import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { tocStructures, type TocIndexRecord } from "~/lib/toc/model";
import { TocView } from "../TocView/TocView";
import genesis from "../../../fixtures/api/genesis-1/index-contracted.json";
import berakhot from "../../../fixtures/api/berakhot-2a/index-contracted.json";
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
