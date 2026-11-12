import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import type { BiLayout, ContentLanguage } from "~/lib/reader/settings";
import { ReaderSurface } from "../ReaderSurface/ReaderSurface";
import { Segment, type SegmentSide } from "./Segment";

const he: SegmentSide = { html: "וַיְהִ֗י מִקֵּץ֙ אַרְבָּעִ֣ים י֑וֹם וַיִּפְתַּ֣ח נֹ֔חַ אֶת־חַלּ֥וֹן הַתֵּבָ֖ה אֲשֶׁ֥ר עָשָֽׂה׃", lang: "he", dir: "rtl" };
const en: SegmentSide = { html: "At the end of forty days, Noah opened the window of the ark that he had made.", lang: "en", dir: "ltr" };
const heTranslation: SegmentSide = { html: "ויהי בסוף ארבעים יום ויפתח נח את חלון התבה אשר עשה.", lang: "he", dir: "rtl" };

interface RowsProps {
  language: ContentLanguage;
  biLayout: BiLayout;
  rows: { ref: string; primary?: SegmentSide; translation?: SegmentSide }[];
}

/** A few segments on a 700px reading surface, as the reader lays them out. */
function Rows({ language, biLayout, rows }: RowsProps) {
  return (
    <div style={{ width: 760 }}>
      <ReaderSurface language={language} layout="segmented" biLayout={biLayout} fontSize={62.5}>
        {rows.map((r, i) => (
          <Segment key={r.ref} segmentRef={r.ref} address={String(i + 1)} primary={r.primary} translation={r.translation} language={language} linkCount={3} />
        ))}
      </ReaderSurface>
    </div>
  );
}

const meta = {
  title: "Reader/Segment",
  component: Rows,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Where the segment number sits against the text in each layout. Side by side, every side keeps its half of the row and the number sits in the 40px gap between the halves, also when one side is missing (sefaria.org's two 50% columns). With one language on screen the number is on the reading-start side of that language. Atlas: TXD-043, TXD-045.",
      },
    },
  },
} satisfies Meta<typeof Rows>;
export default meta;
type Story = StoryObj<typeof meta>;

const rect = (el: Element | null) => {
  if (!el) throw new Error("element missing");
  return el.getBoundingClientRect();
};
const seg = (root: HTMLElement, ref: string) => root.querySelector(`[data-ref="${ref}"]`) as HTMLElement;
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1);

/** The number is centred on the body and lies in the gap, clear of every side's text box. */
async function numberInGap(row: HTMLElement) {
  const body = rect(row.querySelector("p"));
  const num = rect(row.querySelector("[data-number]"));
  const mid = body.left + body.width / 2;
  near(num.left + num.width / 2, mid);
  for (const side of row.querySelectorAll("[data-side]")) {
    const s = side.getBoundingClientRect();
    await expect(s.right <= num.left + 5 || s.left >= num.right - 5).toBe(true);
  }
  return { body, mid };
}

const sideBySideRows: RowsProps["rows"] = [
  { ref: "both", primary: he, translation: en },
  { ref: "hebrew-only", primary: he },
  { ref: "translation-only", translation: en },
];

/** The owner's case (/Ibn_Ezra_on_Genesis.8.12.2, side by side, no translation loaded): the Hebrew stays in its half. */
export const SideBySideHebrewLeftOneSideMissing: Story = {
  args: { language: "bilingual", biLayout: "heLeft", rows: sideBySideRows },
  play: async ({ canvasElement }) => {
    for (const ref of ["both", "hebrew-only", "translation-only"]) {
      const row = seg(canvasElement, ref);
      const { body, mid } = await numberInGap(row);
      const p = row.querySelector("[data-side='primary']");
      const t = row.querySelector("[data-side='translation']");
      // sefaria.org: 50% columns with 20px toward the middle, so text at [0, 50%-20] and [50%+20, 100%]
      if (p) { near(rect(p).left, body.left); near(rect(p).right, mid - 20); }
      if (t) { near(rect(t).left, mid + 20); near(rect(t).right, body.right); }
    }
  },
};

