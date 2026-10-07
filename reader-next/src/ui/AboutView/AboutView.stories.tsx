import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { AboutView } from "./AboutView";
import { BERAKHOT, GENESIS, RASHI } from "./story-data";

const meta = {
  title: "Connections/AboutView",
  component: AboutView,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 420, padding: 16 }}><Story /></div>],
  parameters: { docs: { description: { component: "The About box: the book's details, the current translation and source versions with notes and facts, Select buttons, related topics and downloads. Data: the real API responses for Genesis, Berakhot and Rashi on Genesis." } } },
  args: GENESIS,
} satisfies Meta<typeof AboutView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Genesis: Story = {};
export const BerakhotTalmud: Story = { args: BERAKHOT };
export const RashiWithAuthor: Story = { args: RASHI };
export const Loading: Story = { args: { ...GENESIS, details: undefined, loading: true } };
export const Dictionary: Story = { args: { ...GENESIS, isDictionary: true } };
export const HebrewInterface: Story = {
  args: { ...RASHI, lang: "he" },
  decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><div dir="rtl"><Story /></div></InterfaceLangProvider>],
};
