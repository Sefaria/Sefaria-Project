import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { CLIPS } from "../ManuscriptsView/story-data";
import { TorahReadingsView } from "./TorahReadingsView";

const meta = {
  title: "Connections/TorahReadingsView",
  component: TorahReadingsView,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 420, padding: 16 }}><Story /></div>],
  parameters: { docs: { description: { component: "Audio of the selected passage being read, with a player for just that clip. Data: the real PocketTorah clip for Genesis 1:1." } } },
  args: { clips: CLIPS },
} satisfies Meta<typeof TorahReadingsView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PocketTorah: Story = {};
export const None: Story = { args: { clips: [] } };
export const Hebrew: Story = { decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><div dir="rtl"><Story /></div></InterfaceLangProvider>] };
