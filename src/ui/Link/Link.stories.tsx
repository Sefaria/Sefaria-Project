import type { Meta, StoryObj } from "@storybook/react-vite";
import { Link } from "./Link";

const meta = {
  title: "Primitives/Link",
  component: Link,
  tags: ["autodocs"],
  args: { href: "/Genesis.1", children: "Genesis 1" },
  parameters: { docs: { description: { component: "A navigation link: always a real `<a href>`. External links get `rel=noopener noreferrer`. The app injects its router link with `LinkProvider`." } } },
} satisfies Meta<typeof Link>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Internal: Story = {};
export const External: Story = { args: { href: "https://www.sefaria.org", children: "sefaria.org" } };
