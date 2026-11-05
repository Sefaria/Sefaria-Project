import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { NewsletterSignUp } from "./NewsletterSignUp";

const meta = {
  title: "Sidebar/NewsletterSignUp",
  component: NewsletterSignUp,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ width: 332, padding: 20, background: "var(--sefaria-color-surface-subtle)" }}><Story /></div>],
  args: { subscribe: async () => undefined, isValidEmail: (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) },
} satisfies Meta<typeof NewsletterSignUp>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const Hebrew: Story = { decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><Story /></InterfaceLangProvider>] };
/** A valid address opens the name fields; both names subscribe. */
export const Subscribed: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByRole("textbox", { name: "Email address" }), "reader@example.com{enter}");
    await userEvent.type(c.getByRole("textbox", { name: "First Name" }), "Ada");
    await userEvent.type(c.getByRole("textbox", { name: "Last Name" }), "Lovelace{enter}");
    await expect(await c.findByText("Subscribed! Welcome to our list.")).toBeVisible();
  },
};
export const InvalidEmail: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByRole("textbox", { name: "Email address" }), "nope{enter}");
    await expect(c.getByText("Please enter a valid email address.")).toBeVisible();
  },
};
export const Failed: Story = {
  args: { subscribe: async () => Promise.reject(new Error("Sorry, that address is blocked.")) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByRole("textbox", { name: "Email address" }), "reader@example.com{enter}");
    await userEvent.type(c.getByRole("textbox", { name: "First Name" }), "Ada");
    await userEvent.type(c.getByRole("textbox", { name: "Last Name" }), "L{enter}");
    await expect(await c.findByText("Sorry, that address is blocked.")).toBeVisible();
  },
};
