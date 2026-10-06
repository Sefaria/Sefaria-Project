import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { SegmentedControl, type SegmentedOption } from "./SegmentedControl";

const meta = {
  title: "Primitives/SegmentedControl",
  component: SegmentedControl,
  tags: ["autodocs"],
  parameters: { docs: { description: { component: "Single choice among a few visible options, as a radio group. Arrow keys move and select (reversed in RTL). Replaces ToggleSet, LayoutButtons, SourceTranslationsButtons, SearchToggle, TabbedToggleSet, SubCategoryToggle and the language radios. Atlas: SHL-018, SHL-021, TXD-031, TXD-033, TXD-034." } } },
} satisfies Meta<typeof SegmentedControl>;
export default meta;
type Story = StoryObj<typeof meta>;

function Demo<T extends string>({ options, initial, ...rest }: { options: readonly SegmentedOption<T>[]; initial: T; label: string; iconOnly?: boolean; block?: boolean }) {
  const [v, setV] = useState<T>(initial);
  return <SegmentedControl value={v} onValueChange={setV} options={options} {...rest} />;
}

export const TextOptions: Story = {
  args: { label: "Language", value: "hebrew", onValueChange: () => {}, options: [] },
  render: () => <Demo label="Language" initial="bilingual" options={[{ value: "hebrew", label: "Source" }, { value: "english", label: "Translation" }, { value: "bilingual", label: "Both" }]} />,
};
export const Block: Story = {
  args: { label: "Language", value: "hebrew", onValueChange: () => {}, options: [] },
  parameters: { layout: "padded" },
  render: () => <Demo block label="Language" initial="hebrew" options={[{ value: "hebrew", label: "Source" }, { value: "english", label: "Translation" }, { value: "bilingual", label: "Both" }]} />,
};
export const IconOptions: Story = {
  args: { label: "Layout", value: "stacked", onValueChange: () => {}, options: [] },
  render: () => (
    <Demo iconOnly label="Layout" initial="stacked" options={[
      { value: "stacked", label: "Stacked", icon: "layout-stacked" },
      { value: "heLeft", label: "Hebrew on the left", icon: "layout-he-left" },
      { value: "heRight", label: "Hebrew on the right", icon: "layout-he-right" },
    ]} />
  ),
};
export const WithDisabled: Story = {
  args: { label: "Language", value: "hebrew", onValueChange: () => {}, options: [] },
  render: () => <Demo label="Language" initial="hebrew" options={[{ value: "hebrew", label: "Source" }, { value: "english", label: "Translation", disabled: true }, { value: "bilingual", label: "Both" }]} />,
};
export const Hebrew: Story = {
  args: { label: "שפה", value: "hebrew", onValueChange: () => {}, options: [] },
  globals: { interfaceLang: "hebrew" },
  render: () => <Demo label="שפה" initial="hebrew" options={[{ value: "hebrew", label: "מקור" }, { value: "english", label: "תרגום" }, { value: "bilingual", label: "שניהם" }]} />,
};
