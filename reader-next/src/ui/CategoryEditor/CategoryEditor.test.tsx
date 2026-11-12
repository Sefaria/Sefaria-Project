import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CategoryEditor, ReorderEditor } from "./CategoryEditor";

const tree = [{ category: "Tanakh", heCategory: "תנך", contents: [{ category: "Torah", heCategory: "תורה", contents: [] }] }] as never;
const initial = { enTitle: "Torah", heTitle: "תורה", enDescription: "", heDescription: "", enShortDescription: "", heShortDescription: "", isPrimary: false, path: ["Tanakh"], children: ["Genesis", "Exodus"] };

// @feature LIB-002
describe("CategoryEditor", () => {
  it("asks for a change, reorders children, sets primary status and saves", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<CategoryEditor initial={initial} isNew={false} tree={tree} onSave={onSave} onDelete={vi.fn()} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please change one of the fields before saving.");
    await userEvent.click(screen.getByRole("button", { name: "Move Exodus up" }));
    await userEvent.click(screen.getByRole("radio", { name: "True" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ children: ["Exodus", "Genesis"], isPrimary: true, path: ["Tanakh"] }));
  });

  it("refuses to delete a category with contents; a new one has no reorder or delete", async () => {
    const { rerender } = render(<CategoryEditor initial={initial} isNew={false} tree={tree} onSave={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Cannot delete a category with contents.");
    rerender(<CategoryEditor initial={{ ...initial, children: [] }} isNew tree={tree} onSave={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Order" })).toBeNull();
  });
});

describe("ReorderEditor", () => {
  it("saves the new order only after a move", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ReorderEditor initial={["Tanakh", "Mishnah", "Talmud"]} onSave={onSave} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("You haven't reordered the categories.");
    await userEvent.click(screen.getByRole("button", { name: "Move Talmud up" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(["Tanakh", "Talmud", "Mishnah"]);
  });
});
