import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { SiteHeader } from "./SiteHeader";
import { STUB_SEARCH } from "./story-data";

const meta = {
  title: "Shell/SiteHeader",
  component: SiteHeader,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen", docs: { description: { component: "The site header: desktop bar, and on phones a menu bar with a slide-out menu. Texts, Topics, search and accounts are the old site's pages until this client has its own." } } },
  args: { next: "/Genesis.1", search: STUB_SEARCH },
} satisfies Meta<typeof SiteHeader>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Desktop: Story = { args: {} };
export const Hebrew: Story = { args: {}, decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><Story /></InterfaceLangProvider>] };
export const Phone: Story = { args: {}, globals: { viewport: { value: "mobile1" } }, parameters: { viewport: { defaultViewport: "mobile1" } } };
export const SignedIn: Story = { args: { viewer: { name: "Ada Lovelace", profileUrl: "/profile/ada-lovelace" } } };
export const SignedInPhone: Story = { args: { viewer: { name: "Ada Lovelace" } }, globals: { viewport: { value: "mobile1" } }, parameters: { viewport: { defaultViewport: "mobile1" } } };
