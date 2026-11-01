import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { FollowBar } from "./FollowBar";
import { AKIVA, GUEST, SARAH, createFakeSessionClient, fakeLeaderState, fakeSessionState } from "./fake-client";

const meta = {
  title: "Reader State/FollowBar",
  component: FollowBar,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Follow me's bar under the header (docs/READER_STATE_API.md, \"Connection states\"): where this tab stands in a follow session, the one control for that state, and the faces of who is here. Each story drives a fake session client.",
      },
    },
  },
  // The bar is position: fixed; a transformed box makes it fixed to the story, not the page, so stories do not stack on each other.
  decorators: [(Story) => <div style={{ transform: "translateZ(0)", height: 120, ["--sefaria-header-height" as string]: "0px" }}><Story /></div>],
  args: { client: createFakeSessionClient(), locations: { akiva: "/Exodus.3?lang=bi" }, onLeave: fn(), onEndSharing: fn(), onDismiss: fn() },
} satisfies Meta<typeof FollowBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Connecting: Story = { args: { client: createFakeSessionClient(fakeSessionState({ status: "connecting", participants: [] })) } };
export const Live: Story = {
  args: { client: createFakeSessionClient() },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await expect(c.getByText("Following Akiva Berger")).toBeInTheDocument();
    await userEvent.click(c.getByRole("button", { name: "Stop following" }));
    await expect(args.onLeave).toHaveBeenCalled();
  },
};
export const Paused: Story = { args: { client: createFakeSessionClient(fakeSessionState({ status: "paused" })) } };
export const LeaderAway: Story = { args: { client: createFakeSessionClient(fakeSessionState({ status: "leader-away", participants: [{ ...AKIVA, away: true }, SARAH, GUEST] })) } };
export const NoLeader: Story = {
  args: { client: createFakeSessionClient(fakeSessionState({ status: "no-leader", following: null, room: { spotlight: null, term: 2, mode: "presenter", hands: [], ended: false }, participants: [SARAH, GUEST] })) },
};
export const Reconnecting: Story = { args: { client: createFakeSessionClient(fakeSessionState({ status: "reconnecting" })) } };
export const Ended: Story = { args: { client: createFakeSessionClient(fakeSessionState({ status: "ended" })) } };
export const Leading: Story = { args: { client: createFakeSessionClient(fakeLeaderState()) } };
export const HostFaceMenu: Story = {
  args: { client: createFakeSessionClient(fakeLeaderState()) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "Sarah Cohen · following Akiva Berger" }));
    await expect(c.getByRole("menuitem", { name: "Make leader" })).toBeInTheDocument();
  },
};
export const Lost: Story = { args: { client: null, lost: true } };
export const HebrewInterface: Story = {
  args: { client: createFakeSessionClient(fakeSessionState({ status: "paused" })) },
  decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><div dir="rtl"><Story /></div></InterfaceLangProvider>],
};
