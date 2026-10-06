import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceText } from "./InterfaceText";

const meta = {
  title: "Primitives/InterfaceText",
  component: InterfaceText,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A bilingual UI string. Follows the **Interface language** toolbar control. Replaces the old InterfaceText / EnglishText / HebrewText / SimpleInterfaceBlock family. Atlas: I18-001.",
      },
    },
  },
  args: { en: "Texts", he: "מקורות" },
} satisfies Meta<typeof InterfaceText>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Both: Story = {};
export const EnglishOnly: Story = { args: { he: undefined }, parameters: { docs: { description: { story: "Falls back to the other language instead of rendering nothing." } } } };
export const HebrewOnly: Story = { args: { en: undefined } };
