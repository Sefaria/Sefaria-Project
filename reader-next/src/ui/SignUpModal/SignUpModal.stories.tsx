import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { SignUpModal } from "./SignUpModal";

const meta = {
  title: "Account/SignUpModal",
  component: SignUpModal,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: { kind: "notes", onClose: () => {}, next: "/Genesis.1.1?with=all" },
} satisfies Meta<typeof SignUpModal>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Notes: Story = {};
export const AddToSheet: Story = { args: { kind: "add-to-sheet" } };
export const AddTranslation: Story = { args: { kind: "add-translation" } };
export const Default: Story = { args: { kind: "default" } };
export const HebrewInterface: Story = { decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><Story /></InterfaceLangProvider>] };
