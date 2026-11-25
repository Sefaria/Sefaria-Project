import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProfilePic } from "./ProfilePic";

const meta = {
  title: "Auth/ProfilePic",
  component: ProfilePic,
  tags: ["autodocs"],
  parameters: { docs: { description: { component: "A reader's round picture, or initials on grey. Atlas: GUI-010." } } },
  args: { name: "Ada Lovelace", size: 24 },
} satisfies Meta<typeof ProfilePic>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Initials: Story = {};
export const Large: Story = { args: { size: 64 } };
export const Picture: Story = { args: { url: "/brand/library-logo-english.svg", size: 48 } };
