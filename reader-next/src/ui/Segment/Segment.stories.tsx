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
  /** Width of the panel (the reading column's `panel` container) around the surface. */
  panelWidth?: number;
}

/** A few segments on a 700px reading surface, as the reader lays them out. */
function Rows({ language, biLayout, rows, panelWidth = 760 }: RowsProps) {
  return (
    <div style={{ width: panelWidth, container: "panel / inline-size" }}>
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
const contentBox = (el: Element) => {
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  return { left: r.left + parseFloat(cs.paddingLeft), right: r.right - parseFloat(cs.paddingRight) };
};
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1);

/** The number is centred on the body and lies in the gap, clear of every side's text box. */
async function numberInGap(row: HTMLElement) {
  const body = rect(row.querySelector("p"));
  const num = rect(row.querySelector("[data-number]"));
  const mid = body.left + body.width / 2;
  near(num.left + num.width / 2, mid);
  // the text (each side's content box) stays clear of the number
  for (const side of row.querySelectorAll("[data-side]")) {
    const s = contentBox(side);
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
      if (p) { near(rect(p).left, body.left); near(rect(p).right, mid); near(contentBox(p).right, mid - 20); }
      if (t) { near(rect(t).left, mid); near(contentBox(t).left, mid + 20); near(rect(t).right, body.right); }
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
      if (p) { near(rect(p).left, mid); near(contentBox(p).left, mid + 20); near(rect(p).right, body.right); }
      if (t) { near(rect(t).left, body.left); near(rect(t).right, mid); near(contentBox(t).right, mid - 20); }
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

/** sefaria.org: side by side the translation has the source's colour (grey only when stacked), in every theme. */
export const SideBySideTranslationLikeSource: Story = {
  args: { language: "bilingual", biLayout: "heLeft", rows: [{ ref: "both", primary: he, translation: en }] },
  play: async ({ canvasElement }) => {
    const row = seg(canvasElement, "both");
    await expect(colorOf(row, "translation")).toBe(colorOf(row, "primary"));
    await expect(colorOf(row, "translation")).toBe(computed(canvasElement, "var(--sefaria-color-text)"));
  },
};

/** Stacked, a Hebrew translation (Zohar) is black too; an English one stays grey. */
export const StackedHebrewTranslationLikeSource: Story = {
  args: { language: "bilingual", biLayout: "stacked", rows: [{ ref: "zohar", primary: { ...heTranslation, html: "ויהי מקץ" }, translation: heTranslation }, { ref: "tanakh", primary: he, translation: en }] },
  play: async ({ canvasElement }) => {
    await expect(colorOf(seg(canvasElement, "zohar"), "translation")).toBe(colorOf(seg(canvasElement, "zohar"), "primary"));
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
    // sefaria.org's gutters: a number on the left starts 48px out, one on the right ends 46px out (the dots opposite)
    const en = seg(canvasElement, "english-source"), he = seg(canvasElement, "hebrew-source");
    near(rect(en.querySelector("[data-number]")).left, rect(en).left - 48);
    near(rect(en.querySelector("[data-no-select]")).right, rect(en).right + 46);
    near(rect(he.querySelector("[data-number]")).right, rect(he).right + 46);
    near(rect(he.querySelector("[data-no-select]")).left, rect(he).left - 48);
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

/** Hebrew mode on an English-only work served as a translation (Teshuvot haRashba: no source version): the number is on the left, as on
 * sefaria.org (242px at 1280, beside the English). */
export const HebrewModeEnglishTranslationOnly: Story = {
  args: { language: "hebrew", biLayout: "stacked", rows: [{ ref: "teshuva", translation: en }, { ref: "hebrew-source", primary: he }] },
  play: async ({ canvasElement }) => {
    await expect(numberSide(seg(canvasElement, "teshuva"))).toBe("left");
    near(rect(seg(canvasElement, "teshuva").querySelector("[data-number]")).left, rect(seg(canvasElement, "teshuva")).left - 48);
    await expect(numberSide(seg(canvasElement, "hebrew-source"))).toBe("right");
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

/** Stacked as sefaria.org shows it: the sides one under the other at full width, the number in the right gutter. */
async function looksStacked(row: HTMLElement) {
  const body = rect(row.querySelector("p"));
  for (const side of row.querySelectorAll("[data-side]")) {
    near(rect(side).left, body.left);
    near(rect(side).right, body.right);
  }
  await expect(rect(row.querySelector("[data-number]")).left).toBeGreaterThanOrEqual(rect(row).right);
  await expect(getComputedStyle(row.querySelector("[data-no-select]")!).visibility).toBe("visible");
  await expect(colorOf(row, "translation")).toBe(computed(row, "var(--sefaria-color-text-dark-grey)"));
}

/** A panel 500px wide or less is stacked whatever the side-by-side setting (sefaria.org: side by side only above 500px). */
export const NarrowPanelHebrewLeftIsStacked: Story = {
  args: { language: "bilingual", biLayout: "heLeft", rows: sideBySideRows, panelWidth: 500 },
  play: async ({ canvasElement }) => {
    await looksStacked(seg(canvasElement, "both"));
    near(rect(seg(canvasElement, "hebrew-only").querySelector("[data-side]")).left, rect(seg(canvasElement, "hebrew-only").querySelector("p")).left);
    near(rect(seg(canvasElement, "translation-only").querySelector("[data-side]")).left, rect(seg(canvasElement, "translation-only").querySelector("p")).left);
  },
};
export const NarrowPanelHebrewRightIsStacked: Story = {
  args: { language: "bilingual", biLayout: "heRight", rows: sideBySideRows, panelWidth: 500 },
  play: async ({ canvasElement }) => {
    await looksStacked(seg(canvasElement, "both"));
    // the source comes first, as when stacked
    await expect(rect(seg(canvasElement, "both").querySelector("[data-side='primary']")).top).toBeLessThan(rect(seg(canvasElement, "both").querySelector("[data-side='translation']")).top);
  },
};
/** A fractional width that sefaria.org rounds to 500 (a panel beside the sidebar at a 736px window is 500.47px there): still stacked. */
export const PanelOf500Point4IsStacked: Story = {
  args: { language: "bilingual", biLayout: "heLeft", rows: sideBySideRows, panelWidth: 500.4 },
  play: async ({ canvasElement }) => {
    await looksStacked(seg(canvasElement, "both"));
  },
};
/** One pixel wider and the setting applies. */
export const PanelJustOver500IsSideBySide: Story = {
  args: { language: "bilingual", biLayout: "heLeft", rows: sideBySideRows, panelWidth: 501 },
  play: async ({ canvasElement }) => {
    await numberInGap(seg(canvasElement, "both"));
  },
};

/** The verse an address names, on arrival (the panel sets `data-arrival`): sefaria.org's focus tint, #f5faff; a darker blue-grey in dark. */
export const ArrivalTint: Story = {
  args: { language: "english", biLayout: "stacked", rows: [{ ref: "Genesis 8:6", translation: en }, { ref: "Genesis 8:7", translation: en }] },
  play: async ({ canvasElement }) => {
    const row = seg(canvasElement, "Genesis 8:6");
    row.setAttribute("data-arrival", "true");
    const dark = document.documentElement.dataset.theme === "dark";
    await expect(getComputedStyle(row).backgroundColor).toBe(dark ? "rgb(30, 38, 46)" : "rgb(245, 250, 255)");
    await expect(getComputedStyle(seg(canvasElement, "Genesis 8:7")).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  },
};
