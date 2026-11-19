import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { formatTime, Timeline, type TimelineProps } from "./Timeline";

function setup(over: Partial<TimelineProps> = {}) {
  const props: TimelineProps = {
    duration: 200_000,
    time: 65_000,
    markers: [0, 40_000, 200_000],
    playing: false,
    rate: 1,
    onSeek: vi.fn(),
    onPlayPause: vi.fn(),
    onRate: vi.fn(),
    ...over,
  };
  render(<Timeline {...props} />);
  return { ...props, slider: screen.getByRole("slider", { name: "Playback position" }) };
}

describe("formatTime", () => {
  it("shows minutes and seconds, hours past an hour, never negative", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65_400)).toBe("1:05");
    expect(formatTime(3_725_000)).toBe("1:02:05");
    expect(formatTime(-5)).toBe("0:00");
    expect(formatTime(Number.NaN)).toBe("0:00");
  });
});

describe("Timeline", () => {
  it("is a slider announcing the time out of the duration", () => {
    const { slider } = setup();
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "200000");
    expect(slider).toHaveAttribute("aria-valuenow", "65000");
    expect(slider).toHaveAttribute("aria-valuetext", "1:05 of 3:20");
    expect(screen.getByText("1:05 / 3:20")).toBeInTheDocument();
  });

  it("draws a tick per marker", () => {
    setup();
    expect(screen.getAllByTestId("timeline-marker")).toHaveLength(3);
  });

  it("steps 5 s with the arrows, 30 s with Page keys, and jumps with Home/End, clamped", async () => {
    const { slider, onSeek } = setup({ time: 2_000 });
    slider.focus();
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.keyboard("{ArrowLeft}");
    await userEvent.keyboard("{PageUp}");
    await userEvent.keyboard("{End}");
    await userEvent.keyboard("{Home}");
    expect(vi.mocked(onSeek).mock.calls.map((c) => c[0])).toEqual([7_000, 0, 32_000, 200_000, 0]);
  });

  it("seeks to where the track is clicked and follows a drag", () => {
    const { slider, onSeek } = setup();
    slider.getBoundingClientRect = () => ({ left: 100, width: 200, top: 0, height: 28, right: 300, bottom: 28, x: 100, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(slider, { clientX: 150, button: 0, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientX: 250, pointerId: 1 });
    fireEvent.pointerUp(slider, { clientX: 250, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientX: 300, pointerId: 1 }); // after release: ignored
    expect(vi.mocked(onSeek).mock.calls.map((c) => c[0])).toEqual([50_000, 150_000]);
  });

  it("toggles play and pause, and offers speeds with the current one pressed", async () => {
    const { onPlayPause, onRate } = setup({ rate: 2 });
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(onPlayPause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "2x speed" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1x speed" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "4x speed" }));
    expect(onRate).toHaveBeenCalledWith(4);
  });

  it("names the button Pause while playing", () => {
    setup({ playing: true });
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("does nothing when disabled", async () => {
    const { slider, onSeek } = setup({ disabled: true });
    slider.focus();
    await userEvent.keyboard("{ArrowRight}");
    fireEvent.pointerDown(slider, { clientX: 10, button: 0, pointerId: 1 });
    expect(onSeek).not.toHaveBeenCalled();
    expect(slider).toHaveAttribute("aria-disabled", "true");
  });
});
