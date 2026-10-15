import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { FeedbackView } from "./FeedbackView";

const meta = {
  title: "Connections/FeedbackView",
  component: FeedbackView,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 420, padding: 16 }}><Story /></div>],
  args: { onSubmit: () => {} },
} satisfies Meta<typeof FeedbackView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SignedOut: Story = {};
export const SignedIn: Story = { args: { signedIn: true } };
export const HebrewInterface: Story = { decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><div dir="rtl"><Story /></div></InterfaceLangProvider>] };
