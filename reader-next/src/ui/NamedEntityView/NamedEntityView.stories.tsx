import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { NamedEntityView } from "./NamedEntityView";

const eliezer = {
  slug: "rabbi-eliezer-b-hyrcanus",
  primaryTitle: { en: "Rabbi Eliezer b. Hyrcanus", he: "רבי אליעזר" },
  timePeriod: { name: { en: "Tannaim - Third Generation", he: "תנאים - דור שלישי" }, yearRange: { en: " c.80 – c.110 CE", he: " 80 – 110 לספירה בקירוב" } },
  description: { en: "Rabbi Eliezer ben Hyrcanus was a rabbinic sage in the first and second centuries of the Common Era and one of the most frequently quoted rabbis in the Mishnah.", he: "רבי אליעזר בן הורקנוס היה חכם בתקופת התנאים." },
};
const meta = {
  title: "Connections/NamedEntityView",
  component: NamedEntityView,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 420, padding: 16 }}><Story /></div>],
  args: { answer: eliezer, text: "Rabbi Eliezer", topicHref: (s: string) => `https://www.sefaria.org/topics/${s}`, sourceNote: 'This topic is connected to "Berakhot 2a:1" based on the research of Dr. Michael Sperling.' },
} satisfies Meta<typeof NamedEntityView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Person: Story = {};
export const NoDescription: Story = { args: { answer: { ...eliezer, description: null, timePeriod: null } } };
export const Ambiguous: Story = { args: { text: "Rabban Gamliel", answer: { slug: "rg-(ambiguous)", possibilities: [eliezer, { ...eliezer, slug: "rabban-gamliel", primaryTitle: { en: "Rabban Gamliel of Yavneh (II)", he: "רבן גמליאל דיבנה" } }] } } };
export const Loading: Story = { args: { answer: undefined } };
export const Hebrew: Story = { decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><div dir="rtl"><Story /></div></InterfaceLangProvider>] };
