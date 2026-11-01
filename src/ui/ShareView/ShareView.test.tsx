import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { shareHrefs } from "~/lib/feedback/share";
import { ShareView } from "./ShareView";
import { registerFollowMe, type FollowMeSource, type FollowMeState } from "./follow-me";

const url = "https://www.sefaria.org/Genesis.1.1?lang=en&with=all";

// @feature CON-061
describe("ShareView", () => {
  it("shows the link, selectable, and the three ways to share it (new tabs)", () => {
    render(<ShareView url={url} />);
    expect(screen.getByRole("textbox", { name: "Shareable link" })).toHaveValue(url);
    expect(screen.getByRole("link", { name: "Share on Facebook" })).toHaveAttribute("href", `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
    expect(screen.getByRole("link", { name: "Share on X" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Share by Email" })).toHaveAttribute("href", `mailto:?&subject=Text on Sefaria&body=${url}`);
  });
  it("copy writes the link to the clipboard and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ShareView url={url} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith(url);
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });
  it("the targets are built as the old ShareBox did", () => {
    expect(shareHrefs("https://x/y?a=1&b=2").x).toBe("https://twitter.com/share?url=https%3A%2F%2Fx%2Fy%3Fa%3D1%26b%3D2");
  });
});

/** A follow-me source with state set by hand, recording start/stop. */
function fakeFollowMe(initial: FollowMeState = { status: "idle", following: 0 }) {
  let state = initial;
  const listeners = new Set<() => void>();
  const source: FollowMeSource & { set(s: FollowMeState): void } = {
    getState: () => state,
    subscribe: (cb) => (listeners.add(cb), () => void listeners.delete(cb)),
    start: vi.fn(),
    stop: vi.fn(),
    linkFor: (u) => (state.status === "sharing" || state.status === "starting" ? `${u}&follow=SESSION` : null),
    set(s) {
      state = s;
      for (const cb of [...listeners]) cb();
    },
  };
  return source;
}

describe("ShareView: Follow me", () => {
  it("is absent when no follow controller is running (server, stories)", () => {
    render(<ShareView url={url} />);
    expect(screen.queryByRole("region", { name: "Follow Me" })).toBeNull();
  });

  it("explains itself and starts sharing", async () => {
    const source = fakeFollowMe();
    render(<ShareView url={url} followMe={source} />);
    expect(screen.getByRole("region", { name: "Follow Me" })).toHaveTextContent("Anyone who opens the link moves through the text with you.");
    await userEvent.click(screen.getByRole("button", { name: "Start sharing" }));
    expect(source.start).toHaveBeenCalled();
  });

  it("while sharing: the follow link (this address + follow) with its own copy button, the count, and Stop sharing", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const source = fakeFollowMe({ status: "sharing", following: 2 });
    render(<ShareView url={url} followMe={source} />);
    expect(screen.getByRole("textbox", { name: "Follow link" })).toHaveValue(`${url}&follow=SESSION`);
    expect(screen.getByText("2 following")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Copy follow link" }));
    expect(writeText).toHaveBeenCalledWith(`${url}&follow=SESSION`);
    await userEvent.click(screen.getByRole("button", { name: "Stop sharing" }));
    expect(source.stop).toHaveBeenCalled();
    act(() => source.set({ status: "idle", following: 0 }));
    expect(screen.queryByRole("textbox", { name: "Follow link" })).toBeNull();
    expect(screen.getByRole("button", { name: "Start sharing" })).toBeInTheDocument();
  });

  it("uses the source the follow controller registered, and says so when this tab follows someone else", () => {
    const source = fakeFollowMe({ status: "busy", following: 0 });
    const unregister = registerFollowMe(source);
    try {
      render(<ShareView url={url} />);
      expect(screen.getByRole("region", { name: "Follow Me" })).toHaveTextContent("You are following someone now");
      expect(screen.queryByRole("button", { name: "Start sharing" })).toBeNull();
    } finally {
      act(() => unregister());
    }
    expect(screen.queryByRole("region", { name: "Follow Me" })).toBeNull();
  });
});
