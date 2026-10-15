// @feature CON-065
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddConnectionView } from "./AddConnectionView";

describe("AddConnectionView (AddConnectionBox)", () => {
  it("two texts: both refs, a type, Add Connection", async () => {
    const onAdd = vi.fn(async () => {});
    render(<AddConnectionView refs={["Genesis 1:1", "Psalms 33:6"]} onAdd={onAdd} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Select Type" }), "quotation");
    await userEvent.click(screen.getByRole("button", { name: "Add Connection" }));
    expect(onAdd).toHaveBeenCalledWith(["Genesis 1:1", "Psalms 33:6"], "quotation");
    expect(screen.getByRole("status")).toHaveTextContent("Connection added.");
  });
  it("one text: choose a text to connect; more than two: only two are understood", () => {
    const { rerender } = render(<AddConnectionView refs={["Genesis 1:1"]} onAdd={vi.fn()} />);
    expect(screen.getByText("Choose a text to connect.")).toBeInTheDocument();
    rerender(<AddConnectionView refs={["a", "b", "c"]} onAdd={vi.fn()} />);
    expect(screen.getByText("We currently only understand connections between two texts.")).toBeInTheDocument();
  });
});
