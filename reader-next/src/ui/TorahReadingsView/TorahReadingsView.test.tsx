import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { CLIPS } from "../ManuscriptsView/story-data";
import { TorahReadingsView } from "./TorahReadingsView";

afterEach(() => vi.restoreAllMocks());

// @feature CON-059
describe("TorahReadingsView (Genesis 1:1; compared with sefaria.org)", () => {
  it("the recording, its description, a 0:00 / 0:06 player, licence and source", () => {
    render(<TorahReadingsView clips={CLIPS} />);
    expect(screen.getByRole("heading", { name: "Torah Reading" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "PocketTorah" })).toBeInTheDocument();
    expect(screen.getByText(/Audio recordings of the weekly Torah portions used in PocketTorah/)).toBeInTheDocument();
    expect(screen.getByText("0:00 / 0:06")).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === "DIV" && el.textContent === "License: CC-BY-SA")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PocketTorah" })).toHaveAttribute("href", "http://www.pockettorah.com");
  });

  it("the audio plays only the clip (#t=start,end) and the slider spans it", () => {
    const { container } = render(<TorahReadingsView clips={CLIPS} />);
    expect(container.querySelector("audio")!.getAttribute("src")).toMatch(/Bereshit-1\.mp3#t=2\.028362,9\.018015$/);
    const slider = screen.getByRole("slider", { name: "Audio playback position" });
    expect(slider).toHaveAttribute("min", "2.028362");
    expect(slider).toHaveAttribute("max", "9.018015");
  });

  it("play and pause toggle the button and drive the audio element", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    render(<TorahReadingsView clips={CLIPS} />);
    await userEvent.click(screen.getByRole("button", { name: "Play Audio" }));
    expect(play).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Pause Audio" }));
    expect(pause).toHaveBeenCalled();
  });

  it("the position counts from the clip's start, and stopping at the clip's end rewinds it", () => {
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const { container } = render(<TorahReadingsView clips={CLIPS} />);
    const audio = container.querySelector("audio")!;
    Object.defineProperty(audio, "currentTime", { value: 5.028362, writable: true });
    fireEvent(audio, new Event("timeupdate"));
    expect(screen.getByText("0:03 / 0:06")).toBeInTheDocument();
    audio.currentTime = 9.5; // past the end of the clip
    fireEvent(audio, new Event("timeupdate"));
    expect(screen.getByText("0:00 / 0:06")).toBeInTheDocument();
    expect(audio.currentTime).toBeCloseTo(2.028362);
  });

  it("Hebrew interface, and an empty message instead of the old endless 'Loading…'", () => {
    const { rerender } = render(<InterfaceLangProvider lang="hebrew"><TorahReadingsView clips={CLIPS} /></InterfaceLangProvider>);
    expect(screen.getByText("קריאה בתורה")).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === "DIV" && el.textContent === "רשיון: CC-BY-SA")).toBeInTheDocument(); // not the old "עסק רשיון" typo
    rerender(<TorahReadingsView clips={[]} />);
    expect(screen.getByText("No Torah readings known here.")).toBeInTheDocument();
  });
});
