import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { SegmentedControl, type SegmentedOption } from "./SegmentedControl";

const OPTIONS: SegmentedOption<"a" | "b" | "c">[] = [
  { value: "a", label: "Source" },
  { value: "b", label: "Translation" },
  { value: "c", label: "Both" },
];

function Harness({ initial = "a", options = OPTIONS, rtl = false }: { initial?: "a" | "b" | "c"; options?: SegmentedOption<"a" | "b" | "c">[]; rtl?: boolean }) {
  const [v, setV] = useState(initial);
  const body = <SegmentedControl label="Language" value={v} onValueChange={setV} options={options} />;
  return rtl ? <InterfaceLangProvider lang="hebrew">{body}</InterfaceLangProvider> : body;
}

// @feature SHL-018
describe("SegmentedControl", () => {
  it("is a named radio group with the current value checked", () => {
    render(<Harness initial="b" />);
    expect(screen.getByRole("radiogroup", { name: "Language" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Translation" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Source" })).not.toBeChecked();
  });

  it("selects on click", async () => {
    const onValueChange = vi.fn();
    render(<SegmentedControl label="L" value="a" onValueChange={onValueChange} options={OPTIONS} />);
    await userEvent.click(screen.getByRole("radio", { name: "Both" }));
    expect(onValueChange).toHaveBeenCalledWith("c");
  });

  it("uses a roving tabindex: only the checked option is tabbable", () => {
    render(<Harness initial="b" />);
    expect(screen.getByRole("radio", { name: "Translation" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Source" })).toHaveAttribute("tabindex", "-1");
  });

  it("moves and selects with the arrow keys, wrapping around", async () => {
    render(<Harness initial="a" />);
    screen.getByRole("radio", { name: "Source" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Translation" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Translation" })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Both" })).toBeChecked();
  });

  it("reverses the arrows in a right-to-left interface", async () => {
    render(<Harness initial="a" rtl />);
    screen.getByRole("radio", { name: "Source" }).focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Translation" })).toBeChecked();
  });

  it("skips disabled options and ignores clicks on them", async () => {
    const options = OPTIONS.map((o) => (o.value === "b" ? { ...o, disabled: true } : o));
    render(<Harness initial="a" options={options} />);
    screen.getByRole("radio", { name: "Source" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Both" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Translation" }));
    expect(screen.getByRole("radio", { name: "Both" })).toBeChecked();
  });

  it("icon-only options are named by their label", () => {
    render(
      <SegmentedControl iconOnly label="Layout" value="a" onValueChange={() => {}} options={[
        { value: "a", label: "Stacked", icon: "layout-stacked" },
        { value: "b", label: "Hebrew on the left", icon: "layout-he-left" },
      ]} />,
    );
    expect(screen.getByRole("radio", { name: "Stacked" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Hebrew on the left" })).toBeInTheDocument();
  });
});
