// @feature LIB-022 @feature STA-005
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AboutSidebar, UpdateForm, UpdateItem, UpdatesPage } from "./UpdatesPage";

describe("New Additions", () => {
  it("the About list, New Additions marked; the title 'Updates' over the list", () => {
    render(<UpdatesPage he={false} sidebar={<AboutSidebar current="updates" href={(p) => `https://www.sefaria.org${p}`} />}><p>item</p></UpdatesPage>);
    expect(screen.getByRole("link", { name: "New Additions" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "What is Sefaria?" })).toHaveAttribute("href", "https://www.sefaria.org/about");
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Updates");
  });
  it("a moderator's delete button", async () => {
    const onDelete = vi.fn();
    render(<UpdateItem onDelete={onDelete} deleteLabel="Delete">x</UpdateItem>);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalled();
  });
  it("the moderators' form: its check, then the values; cleared once sent", async () => {
    const onSubmit = vi.fn(async () => null);
    const validate = vi.fn((v: { index: string }) => (v.index ? null : "Index is required"));
    render(<UpdateForm validate={validate} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Index is required");
    await userEvent.click(screen.getByRole("radio", { name: "Version" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Index Title" }), "Genesis");
    await userEvent.type(screen.getByRole("textbox", { name: "Version Title" }), "V");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Version Language" }), "he");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledWith({ type: "version", index: "Genesis", version: "V", language: "he", en: "", he: "" });
    expect(screen.getByRole("textbox", { name: "Index Title" })).toHaveValue("");
  });
});
