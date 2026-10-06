import type { Meta, StoryObj } from "@storybook/react-vite";
import { TranslationOpenView } from "./TranslationOpenView";
import { storyLanguages } from "./story-data";

const versions = storyLanguages().flatMap((l) => l.versions);
const find = (title: string) => versions.find((v) => v.versionTitle === title)!;

const meta = {
  title: "Connections/TranslationOpenView",
  component: TranslationOpenView,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 420, padding: 16 }}><Story /></div>],
  parameters: { docs: { description: { component: "One translation previewed in the sidebar: its name, the selected passage in only that translation, and Open. Data: the real Genesis 1:1 response." } } },
  args: { version: find("The Koren Jerusalem Bible"), lang: "en", openHref: "/Genesis.1.1?ven=english|The_Koren_Jerusalem_Bible" },
} satisfies Meta<typeof TranslationOpenView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Koren: Story = {};
export const WithFootnotes: Story = { args: { version: find("THE JPS TANAKH: Gender-Sensitive Edition") } };
export const German: Story = { args: { version: versions.find((v) => /Wohlgemuth/.test(v.versionTitle))!, lang: "de" } };
export const Loading: Story = { args: { version: undefined, loading: true } };
export const NoText: Story = { args: { version: undefined } };
