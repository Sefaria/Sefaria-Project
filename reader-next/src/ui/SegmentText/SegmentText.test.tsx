import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SegmentText } from "./SegmentText";

const withNote = 'When God began to create<sup class="footnote-marker">a</sup><i class="footnote"><b>When God began </b>In contrast to others.</i> heaven and earth';

// @feature TXD-025
describe("footnotes", () => {
  it("hides the note body until its marker is activated, then shows it", async () => {
    render(<SegmentText html={withNote} lang="en" dir="ltr" />);
    expect(screen.queryByText(/In contrast to others/)).toBeNull();
    const marker = screen.getByRole("button", { name: "a" });
    expect(marker).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(marker);
    expect(screen.getByRole("note")).toHaveTextContent("In contrast to others.");
    expect(screen.getByRole("button", { name: "a" })).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(screen.getByRole("button", { name: "a" }));
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("opens a note from the keyboard", async () => {
    render(<SegmentText html={withNote} lang="en" dir="ltr" />);
    screen.getByRole("button", { name: "a" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("note")).toBeInTheDocument();
    await userEvent.keyboard(" ");
    expect(screen.queryByRole("note")).toBeNull();
  });
});

// @feature TXD-021
describe("citations", () => {
  const html = 'as in (<a class="refLink" href="Psalms.111.6" data-ref="Psalms 111:6">Psalms 111</a>) and more';

  it("renders a real link to the canonical path", () => {
    render(<SegmentText html={html} lang="en" dir="ltr" />);
    expect(screen.getByRole("link", { name: "Psalms 111" })).toHaveAttribute("href", "/Psalms.111.6");
  });

  it("reports a plain click through onRefClick instead of navigating", async () => {
    const onRefClick = vi.fn();
    render(<SegmentText html={html} lang="en" dir="ltr" onRefClick={onRefClick} />);
    await userEvent.click(screen.getByRole("link", { name: "Psalms 111" }));
    expect(onRefClick).toHaveBeenCalledWith("Psalms 111:6", expect.anything());
  });

  it("leaves modified clicks to the browser (open in new tab)", async () => {
    const onRefClick = vi.fn();
    render(<SegmentText html={html} lang="en" dir="ltr" onRefClick={onRefClick} />);
    for (const mod of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
      fireEvent.click(screen.getByRole("link", { name: "Psalms 111" }), mod);
    }
    expect(onRefClick).not.toHaveBeenCalled();
  });
});

describe("language and direction", () => {
  it("tags the text with its language and direction", () => {
    const { container } = render(<SegmentText html="שלום" lang="he" dir="rtl" />);
    const el = container.querySelector("[lang]")!;
    expect(el).toHaveAttribute("lang", "he");
    expect(el).toHaveAttribute("dir", "rtl");
  });
  it("applies vocalization", () => {
    const { container } = render(<SegmentText html={"בְּרֵאשִׁ֖ית"} lang="he" dir="rtl" vocalization="none" />);
    expect(container.textContent).toBe("בראשית");
  });
});
