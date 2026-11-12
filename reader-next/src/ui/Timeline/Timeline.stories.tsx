import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { Timeline } from "./Timeline";

const meta = {
  title: "Primitives/Timeline",
  component: Timeline,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: { description: { component: "A media timeline for replaying a reading session: play/pause, a scrubber with keyframe ticks (a slider: arrows ±5 s, Page ±30 s, Home/End), time out of duration, and speed." } },
  },
  args: {
    duration: 200_000,
    time: 65_000,
    markers: [0, 40_000, 80_000, 120_000, 160_000, 200_000],
    playing: false,
    rate: 1,
    onSeek: () => {},
    onPlayPause: () => {},
    onRate: () => {},
  },
  decorators: [(Story) => <div style={{ width: 460 }}><Story /></div>],
} satisfies Meta<typeof Timeline>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Paused: Story = {};
export const Playing: Story = { args: { playing: true, rate: 2 } };
export const AtTheStart: Story = { args: { time: 0 } };
export const LongerThanAnHour: Story = { args: { duration: 3_725_000, time: 1_800_000, markers: [] } };
export const Disabled: Story = { args: { disabled: true } };

/** A working player: the clock advances while playing, and the keyboard moves it. */
export const Interactive: Story = {
  render: function Render(args) {
    const [time, setTime] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [rate, setRate] = useState(1);
    useEffect(() => {
      if (!playing) return;
      const id = setInterval(() => setTime((t) => {
        const next = t + 100 * rate;
        if (next >= args.duration) setPlaying(false);
        return Math.min(args.duration, next);
      }), 100);
      return () => clearInterval(id);
    }, [playing, rate, args.duration]);
    return (
      <Timeline
        {...args}
        time={time}
        playing={playing}
        rate={rate}
        onSeek={setTime}
        onPlayPause={() => setPlaying((p) => !p)}
        onRate={setRate}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const slider = c.getByRole("slider", { name: "Playback position" });
    slider.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    await expect(slider).toHaveAttribute("aria-valuenow", "10000");
    await expect(slider).toHaveAttribute("aria-valuetext", "0:10 of 3:20");
    await userEvent.click(c.getByRole("button", { name: "2x speed" }));
    await expect(c.getByRole("button", { name: "2x speed" })).toHaveAttribute("aria-pressed", "true");
  },
};