export const SideBySideHebrewRightOneSideMissing: Story = {
  args: { language: "bilingual", biLayout: "heRight", rows: sideBySideRows },
  play: async ({ canvasElement }) => {
    for (const ref of ["both", "hebrew-only", "translation-only"]) {
      const row = seg(canvasElement, ref);
      const { body, mid } = await numberInGap(row);
      const p = row.querySelector("[data-side='primary']");
      const t = row.querySelector("[data-side='translation']");
      if (p) { near(rect(p).left, mid + 20); near(rect(p).right, body.right); }
      if (t) { near(rect(t).left, body.left); near(rect(t).right, mid - 20); }
    }
  },
};

/** The colour a CSS colour value computes to here (the tokens differ by theme). */
const computed = (root: HTMLElement, value: string) => {
  const probe = document.createElement("span");
  probe.style.color = value;
  root.appendChild(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c;
};
const colorOf = (row: HTMLElement, side: string) => getComputedStyle(row.querySelector(`[data-side='${side}']`)!).color;

/** sefaria.org: a translation beside the source is black side by side (grey only when stacked). */
export const SideBySideTranslationIsBlack: Story = {
  args: { language: "bilingual", biLayout: "heLeft", rows: [{ ref: "both", primary: he, translation: en }] },
  play: async ({ canvasElement }) => {
    await expect(colorOf(seg(canvasElement, "both"), "translation")).toBe(computed(canvasElement, "var(--sefaria-color-text-strong)"));
  },
};

/** Stacked, a Hebrew translation (Zohar) is black too; an English one stays grey. */
export const StackedHebrewTranslationIsBlack: Story = {
  args: { language: "bilingual", biLayout: "stacked", rows: [{ ref: "zohar", primary: { ...heTranslation, html: "ויהי מקץ" }, translation: heTranslation }, { ref: "tanakh", primary: he, translation: en }] },
  play: async ({ canvasElement }) => {
    const black = computed(canvasElement, "var(--sefaria-color-text-strong)");
    await expect(colorOf(seg(canvasElement, "zohar"), "translation")).toBe(black);
    await expect(colorOf(seg(canvasElement, "tanakh"), "translation")).toBe(computed(canvasElement, "var(--sefaria-color-text-dark-grey)"));
  },
};

const numberSide = (row: HTMLElement) => {
  const text = rect(row.querySelector("[data-side]"));
  const num = rect(row.querySelector("[data-number]"));
  return num.right <= text.left ? "left" : num.left >= text.right ? "right" : "over-text";
};

/** An English-only work in bilingual mode: the one side shown reads left to right, so the number is on the left. */
export const StackedEnglishSourceOnly: Story = {
  args: { language: "bilingual", biLayout: "stacked", rows: [{ ref: "english-source", primary: en }, { ref: "hebrew-source", primary: he }] },
  play: async ({ canvasElement }) => {
    await expect(numberSide(seg(canvasElement, "english-source"))).toBe("left");
    await expect(numberSide(seg(canvasElement, "hebrew-source"))).toBe("right");
  },
};

/** English mode with a Hebrew translation (Zohar's): the number is on the right, as on sefaria.org. */
export const EnglishModeHebrewTranslation: Story = {
  args: { language: "english", biLayout: "stacked", rows: [{ ref: "zohar", primary: he, translation: heTranslation }, { ref: "tanakh", primary: he, translation: en }] },
  play: async ({ canvasElement }) => {
    await expect(numberSide(seg(canvasElement, "zohar"))).toBe("right");
    await expect(numberSide(seg(canvasElement, "tanakh"))).toBe("left");
  },
};

/** Hebrew mode on an English-only work: the number is on the left. */
export const HebrewModeEnglishSource: Story = {
  args: { language: "hebrew", biLayout: "stacked", rows: [{ ref: "english-source", primary: en }, { ref: "hebrew-source", primary: he }] },
  play: async ({ canvasElement }) => {
    await expect(numberSide(seg(canvasElement, "english-source"))).toBe("left");
    await expect(numberSide(seg(canvasElement, "hebrew-source"))).toBe("right");
  },
};
