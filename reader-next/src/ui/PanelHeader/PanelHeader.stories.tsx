import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { IconButton } from "../IconButton/IconButton";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { PanelHeader } from "./PanelHeader";

const meta = {
  title: "Layout/PanelHeader",
  component: PanelHeader,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen", docs: { description: { component: "The 60px toolbar at the top of a panel: leading control, title and version, trailing actions, with the category colour line above. The title is a real heading. Atlas: SHL-074, TXD-013." } } },
  args: {
    title: "Genesis 1",
    subtitle: "Revised JPS, 2023",
    category: ["Tanakh", "Torah"],
    start: <IconButton icon="close" label="Close" />,
    end: <><IconButton icon="bookmark" label="Save" /><IconButton icon="font-size" label="Text display options" /></>,
  },
} satisfies Meta<typeof PanelHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TextHeader: Story = {};
/** Old reader: attribution line, then the translation in parentheses. */
export const TalmudHeader: Story = {
  args: {
    title: "Berakhot 2a",
    subtitle: (<><span>The William Davidson Talmud</span><span>(Koren - Steinsaltz)</span></>),
    category: ["Talmud", "Bavli"],
  },
};
export const Hebrew: Story = { globals: { interfaceLang: "hebrew" }, args: { title: <InterfaceText en="Genesis 1" he="בראשית א׳" />, subtitle: "מקרא על פי המסורה" } };
export const NoCategory: Story = { args: { category: undefined } };
export const LongTitle: Story = { args: { title: "Mishneh Torah, Foundations of the Torah, Chapter 1, Halakhot 1-3", subtitle: "Mishneh Torah, trans. by Eliyahu Touger" } };
export const Mobile: Story = { parameters: { viewport: { defaultViewport: "mobile" } } };
/** A Hebrew title is set in the Hebrew text face at 122% of the English title, as on sefaria.org (21.96px against 18px). */
export const HebrewTitleSize: Story = {
  args: {
    title: (
      <a href="/Ibn_Ezra_on_Genesis.8.12" lang="he" dir="rtl" style={{ color: "inherit", textDecoration: "none" }}>
        אבן עזרא על בראשית ח׳:י״ב
      </a>
    ),
    subtitle: undefined,
  },
  play: async ({ canvasElement }) => {
    const h = canvasElement.querySelector("h1, h2") as HTMLElement;
    const a = h.querySelector("[lang='he']") as HTMLElement;
    const ratio = parseFloat(getComputedStyle(a).fontSize) / parseFloat(getComputedStyle(h).fontSize);
    await expect(Math.abs(ratio - 1.22)).toBeLessThan(0.005);
    // the bar keeps its 60px whatever the title's size
    await expect(Math.round((canvasElement.querySelector("header > div:last-child") as HTMLElement).getBoundingClientRect().height)).toBe(60);
  },
};
