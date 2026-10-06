import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton, SkeletonText } from "./Skeleton";

const meta = { title: "Primitives/Skeleton", component: Skeleton, tags: ["autodocs"], parameters: { layout: "padded" } } satisfies Meta<typeof Skeleton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Block: Story = { args: { width: "240px", height: "1.2em" } };
export const Paragraph: Story = { render: () => <div style={{ width: 360 }}><SkeletonText lines={4} /></div> };
