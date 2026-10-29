import type { Meta, StoryObj } from "@storybook/react-vite";
import { LegalText } from "./LegalText";

const meta = {
  title: "Auth/LegalText",
  component: LegalText,
  tags: ["autodocs"],
  parameters: { docs: { description: { component: "The terms line under the auth buttons. Atlas: ACC-008, STA-007." } } },
  decorators: [(Story) => <div style={{ width: 348 }}><Story /></div>],
} satisfies Meta<typeof LegalText>;
export default meta;
type Story = StoryObj<typeof meta>;
export const English: Story = {};
export const Hebrew: Story = { globals: { interfaceLang: "hebrew" } };
