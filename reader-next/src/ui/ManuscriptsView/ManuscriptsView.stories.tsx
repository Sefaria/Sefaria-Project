import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { ManuscriptsView } from "./ManuscriptsView";
import { MANUSCRIPTS } from "./story-data";

const meta = {
  title: "Connections/ManuscriptsView",
  component: ManuscriptsView,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 420, padding: 16 }}><Story /></div>],
  parameters: { docs: { description: { component: "Manuscript pages containing the selected passage. Data: the real Leningrad Codex page for Genesis 1:1." } } },
  args: { pages: MANUSCRIPTS },
} satisfies Meta<typeof ManuscriptsView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LeningradCodex: Story = {};
export const None: Story = { args: { pages: [] } };
export const Hebrew: Story = { decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><div dir="rtl"><Story /></div></InterfaceLangProvider>] };
