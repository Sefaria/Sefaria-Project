import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { TextColumnBanner } from "./TextColumnBanner";

const label = <InterfaceText en="Go to translations" he="לרשימת התרגומים" />;
const message = <InterfaceText en={<>Want to <strong>change</strong> the translation?</>} he="מעוניינים בתרגום אחר?" />;
const meta = {
  title: "Reader/TextColumnBanner",
  component: TextColumnBanner,
  tags: ["autodocs"],
  args: { children: message, actions: [{ name: "Go to translations", label, onClick: () => {} }] },
} satisfies Meta<typeof TextColumnBanner>;
export default meta;
type Story = StoryObj<typeof meta>;
export const OpenTranslations: Story = {};
export const HebrewInterface: Story = { decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><div dir="rtl"><Story /></div></InterfaceLangProvider>] };
