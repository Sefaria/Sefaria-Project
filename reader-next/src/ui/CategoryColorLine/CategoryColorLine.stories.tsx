import type { Meta, StoryObj } from "@storybook/react-vite";
import { CategoryColorLine } from "./CategoryColorLine";

const meta = {
  title: "Layout/CategoryColorLine",
  component: CategoryColorLine,
  tags: ["autodocs"],
  parameters: { layout: "padded", docs: { description: { component: "The category-coloured bar above a panel or page. Decorative: the category name is always rendered nearby. Atlas: GUI-013, LIB-019." } } },
} satisfies Meta<typeof CategoryColorLine>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Tanakh: Story = { args: { category: "Tanakh" } };
export const FromCategoryPath: Story = { args: { category: ["Talmud", "Bavli", "Seder Zeraim"] } };
export const AllCategories: Story = {
  args: { category: "Tanakh" },
  render: () => (
    <div style={{ display: "grid", gap: 12, width: 420 }}>
      {["Tanakh", "Mishnah", "Talmud", "Midrash", "Halakhah", "Kabbalah", "Liturgy", "Jewish Thought", "Tosefta", "Chasidut", "Musar", "Responsa", "Second Temple", "Reference", "Targum", "Commentary", "Static"].map((c) => (
        <div key={c} style={{ display: "grid", gap: 4, fontSize: 12 }}>{c}<CategoryColorLine category={c} /></div>
      ))}
    </div>
  ),
};
export const UnknownFallsBackToStableColor: Story = { args: { category: "A Category Nobody Named" } };
