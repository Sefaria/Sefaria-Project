import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Icon } from "../Icon/Icon";
import { MenuRow } from "./MenuRow";

const meta = {
  title: "Primitives/MenuRow",
  component: MenuRow,
  args: { onClick: fn() },
  render: (args) => (
    <div style={{ width: 280 }}>
      <MenuRow {...args}>
        <Icon name="saved-layout" size="18px" />
        Open my saved layout
      </MenuRow>
    </div>
  ),
} satisfies Meta<typeof MenuRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
