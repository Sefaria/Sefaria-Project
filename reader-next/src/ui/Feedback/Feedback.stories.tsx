import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../Button/Button";
import { EmptyState, ErrorState, LoadingState } from "./Feedback";

const meta = { title: "Primitives/Feedback states", parameters: { docs: { description: { component: "Loading, empty and error states. Every data-driven component must cover all three." } } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loading: Story = { render: () => <LoadingState /> };
export const Empty: Story = { render: () => <EmptyState title="No connections yet">Select a verse to see commentary and related texts.</EmptyState> };
export const Error: Story = { render: () => <ErrorState title="Couldn't load this text" action={<Button>Try again</Button>}>Check your connection and try again.</ErrorState> };
