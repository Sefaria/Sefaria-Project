import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { LexiconView } from "./LexiconView";
import { ABBA, BERESHIT } from "./story-data";

const meta = {
  title: "Connections/LexiconView",
  component: LexiconView,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 420, padding: 16 }}><Story /></div>],
  parameters: { docs: { description: { component: "Definitions for the words selected in the text: one entry per dictionary that applies (Strong's, Jastrow, BDB…), with nested senses, citations and attribution. Data: the real /api/words responses." } } },
  args: { words: "בְּרֵאשִׁ֖ית", entries: BERESHIT },
} satisfies Meta<typeof LexiconView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Bereshit: Story = {};
export const Abba: Story = { args: { words: "אבא", entries: ABBA } };
export const Loading: Story = { args: { entries: undefined, loading: true } };
export const NoDefinitions: Story = { args: { words: "בראשית ברא", entries: [] } };
export const EmptyBox: Story = { args: { words: undefined, entries: undefined } };
export const HebrewInterface: Story = {
  decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><div dir="rtl"><Story /></div></InterfaceLangProvider>],
};
