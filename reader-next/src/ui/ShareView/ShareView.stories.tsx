import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { ShareView } from "./ShareView";

const meta = {
  title: "Connections/ShareView",
  component: ShareView,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 420, padding: 16 }}><Story /></div>],
  args: { url: "https://www.sefaria.org/Genesis.1.1?lang=en&with=all" },
} satisfies Meta<typeof ShareView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const HebrewInterface: Story = { decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><div dir="rtl"><Story /></div></InterfaceLangProvider>] };
