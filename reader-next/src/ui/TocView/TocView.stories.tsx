import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { TocView } from "./TocView";
import { BERAKHOT, BERAKHOT_BOTH, GENESIS, HAGGADAH, JASTROW, ZOHAR } from "./story-data";

const meta = {
  title: "Connections/TocView",
  component: TocView,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 420, padding: 16 }}><Story /></div>],
  parameters: { docs: { description: { component: "A book's table of contents from its real index record: chapter grids, Torah portions with their aliyot, Talmud chapters with dafs, titled parts of a complex text, dictionary letters. The reader's place is marked." } } },
  args: { structures: GENESIS },
} satisfies Meta<typeof TocView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const GenesisChaptersAndPortions: Story = {};
export const TalmudChapters: Story = { args: { structures: BERAKHOT } };
export const TalmudWithToggle: Story = { args: { structures: BERAKHOT_BOTH } };
export const ComplexText: Story = { args: { structures: HAGGADAH } };
export const ZoharDafs: Story = { args: { structures: ZOHAR } };
export const DictionaryLetters: Story = { args: { structures: JASTROW } };
export const HebrewInterface: Story = {
  decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><div dir="rtl"><Story /></div></InterfaceLangProvider>],
};
