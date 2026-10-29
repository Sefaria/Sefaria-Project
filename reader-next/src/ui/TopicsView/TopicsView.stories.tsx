import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { TopicSearch } from "./TopicSearch";
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

const TOPICS = ["Grass", "Grasshopper", "Grass Offering", "Grain", "Grape"];
/** A moderator (is_staff) sees the topic search above the list; the suggestions and the add are faked here. */
export const Moderator: Story = {
  args: {
    search: (
      <TopicSearch
        createPrefix="Create a new topic: "
        getSuggestions={async (w) => [...TOPICS.filter((t) => t.toLowerCase().startsWith(w.trim().toLowerCase())).slice(0, 4).map((t) => ({ name: t, key: t.toLowerCase() })), { name: `Create a new topic: ${w.trim()}`, key: "" }]}
        onAdd={async () => {}}
        createHref={() => "https://www.sefaria.org/Genesis.1.11?with=Topics"}
      />
    ),
  },
};
