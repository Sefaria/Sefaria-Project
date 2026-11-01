import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { FloatingCard, FloatingCardAction, FloatingCardFooter, FloatingCardHeader } from "./FloatingCard";

const meta = {
  title: "Primitives/FloatingCard",
  component: FloatingCard,
  render: () => (
    <FloatingCard aria-label="Genesis 1:3" style={{ left: 40, top: 40, width: 360 }}>
      <FloatingCardHeader onClose={fn()}>
        <strong style={{ flex: 1 }}>Genesis 1:3</strong>
      </FloatingCardHeader>
      <p style={{ margin: 0, padding: "12px 16px" }}>And God said, “Let there be light”; and there was light.</p>
      <FloatingCardFooter>
        <FloatingCardAction icon="columns" onClick={fn()}>Open as new column</FloatingCardAction>
        <FloatingCardAction icon="external-link" href="#">Open in new page</FloatingCardAction>
      </FloatingCardFooter>
    </FloatingCard>
  ),
} satisfies Meta<typeof FloatingCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
