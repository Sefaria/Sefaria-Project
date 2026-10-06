import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { DEFAULT_SETTINGS, displayMenuAvailability, type LayoutKey, type ReaderSettings } from "~/lib/reader/settings";
import { DisplaySettingsMenu } from "./DisplaySettingsMenu";

const meta = {
  title: "Reader/DisplaySettingsMenu",
  component: DisplaySettingsMenu,
  tags: ["autodocs"],
  parameters: { layout: "padded", docs: { description: { component: "The “Aa” menu. Shows only the options that apply to the text on screen: vowels and cantillation only when the text has them, aliyot only for the Torah and Onkelos, punctuation only for Talmud, language only in a side panel. Rules: `displayMenuAvailability`. Atlas: SHL-017–021, TXD-031–041, TXT-003, TXT-006." } } },
  decorators: [(Story) => <div style={{ width: 320, padding: 16, border: "1px solid var(--sefaria-color-border)", borderRadius: 8 }}><Story /></div>],
  args: { settings: DEFAULT_SETTINGS, availability: displayMenuAvailability({ settings: DEFAULT_SETTINGS, showsSource: true }), layoutKey: "layoutTanakh", onChange: () => {} },
} satisfies Meta<typeof DisplaySettingsMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

const HE_FULL = "בְּרֵאשִׁ֖ית בָּרָ֣א";
const HE_NIKUD = "בְּרֵאשִׁית בָּרָא";

function Live({ ctx, layoutKey, over = {} }: { ctx: Partial<Parameters<typeof displayMenuAvailability>[0]>; layoutKey: LayoutKey; over?: Partial<ReaderSettings> }) {
  const [settings, setSettings] = useState<ReaderSettings>({ ...DEFAULT_SETTINGS, ...over });
  const availability = displayMenuAvailability({ settings, showsSource: settings.language !== "english", ...ctx });
  return <DisplaySettingsMenu settings={settings} availability={availability} layoutKey={layoutKey} onChange={(p) => setSettings((s) => ({ ...s, ...p }))} />;
}

export const Tanakh: Story = { render: () => <Live layoutKey="layoutTanakh" ctx={{ primaryCategory: "Tanakh", book: "Isaiah", hebrewSample: HE_FULL }} /> };
export const Torah: Story = { render: () => <Live layoutKey="layoutTanakh" ctx={{ primaryCategory: "Tanakh", book: "Genesis", hebrewSample: HE_FULL }} /> };
export const Talmud: Story = { render: () => <Live layoutKey="layoutTalmud" over={{ language: "hebrew" }} ctx={{ primaryCategory: "Talmud", book: "Berakhot", hebrewSample: HE_NIKUD }} /> };
export const TranslationOnlyText: Story = { render: () => <Live layoutKey="layoutDefault" over={{ language: "english" }} ctx={{ primaryCategory: "Second Temple", book: "Philo", hebrewSample: "" }} /> };
export const SidePanel: Story = { render: () => <Live layoutKey="layoutDefault" ctx={{ inSidebar: true }} /> };
export const NarrowBilingual: Story = { render: () => <Live layoutKey="layoutTanakh" ctx={{ primaryCategory: "Tanakh", book: "Genesis", hebrewSample: HE_FULL, panelWidth: 480 }} /> };
export const VowelsOff: Story = { render: () => <Live layoutKey="layoutTanakh" over={{ vowels: "none" }} ctx={{ primaryCategory: "Tanakh", book: "Genesis", hebrewSample: HE_FULL }} />, parameters: { docs: { description: { story: "Cantillation is disabled, with the reason shown." } } } };
export const HebrewInterface: Story = { globals: { interfaceLang: "hebrew" }, render: () => <Live layoutKey="layoutTanakh" ctx={{ primaryCategory: "Tanakh", book: "Genesis", hebrewSample: HE_FULL }} /> };
