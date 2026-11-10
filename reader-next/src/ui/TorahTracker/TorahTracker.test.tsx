// @feature PRO-010
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CategoryBars, Donut, Favorites, StatCard, TorahTrackerPage, UserChooser } from "./TorahTracker";
import { BARS, FAVORITES, SLICES } from "./story-data";

const MODES = [
  { key: "currently", en: "Previous Year", he: "לשנה האחרונה" },
  { key: "alltime", en: "All Time", he: "כל הזמן" },
];

describe("Torah Tracker", () => {
  it("the reader's name (a spinner until the numbers come) and the period switch", async () => {
    const onMode = vi.fn();
    const { rerender } = render(<TorahTrackerPage he={false} modes={MODES} mode="currently" onMode={onMode} />);
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveTextContent("Ada");
    rerender(<TorahTrackerPage he={false} name="Ada" modes={MODES} mode="currently" onMode={onMode} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ada");
    expect(screen.getByRole("button", { name: "Switch to Previous Year mode" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Switch to All Time mode" }));
    expect(onMode).toHaveBeenCalledWith("alltime");
  });
  it("a stat card, a donut with its slices and labels, the bars with the average reader's label", () => {
    render(<StatCard icon="/icons/book-icon-black.svg" value={128} label="Texts Read" />);
    expect(screen.getByText("128")).toBeInTheDocument();
    const { container } = render(<Donut slices={SLICES} title={{ en: "Your Reading", he: "הלימוד שלך" }} />);
    expect(container.querySelectorAll("path")).toHaveLength(3);
    expect(container).toHaveTextContent("Tanakh60%");
    expect(within(container).getByText("Your Reading")).toBeInTheDocument();
    const bars = render(<CategoryBars bars={BARS} height={170} he={false} averageLabel="Average Sefaria User" />).container;
    expect(bars.querySelectorAll("rect")).toHaveLength(4);
    expect(bars).toHaveTextContent("TANAKH");
    expect(bars.querySelectorAll("text")[1]).toHaveTextContent("Average Sefaria User");
  });
  it("in Hebrew the bars grow from the right", () => {
    const { container } = render(<CategoryBars bars={BARS} height={170} he averageLabel="משתמש ממוצע בספריא" />);
    const user = container.querySelector("rect")!;
    expect(Number(user.getAttribute("x")) + Number(user.getAttribute("width"))).toBe(660);
  });
  it("favourite texts three to a row, linked", () => {
    render(<Favorites items={FAVORITES} />);
    expect(screen.getByRole("link", { name: "Genesis 1:1" })).toHaveAttribute("href", "/Genesis.1.1");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Your Favorite Texts");
  });
  it("a moderator's user id box", async () => {
    const onChange = vi.fn();
    render(<UserChooser onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox"), "7");
    expect(onChange).toHaveBeenLastCalledWith(7);
  });
});
