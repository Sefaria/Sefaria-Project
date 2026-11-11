import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { FollowBar, NOTICE_MS } from "./FollowBar";
import { DANA, GUEST, SARAH, createFakeSessionClient, fakeLeaderState, fakeSessionState } from "./fake-client";

function bar(client: ReturnType<typeof createFakeSessionClient> | null, extra: Partial<Parameters<typeof FollowBar>[0]> = {}) {
  const handlers = { onLeave: vi.fn(), onEndSharing: vi.fn(), onDismiss: vi.fn() };
  const utils = render(<FollowBar client={client} {...handlers} {...extra} />);
  return { ...utils, ...handlers };
}
const message = () => within(screen.getByRole("region", { name: "Follow" })).getAllByRole("status").map((s) => s.textContent).join(" ");

describe("FollowBar states", () => {
  it("renders nothing without a session, unless the room was lost", async () => {
    const { container, rerender, onDismiss } = bar(null);
    expect(container).toBeEmptyDOMElement();
    rerender(<FollowBar client={null} lost onLeave={() => {}} onEndSharing={() => {}} onDismiss={onDismiss} />);
    expect(screen.getByText("The follow session is not available")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it("connecting: Joining… with a spinner, and a way out", async () => {
    const { onLeave } = bar(createFakeSessionClient(fakeSessionState({ status: "connecting", participants: [] })));
    expect(message()).toContain("Joining…");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onLeave).toHaveBeenCalled();
  });

  it("live: Following <name> + Stop following", async () => {
    const { onLeave } = bar(createFakeSessionClient());
    expect(message()).toContain("Following Dana Levi");
    await userEvent.click(screen.getByRole("button", { name: "Stop following" }));
    expect(onLeave).toHaveBeenCalled();
  });

  it("paused: <name> is reading <place> · Follow again resumes", async () => {
    const client = createFakeSessionClient(fakeSessionState({ status: "paused" }));
    bar(client, { locations: { dana: "/Exodus.3?lang=bi" } });
    expect(message()).toContain("Dana Levi is reading Exodus 3");
    await userEvent.click(screen.getByRole("button", { name: "Follow again" }));
    expect(client.calls).toContainEqual({ cmd: "followAgain" });
  });

  it("paused without a known place still offers Follow again", () => {
    bar(createFakeSessionClient(fakeSessionState({ status: "paused" })));
    expect(message()).toContain("You stopped following Dana Levi");
    expect(screen.getByRole("button", { name: "Follow again" })).toBeInTheDocument();
  });

  it("leader-away, no-leader and reconnecting", () => {
    const client = createFakeSessionClient(fakeSessionState({ status: "leader-away" }));
    bar(client);
    expect(message()).toContain("Waiting for Dana Levi to come back");
    act(() => client.set({ status: "no-leader", following: null, room: { ...client.getState().room, spotlight: null } }));
    expect(message()).toContain("Waiting for a leader");
    act(() => client.set({ status: "reconnecting" }));
    expect(message()).toContain("Reconnecting…");
    expect(screen.getByRole("region", { name: "Follow" })).toHaveAttribute("data-status", "reconnecting");
  });

  it("ended: <name> stopped sharing, dismissable; no faces", async () => {
    const { onDismiss } = bar(createFakeSessionClient(fakeSessionState({ status: "ended" })));
    expect(message()).toContain("Dana Levi stopped sharing");
    expect(screen.queryByRole("list", { name: "Participants" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it("leading: Sharing · N following, and Stop sharing ends the session", async () => {
    const { onEndSharing } = bar(createFakeSessionClient(fakeLeaderState()));
    expect(message()).toContain("Sharing · 2 following");
    await userEvent.click(screen.getByRole("button", { name: "Stop sharing" }));
    expect(onEndSharing).toHaveBeenCalled();
  });

  it("ended names the host, even when someone else held the spotlight", () => {
    bar(createFakeSessionClient(fakeSessionState({ status: "ended", room: { spotlight: SARAH.id, term: 4, mode: "presenter", hands: [], ended: true } })));
    expect(message()).toContain("Dana Levi stopped sharing");
  });

  it("the host following someone they made leader still stops the session, not just their following", async () => {
    const { onEndSharing, onLeave } = bar(createFakeSessionClient(fakeLeaderState({ status: "live", following: SARAH.id, room: { spotlight: SARAH.id, term: 3, mode: "presenter", hands: [], ended: false } })));
    expect(message()).toContain("Following Sarah Cohen");
    expect(screen.queryByRole("button", { name: "Stop following" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Stop sharing" }));
    expect(onEndSharing).toHaveBeenCalled();
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("says Now following <name> for a moment when the spotlight moves", () => {
    vi.useFakeTimers();
    try {
      const client = createFakeSessionClient();
      bar(client);
      act(() => client.set({ room: { ...client.getState().room, spotlight: SARAH.id, term: 2 }, following: SARAH.id }));
      expect(message()).toContain("Now following Sarah Cohen");
      act(() => void vi.advanceTimersByTime(NOTICE_MS));
      expect(message()).toContain("Following Sarah Cohen");
      expect(message()).not.toContain("Now");
    } finally {
      vi.useRealTimers();
    }
  });

  it("still clears the notice when the state changes again before it is due (the follower breaks away)", () => {
    vi.useFakeTimers();
    try {
      const client = createFakeSessionClient();
      bar(client);
      act(() => client.set({ room: { ...client.getState().room, spotlight: SARAH.id, term: 2 }, following: SARAH.id }));
      expect(message()).toContain("Now following Sarah Cohen");
      act(() => void vi.advanceTimersByTime(NOTICE_MS / 2));
      act(() => client.set({ status: "paused" }));
      act(() => void vi.advanceTimersByTime(NOTICE_MS));
      expect(message()).not.toContain("Now following");
    } finally {
      vi.useRealTimers();
    }
  });

  it("speaks Hebrew in a Hebrew interface", () => {
    render(
      <InterfaceLangProvider lang="hebrew">
        <FollowBar client={createFakeSessionClient()} onLeave={() => {}} onEndSharing={() => {}} onDismiss={() => {}} />
      </InterfaceLangProvider>,
    );
    expect(screen.getByRole("region", { name: "מעקב" })).toHaveTextContent("עוקבים אחרי Dana Levi");
    expect(screen.getByRole("button", { name: "הפסקת המעקב" })).toBeInTheDocument();
  });
});

describe("FollowBar presence", () => {
  it("shows faces, marks the leader and who follows whom, and a click follows that person", async () => {
    const client = createFakeSessionClient();
    bar(client);
    const faces = screen.getByRole("list", { name: "Participants" });
    expect(within(faces).getAllByRole("listitem")).toHaveLength(3);
    const dana = within(faces).getByRole("button", { name: /^Follow Dana Levi · leading/ });
    expect(dana).toHaveAttribute("aria-pressed", "true");
    expect(within(faces).getByRole("img", { name: "Guest X7K (you) · following Dana Levi" })).toHaveTextContent("GX");
    await userEvent.click(within(faces).getByRole("button", { name: "Follow Sarah Cohen · following Dana Levi" }));
    expect(client.calls).toContainEqual({ cmd: "follow", arg: SARAH.id });
  });

  it("the host's menu on a face offers Follow and Make leader", async () => {
    const client = createFakeSessionClient(fakeLeaderState());
    bar(client);
    await userEvent.click(screen.getByRole("button", { name: "Sarah Cohen · following Dana Levi" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Follow Sarah Cohen" })).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Make leader" }));
    expect(client.calls).toContainEqual({ cmd: "spotlight", arg: SARAH.id });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("the host can take the spotlight back from their own face", async () => {
    const client = createFakeSessionClient(fakeLeaderState({ status: "live", following: SARAH.id, room: { spotlight: SARAH.id, term: 3, mode: "presenter", hands: [], ended: false }, participants: [{ ...DANA, following: SARAH.id }, { ...SARAH, following: null }, GUEST] }));
    bar(client);
    await userEvent.click(screen.getByRole("button", { name: "Dana Levi (you) · following Sarah Cohen" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Lead again" }));
    expect(client.calls).toContainEqual({ cmd: "spotlight", arg: DANA.id });
  });
});
