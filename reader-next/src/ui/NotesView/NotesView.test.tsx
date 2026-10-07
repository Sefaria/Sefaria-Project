// @feature CON-049 @feature USL-007 @feature USL-005
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotesView } from "./NotesView";

const setup = (over = {}) => {
  const props = { notes: [{ _id: "n1", text: "First note\nsecond line https://example.com <b>x</b>" }], onSave: vi.fn(async () => {}), onDelete: vi.fn(async () => {}), allNotesHref: "/texts/notes", ...over };
  render(<NotesView {...props} />);
  return props;
};

describe("NotesView (AddNoteBox + MyNotes)", () => {
  it("adds a note from the box, then clears it", async () => {
    const p = setup();
    const box = screen.getByRole("textbox", { name: "Write a note..." });
    expect(box).toHaveFocus();
    await userEvent.type(box, "A new note");
    await userEvent.click(screen.getByRole("button", { name: "Add Note" }));
    expect(p.onSave).toHaveBeenCalledWith("A new note", undefined);
    expect(box).toHaveValue("");
  });
  it("an empty box sends nothing", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("button", { name: "Add Note" }));
    expect(p.onSave).not.toHaveBeenCalled();
  });
  it("shows the reader's notes with line breaks and links, markup escaped; Go to My Notes", () => {
    setup();
    const note = screen.getByRole("list", { name: "My notes" }).querySelector("li span")!;
    expect(note.innerHTML).toContain("<br>");
    expect(note.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
    expect(note.textContent).toContain("<b>x</b>");
    expect(screen.getByRole("link", { name: "Go to My Notes" })).toHaveAttribute("href", "/texts/notes");
  });
  it("the pencil edits a note: Save sends its id; Delete Note asks first", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("button", { name: "Edit Note" }));
    const box = screen.getByRole("textbox", { name: "Write a note..." });
    expect(box).toHaveValue("First note\nsecond line https://example.com <b>x</b>");
    await userEvent.clear(box);
    await userEvent.type(box, "Changed");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(p.onSave).toHaveBeenCalledWith("Changed", "n1");
    await userEvent.click(screen.getByRole("button", { name: "Edit Note" }));
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await userEvent.click(screen.getByRole("button", { name: "Delete Note" }));
    expect(p.onDelete).toHaveBeenCalledWith("n1");
  });
  it("a failed save keeps the text and says why", async () => {
    setup({ onSave: vi.fn(async () => { throw new Error("You must be logged in"); }) });
    await userEvent.type(screen.getByRole("textbox"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Add Note" }));
    expect(screen.getByRole("alert")).toHaveTextContent("You must be logged in");
    expect(screen.getByRole("textbox")).toHaveValue("x");
  });
});
