import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { TranslationsView } from "./TranslationsView";
import { CURRENT, storyLanguages } from "./story-data";

const meta = {
  title: "Connections/TranslationsView",
  component: TranslationsView,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 420, padding: 16 }}><Story /></div>],
  parameters: { docs: { description: { component: "The Translations sidebar view: every translation of the passage by language, with a preview, Select, and details (source, licence, Open Text). Data: the real Genesis 1:1 response." } } },
  args: {
    languages: storyLanguages(CURRENT),
    currentTitle: CURRENT,
    selectHref: (v) => `/Genesis.1.1?ven=${v.languageFamilyName}|${v.versionTitle.replace(/ /g, "_")}`,
    openHref: (v) => `/Genesis.1.1?ven=${v.languageFamilyName}|${v.versionTitle.replace(/ /g, "_")}`,
    urlRef: "Genesis.1.1",
  },
} satisfies Meta<typeof TranslationsView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Genesis1_1: Story = {};
export const PreviewsAreLinks: Story = { args: { previewHref: (v) => `/Genesis.1.1?vside=${v.versionTitle.replace(/ /g, "_")}|en&with=Translation Open` } };
export const Loading: Story = { args: { languages: [], loading: true } };
export const HebrewInterface: Story = {
  args: { languages: storyLanguages(CURRENT, "hebrew") },
  decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><div dir="rtl"><Story /></div></InterfaceLangProvider>],
};
