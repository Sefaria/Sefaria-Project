import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { CookieNotice } from "./CookieNotice";

const meta = { title: "Shell/CookieNotice", component: CookieNotice, tags: ["autodocs"], parameters: { layout: "fullscreen" } } satisfies Meta<typeof CookieNotice>;
export default meta;
type Story = StoryObj<typeof meta>;
export const English: Story = {};
export const Hebrew: Story = { decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><Story /></InterfaceLangProvider>] };
