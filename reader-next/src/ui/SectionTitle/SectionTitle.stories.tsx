import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { ReaderSurface } from "../ReaderSurface/ReaderSurface";
import { SectionTitle } from "./SectionTitle";

/** The same header in English and in Hebrew, on a reading surface at the default size. */
function Pair() {
  return (
    <div style={{ width: 700 }}>
      <ReaderSurface language="english" layout="segmented" biLayout="stacked" fontSize={62.5}>
        <SectionTitle en="8:12" he="ח׳:י״ב" lang="en" />
      </ReaderSurface>
      <ReaderSurface language="hebrew" layout="segmented" biLayout="stacked" fontSize={62.5}>
        <SectionTitle en="8:12" he="ח׳:י״ב" lang="he" />
      </ReaderSurface>
    </div>
  );
}

const meta = {
  title: "Reader/SectionTitle",
  component: Pair,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "The header above a section. As on sefaria.org it is set `lighter` (weight 100) at 1.1em; a Hebrew header is in the Hebrew text face at 122% of that (29.5px at the default size, against 24.2px in English). Atlas: TXD-012.",
      },
    },
  },
} satisfies Meta<typeof Pair>;
export default meta;
type Story = StoryObj<typeof meta>;

export const EnglishAndHebrew: Story = {
  play: async ({ canvasElement }) => {
    const [enH, heH] = [...canvasElement.querySelectorAll("h2")] as HTMLElement[];
    const enSize = parseFloat(getComputedStyle(enH!).fontSize);
    const heSize = parseFloat(getComputedStyle(heH!).fontSize);
    await expect(Math.abs(heSize / enSize - 1.22)).toBeLessThan(0.005);
    await expect(getComputedStyle(enH!).fontWeight).toBe("100");
    await expect(getComputedStyle(heH!).fontWeight).toBe("100");
    await expect(heH!.lang).toBe("he");
  },
};
