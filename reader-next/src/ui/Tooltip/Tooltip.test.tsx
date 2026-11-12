import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceNote } from "./SourceNote";
import { Tooltip } from "./Tooltip";

const NOTE = 'This topic is connected to "Genesis 1:2" by Aspaklaria.';

// @feature CON-046
describe("Tooltip / SourceNote (the old ToolTipped three-dots button)", () => {
  it("SourceNote: a focusable button named by its tooltip, no native title", () => {
    render(<SourceNote note={NOTE} />);
    const button = screen.getByRole("button", { name: NOTE });
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent(NOTE);
    expect(button).toHaveAttribute("aria-labelledby", tip.id);
    expect(button).not.toHaveAttribute("title");
    expect(button.querySelectorAll("circle")).toHaveLength(3);
  });
  it("describes a trigger that has its own name", () => {
    render(<Tooltip content="Text display options">{(p) => <button type="button" {...p}>Aa</button>}</Tooltip>);
    expect(screen.getByRole("button", { name: "Aa" })).toHaveAccessibleDescription("Text display options");
  });
  it("Escape hides it until focus or the pointer leaves (WCAG 1.4.13)", () => {
    const { container } = render(<SourceNote note={NOTE} />);
    const root = container.firstElementChild!;
    const button = screen.getByRole("button");
    button.focus();
    fireEvent.keyDown(button, { key: "Escape" });
    expect(root).toHaveAttribute("data-dismissed");
    fireEvent.blur(button);
    expect(root).not.toHaveAttribute("data-dismissed");
  });
});
