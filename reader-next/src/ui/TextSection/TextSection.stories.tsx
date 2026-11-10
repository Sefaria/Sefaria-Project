import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { DEFAULT_SETTINGS, type ReaderSettings } from "~/lib/reader/settings";
import { PASSAGES } from "./passages";
import { TextSection } from "./TextSection";

const meta = {
  title: "Reader/TextSection",
  component: TextSection,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "A section of text for any book type, arranged by the reader's display settings. Every story uses a real API response recorded in `fixtures/api`. Atlas: TXD-001, TXD-012, TXT-001, TXT-003.",
      },
    },
  },
  args: { passage: PASSAGES.genesis1, settings: DEFAULT_SETTINGS },
  decorators: [(Story) => <div style={{ padding: "0 var(--sefaria-space-6)" }}><Story /></div>],
} satisfies Meta<typeof TextSection>;
export default meta;
type Story = StoryObj<typeof meta>;

const s = (over: Partial<ReaderSettings>): ReaderSettings => ({ ...DEFAULT_SETTINGS, ...over });

/* ── Tanakh ─────────────────────────────────────────────────── */
export const GenesisBilingualStacked: Story = {};
export const GenesisHebrewOnly: Story = { args: { settings: s({ language: "hebrew" }) } };
export const GenesisEnglishOnly: Story = { args: { settings: s({ language: "english" }) } };
export const GenesisSideBySideHebrewRight: Story = { args: { settings: s({ biLayout: "heRight" }), panelWidth: 900 } };
export const GenesisSideBySideHebrewLeft: Story = { args: { settings: s({ biLayout: "heLeft" }), panelWidth: 900 } };
export const GenesisNarrowFallsBackToStacked: Story = {
  args: { settings: s({ biLayout: "heRight" }), panelWidth: 420 },
  parameters: { viewport: { defaultViewport: "mobile" } },
};
export const GenesisParashaHeader: Story = { args: { settings: s({ language: "hebrew" }) }, parameters: { docs: { description: { story: "The first verse of Bereshit carries the parasha header." } } } };
export const GenesisAliyot: Story = { args: { settings: s({ aliyotTorah: true }) } };
export const GenesisNoCantillation: Story = { args: { settings: s({ language: "hebrew", vowels: "partial" }) } };
export const GenesisNoVowels: Story = { args: { settings: s({ language: "hebrew", vowels: "none" }) } };
export const GenesisLargerText: Story = { args: { settings: s({ fontSize: 62.5 * 1.15 * 1.15 }) } };
export const GenesisHighlightedVerse: Story = { args: { highlight: { from: ["1", "3"], to: ["1", "3"] }, linkCounts: { "Genesis 1:1": 40, "Genesis 1:3": 12, "Genesis 1:5": 3 } } };
export const GenesisWithConnectionDots: Story = { args: { linkCounts: { "Genesis 1:1": 140, "Genesis 1:2": 25, "Genesis 1:3": 6, "Genesis 1:4": 0 } } };
export const GenesisFootnoteOpens: Story = {
  args: { settings: s({ language: "english" }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const marker = canvas.getAllByRole("button", { name: "a" })[0]!;
    await userEvent.click(marker);
    await expect(canvas.getByRole("note")).toBeInTheDocument();
  },
};
export const OnkelosHasParashaHeaders: Story = { args: { passage: PASSAGES.onkelosGenesis1, settings: s({ language: "bilingual" }) } };

/* ── Poetry ─────────────────────────────────────────────────── */
export const PsalmsPoetry: Story = { args: { passage: PASSAGES.psalms23, settings: s({ language: "english" }) }, parameters: { docs: { description: { story: "Poetic line indentation is carried by markup, kept by the normaliser extension (TXT-007)." } } } };

/* ── Talmud ─────────────────────────────────────────────────── */
export const BerakhotContinuousHebrew: Story = { args: { passage: PASSAGES.berakhot2a, settings: s({ language: "hebrew" }) }, parameters: { docs: { description: { story: "Talmud defaults to continuous layout in a single language." } } } };
export const BerakhotSegmentedHebrew: Story = { args: { passage: PASSAGES.berakhot2a, settings: s({ language: "hebrew", layoutTalmud: "segmented" }) } };
export const BerakhotBilingual: Story = { args: { passage: PASSAGES.berakhot2a } };
export const BerakhotPunctuationOff: Story = { args: { passage: PASSAGES.berakhot2a, settings: s({ language: "hebrew", punctuationTalmud: false }) } };
export const BerakhotEnglish: Story = { args: { passage: PASSAGES.berakhot2a, settings: s({ language: "english" }) } };

/* ── Mishnah, Yerushalmi ────────────────────────────────────── */
export const Mishnah: Story = { args: { passage: PASSAGES.mishnahBerakhot1 } };
export const YerushalmiWithPageMarkers: Story = { args: { passage: PASSAGES.yerushalmi, settings: s({ language: "hebrew" }) }, parameters: { docs: { description: { story: "Vilna page overlays appear as small grey markers inside the text (TXT-013)." } } } };

/* ── Commentary, codes, liturgy, reference ──────────────────── */
export const RashiOnGenesis: Story = { args: { passage: PASSAGES.rashiGenesis1_1, settings: s({ language: "hebrew" }) }, parameters: { docs: { description: { story: "Depth-3 commentary: the section is a verse; segments are comments." } } } };
export const ShulchanArukhItagsShownForFilteredCommentator: Story = { args: { passage: PASSAGES.shulchanArukh, settings: s({ language: "hebrew" }), itagCommentator: "Turei Zahav" } };
export const HaggadahKadeshNoNumbers: Story = { args: { passage: PASSAGES.haggadahKadesh }, parameters: { docs: { description: { story: "Liturgy shows no segment numbers (TXD-011)." } } } };
export const JastrowDictionaryEntry: Story = { args: { passage: PASSAGES.jastrowAbba, settings: s({ language: "english" }) }, parameters: { docs: { description: { story: "Reference works hide the section title and segment numbers." } } } };

/* ── Images (TXD-026) ───────────────────────────────────────── */
const svg = (label: string, fill: string) =>
  `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="${fill}"/><text x="200" y="110" font-size="28" text-anchor="middle" fill="#fff">${label}</text></svg>`)}`;
const withImages = {
  ...PASSAGES.genesis1,
  segments: PASSAGES.genesis1.segments.slice(0, 4).map((seg, i) =>
    i === 1
      ? { ...seg, primary: `<img src="${svg("he", "#7c98b6")}" alt="תרשים">`, translation: `<img src="${svg("en", "#4b71b7")}" alt="Diagram of the firmament">` }
      : i === 2
        ? { ...seg, translation: `${seg.translation} <img src="${svg("inline", "#999")}" alt="inline figure" width="80">` }
        : seg,
  ),
};
export const ImagesInText: Story = {
  args: { passage: withImages },
  parameters: { docs: { description: { story: "Verse 2 is an image on both sides: bilingual shows only the translation's, centred with its alt text as the caption (legacy VersionContent). Verse 3 has an inline image in running text." } } },
  play: async ({ canvasElement }) => {
    const imgs = [...canvasElement.querySelectorAll("img")];
    await expect(imgs).toHaveLength(2);
    await expect(within(canvasElement).getByText("Diagram of the firmament")).toBeInTheDocument();
  },
};
