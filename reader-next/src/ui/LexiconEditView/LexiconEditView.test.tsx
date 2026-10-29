import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LexiconContentEdit, LexiconHeadwordEdit } from "./LexiconEditView";

const id = { lexiconName: "Jastrow Dictionary", headword: "אב" };
const resolveRef = vi.fn(async (t: string) => ({ ref: t, href: `/${t}` }));

// @feature CON-072
describe("LexiconHeadwordEdit", () => {
  it("explains itself off a dictionary entry", () => {
    render(<LexiconHeadwordEdit identity={null} onRename={vi.fn()} />);
    expect(screen.getByText("This tool is only available while viewing a lexicon entry.")).toBeInTheDocument();
  });

  it("renames and says when the server adjusted the headword", async () => {
    const onRename = vi.fn().mockResolvedValue("אב²");
    render(<LexiconHeadwordEdit identity={id} onRename={onRename} />);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    await userEvent.clear(screen.getByLabelText("New headword"));
    await userEvent.type(screen.getByLabelText("New headword"), "אב");
    expect(save).toBeDisabled(); // the same headword
    await userEvent.type(screen.getByLabelText("New headword"), "א");
    await userEvent.click(save);
    expect(onRename).toHaveBeenCalledWith(id, "אבא");
    expect(await screen.findByRole("status")).toHaveTextContent('Saved as "אב²" (adjusted from "אבא").');
  });

  it("shows the server's error", async () => {
    render(<LexiconHeadwordEdit identity={id} onRename={vi.fn().mockRejectedValue(new Error("'אבא' was just claimed by another change; please retry."))} />);
    await userEvent.type(screen.getByLabelText("New headword"), "א");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("just claimed");
  });
});

describe("LexiconContentEdit", () => {
  it("shows the content as a tree of rendered values and saves the edited draft", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<LexiconContentEdit identity={id} draft={{ content: { senses: [{ definition: "<b>father</b>" }] }, notes: "" }} onSave={onSave} resolveRef={resolveRef} />);
    expect(screen.getByText("father").tagName).toBe("B");
    expect(screen.getByText("(empty)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit notes" }));
    const box = screen.getByRole("textbox", { name: "notes" });
    box.innerHTML = "a <i>note</i>";
    box.dispatchEvent(new Event("input", { bubbles: true }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(id, { content: { senses: [{ definition: "<b>father</b>" }] }, notes: "a <i>note</i>" });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
  });

  it("Cancel puts the field back", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<LexiconContentEdit identity={id} draft={{ notes: "old" }} onSave={onSave} resolveRef={resolveRef} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit notes" }));
    const box = screen.getByRole("textbox", { name: "notes" });
    box.innerHTML = "new";
    box.dispatchEvent(new Event("input", { bubbles: true }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(id, { notes: "old" });
  });

  it("shows a load error", () => {
    render(<LexiconContentEdit identity={id} draft="More than one entry currently matches this headword." onSave={vi.fn()} resolveRef={resolveRef} />);
    expect(screen.getByRole("alert")).toHaveTextContent("More than one entry");
  });
});
