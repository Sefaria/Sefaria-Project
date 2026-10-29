import type { Meta, StoryObj } from "@storybook/react-vite";
import { Spinner } from "./Spinner";

const meta = { title: "Primitives/Spinner", component: Spinner, tags: ["autodocs"], parameters: { docs: { description: { component: "Indeterminate progress with a bilingual accessible label." } } } } satisfies Meta<typeof Spinner>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Large: Story = { args: { size: "3rem" } };
