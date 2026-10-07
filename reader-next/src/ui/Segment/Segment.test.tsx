import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { Segment, type SegmentProps } from "./Segment";

const he = { html: "בְּרֵאשִׁית בָּרָא", lang: "he", dir: "rtl" as const };
const en = { html: "When God began to create", lang: "en", dir: "ltr" as const };
const base: SegmentProps = { segmentRef: "Genesis 1:1", address: "1", primary: he, translation: en, language: "bilingual" };

// @feature TXD-043 @feature TXD-031
describe("which sides are shown", () => {
  it("bilingual shows both versions", () => {
    render(<Segment {...base} />);
    expect(screen.getByText("When God began to create")).toBeInTheDocument();
    expect(screen.getByText("בְּרֵאשִׁית בָּרָא")).toBeInTheDocument();
  });
  it("english hides the primary", () => {
    render(<Segment {...base} language="english" />);
    expect(screen.queryByText("בְּרֵאשִׁית בָּרָא")).toBeNull();
    expect(screen.getByText("When God began to create")).toBeInTheDocument();
  });
  it("hebrew hides the translation", () => {
    render(<Segment {...base} language="hebrew" />);
    expect(screen.queryByText("When God began to create")).toBeNull();
  });
  it("english falls back to the primary when there is no translation", () => {
    render(<Segment {...base} translation={undefined} language="english" />);
    expect(screen.getByText("בְּרֵאשִׁית בָּרָא")).toBeInTheDocument();
  });
  it("renders nothing for a segment with no text", () => {
    const { container } = render(<Segment {...base} primary={{ ...he, html: "  " }} translation={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("marks the arrangement so layouts can style it", () => {
    const { container } = render(<Segment {...base} />);
    expect(container.querySelector("[data-sides='both']")).not.toBeNull();
  });
});

// @feature TXD-045
describe("gutter number", () => {
  it("uses English numerals in an English interface", () => {
    render(<Segment {...base} address="12" />);
    expect(screen.getByText("12")).toBeInTheDocument();
  });
  it("uses Hebrew numerals in a Hebrew interface (bilingual)", () => {
    render(<InterfaceLangProvider lang="hebrew"><Segment {...base} address="12" /></InterfaceLangProvider>);
    expect(screen.getByText("יב")).toBeInTheDocument();
  });
  it("shows an English numeral beside a Hebrew-only segment in an English panel", () => {
    render(<Segment {...base} translation={undefined} language="english" address="3" />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });
  it("omits the number when no address is given (liturgy, dictionaries)", () => {
    render(<Segment {...base} address={undefined} />);
    expect(screen.queryByText("1")).toBeNull();
  });
  it("hides the gutter from assistive technology (the group is named by its ref)", () => {
    render(<Segment {...base} />);
    expect(screen.getByRole("group", { name: "Genesis 1:1" })).toBeInTheDocument();
  });
});

describe("connections dot", () => {
  it("scales opacity with the count and announces it", () => {
    const { container } = render(<Segment {...base} linkCount={50} />);
    expect(container.querySelector<HTMLElement>("span[style*='opacity']")!.style.opacity).toBe("0.7");
    expect(screen.getByText("50 connections available")).toBeInTheDocument();
  });
  it("is invisible with no connections and says nothing", () => {
    const { container } = render(<Segment {...base} linkCount={0} />);
    expect(container.querySelector<HTMLElement>("span[style*='opacity']")!.style.opacity).toBe("0");
    expect(screen.queryByText(/connections available/)).toBeNull();
  });
  it("is absent when the count is unknown", () => {
    const { container } = render(<Segment {...base} />);
    expect(container.querySelector("span[style*='opacity']")).toBeNull();
  });
});

// @feature TXD-048 @feature TXD-049 @feature TXD-050
describe("selecting a segment", () => {
  it("is not interactive without onSelect", () => {
    render(<Segment {...base} />);
    expect(screen.getByRole("group")).not.toHaveAttribute("tabindex");
  });
  it("selects on click", async () => {
    const onSelect = vi.fn();
    render(<Segment {...base} onSelect={onSelect} />);
    await userEvent.click(screen.getByText("When God began to create"));
    expect(onSelect).toHaveBeenCalledWith("Genesis 1:1");
  });
  it("selects with Enter and Space when focused", async () => {
    const onSelect = vi.fn();
    render(<Segment {...base} onSelect={onSelect} />);
    screen.getByRole("group").focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onSelect).toHaveBeenCalledTimes(2);
  });
  it("does not select when a citation inside the text is clicked", async () => {
    const onSelect = vi.fn();
    const onRefClick = vi.fn();
    render(
      <Segment
        {...base}
        translation={{ ...en, html: 'see <a class="refLink" href="Exodus.12.2" data-ref="Exodus 12:2">Exodus 12</a>' }}
        onSelect={onSelect}
        onRefClick={onRefClick}
      />,
    );
    await userEvent.click(screen.getByRole("link", { name: "Exodus 12" }));
    expect(onRefClick).toHaveBeenCalledWith("Exodus 12:2", expect.anything());
    expect(onSelect).not.toHaveBeenCalled();
  });
  it("does not select when a footnote marker is clicked", async () => {
    const onSelect = vi.fn();
    render(<Segment {...base} translation={{ ...en, html: 'x<sup class="footnote-marker">a</sup><i class="footnote">n</i>' }} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: "a" }));
    expect(onSelect).not.toHaveBeenCalled();
  });
  it("reflects the highlight", () => {
    const { container } = render(<Segment {...base} highlighted />);
    expect(container.querySelector("[data-highlighted='true']")).not.toBeNull();
  });

  // @feature TXD-057 Text selection and double-click guard
  it("a click that ends a text selection does not choose the verse", async () => {
    const onSelect = vi.fn();
    render(<Segment {...base} onSelect={onSelect} />);
    const body = screen.getByRole("group");
    const range = document.createRange();
    range.selectNodeContents(body.querySelector("p")!);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    fireEvent.click(body); // the click a browser sends at the end of a drag (the selection is still there)
    expect(onSelect).not.toHaveBeenCalled();
    window.getSelection()!.removeAllRanges();
    fireEvent.click(body);
    expect(onSelect).toHaveBeenCalledOnce();
  });
});

// @feature TXD-045 @feature TXT-025
describe("rules found by comparing with sefaria.org (parity run)", () => {
  it("English only, the translation has an EMPTY entry here: the row stays blank (Arukh HaShulchan 1:11)", () => {
    render(<Segment {...base} language="english" translation={{ ...en, html: "" }} />);
    expect(screen.getByRole("group")).toBeInTheDocument();
    expect(screen.queryByText("בְּרֵאשִׁית בָּרָא")).toBeNull();
    expect(screen.getByText("1")).toBeInTheDocument();
  });
  it("a Hebrew translation on its own is numbered in Hebrew even in an English panel (Zohar)", () => {
    render(<Segment {...base} language="english" primary={undefined} translation={he} address="3" />);
    expect(screen.getByText("ג")).toBeInTheDocument();
  });
  it("a Hebrew primary on its own (no translation) is numbered in English in an English panel", () => {
    render(<Segment {...base} language="english" translation={undefined} address="3" />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
