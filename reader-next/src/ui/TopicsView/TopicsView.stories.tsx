import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { TopicsView } from "./TopicsView";
import { GENESIS_1_1 } from "./story-data";

const meta = {
  title: "Connections/TopicsView",
  component: TopicsView,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 420, padding: 16 }}><Story /></div>],
  parameters: { docs: { description: { component: "Topics related to the selected passage, with their descriptions and who connected them (behind the three dots). Data: the real topics of Genesis 1:1." } } },
  args: { topics: GENESIS_1_1, refLabel: "Genesis 1:1", topicHref: (s: string) => `https://www.sefaria.org/topics/${s}`, lang: "en" },
} satisfies Meta<typeof TopicsView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Genesis1_1: Story = {};
export const None: Story = { args: { topics: [] } };
export const Loading: Story = { args: { loading: true } };
export const Hebrew: Story = {
  args: { lang: "he", refLabel: "בראשית א׳:א׳" },
  decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><div dir="rtl"><Story /></div></InterfaceLangProvider>],
};
