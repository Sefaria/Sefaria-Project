import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { indexDraft } from "~/lib/book/index-editor";
import { IndexEditor } from "./IndexEditor";

const tree = [
  { category: "Tanakh", heCategory: "תנך", contents: [{ category: "Torah", heCategory: "תורה", contents: [] }, { category: "Prophets", heCategory: "נביאים", contents: [] }] },
  { category: "Talmud", heCategory: "תלמוד", contents: [] },
] as never;
const initial = indexDraft({ title: "Genesis", heTitle: "בראשית", categories: ["Tanakh", "Torah"], sectionNames: ["Chapter", "Verse"] });
const props = { tree, isBook: (t: string) => t === "Genesis", confirmLinks: async () => true, onDelete: vi.fn(), onClose: vi.fn() };

// @feature BOK-030
describe("IndexEditor", () => {
  it("validates before saving and saves the draft with its category path", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<IndexEditor {...props} initial={initial} findAuthor={vi.fn()} onSave={onSave} />);
    await userEvent.clear(screen.getByLabelText("Text Title"));
    await userEvent.type(screen.getByLabelText("Text Title"), "Genesis 2");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("may not contain numbers");
    expect(onSave).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText("Text Title"));
    await userEvent.type(screen.getByLabelText("Text Title"), "Bereshit");
    await userEvent.selectOptions(screen.getByLabelText("Subcategory 1"), "Prophets");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: "Bereshit", categories: ["Tanakh", "Prophets"] }), expect.any(Function));
    expect(screen.getByText("Chapter › Verse")).toBeInTheDocument();
  });

  it("adds an author only when it is an author topic, and base texts only when they are books", async () => {
    const findAuthor = vi.fn(async (n: string) => (n === "Rashi" ? { name: "Rashi", slug: "rashi" } : "Invalid author."));
    render(<IndexEditor {...props} initial={initial} findAuthor={findAuthor} onSave={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Authors"), "Nobody{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid author.");
    await userEvent.clear(screen.getByLabelText("Authors"));
    await userEvent.type(screen.getByLabelText("Authors"), "Rashi{Enter}");
    expect(screen.getByRole("button", { name: "Remove Rashi" })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Dependence"), "Commentary");
    await userEvent.type(screen.getByLabelText("Base Text Titles"), "Exodus{Enter}");
    expect(await screen.findByText("Exodus is not a book in the Sefaria library.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create New Collective Title" }));
    expect(screen.getByLabelText("New Hebrew Collective Title")).toBeInTheDocument();
  });
});
