import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { FindingsView } from "./FindingsView";
import { GROUPS } from "./story-data";

// @feature CON-073 @feature CON-074
const meta = {
  title: "Connections/FindingsView",
  component: FindingsView,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 420, padding: 16 }}><Story /></div>],
  parameters: {
    docs: {
      description: {
        component:
          "What learners found with the Library Assistant's skills on the selected passage, grouped by method (behind the findings lab). Data: made-up findings on Genesis 1:1-3 in the findings API's shape.",
      },
    },
  },
  args: { groups: GROUPS, selectedRefs: ["Genesis 1:1"], refHref: (r: string) => `/${r.replace(/ /g, "_").replace(/:/g, ".")}` },
} satisfies Meta<typeof FindingsView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Genesis1: Story = {};
export const Loading: Story = { args: { loading: true, groups: [] } };
export const NothingKnown: Story = { args: { groups: [] } };
export const Hebrew: Story = {
  decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><div dir="rtl"><Story /></div></InterfaceLangProvider>],
};
