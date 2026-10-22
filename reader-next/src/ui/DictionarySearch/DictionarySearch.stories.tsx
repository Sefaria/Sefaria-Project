import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { DictionarySearch } from "./DictionarySearch";

const WORDS = [["אור", "אוֹר"], ["אור I", "אוּר I"], ["אורא I", "אוּרָא I"], ["אורבא", "אוּרְבָּא"]] as const;

const meta = {
  title: "Search/DictionarySearch",
  component: DictionarySearch,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ padding: 16, minHeight: 260 }}><Story /></div>],
  args: { getCompletions: async () => WORDS, onSubmit: () => {} },
  parameters: { docs: { description: { component: "The dictionary word box: Hebrew only, completions as you type, the Hebrew keyboard in the English interface. Type אור." } } },
} satisfies Meta<typeof DictionarySearch>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const HebrewInterface: Story = { decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><div dir="rtl"><Story /></div></InterfaceLangProvider>] };
