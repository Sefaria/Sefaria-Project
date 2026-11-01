import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { ShareView } from "./ShareView";
import type { FollowMeSource, FollowMeState } from "./follow-me";

/** A follow-me source frozen in one state (the real one is the follow controller, src/features/reader-state/follow). */
const followMe = (state: FollowMeState): FollowMeSource => ({
  getState: () => state,
  subscribe: () => () => {},
  start: () => {},
  stop: () => {},
  linkFor: (u) => (state.status === "sharing" ? `${u}&follow=7f3Kq9LmZ2xYbN4vW8cR1dT6hJ0sP5aE3gU9iO2kQwX` : null),
});

const meta = {
  title: "Connections/ShareView",
  component: ShareView,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 420, padding: 16 }}><Story /></div>],
  args: { url: "https://www.sefaria.org/Genesis.1.1?lang=en&with=all" },
} satisfies Meta<typeof ShareView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const HebrewInterface: Story = { decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><div dir="rtl"><Story /></div></InterfaceLangProvider>] };
export const FollowMe: Story = { args: { followMe: followMe({ status: "idle", following: 0 }) } };
export const FollowMeSharing: Story = { args: { followMe: followMe({ status: "sharing", following: 3 }) } };
export const FollowMeWhileFollowing: Story = { args: { followMe: followMe({ status: "busy", following: 0 }) } };
