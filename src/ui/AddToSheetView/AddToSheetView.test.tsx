// @feature CON-034
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { sourcesFor } from "~/lib/user/sheets";
import { AddToSheetView } from "./AddToSheetView";

const base = { citation: { en: "Genesis 1:1", he: "בראשית א׳:א׳" }, citationHref: "/Genesis.1.1", sheetHref: (id: number) => `/sheets/${id}` };

describe("AddToSheetView (AddToSourceSheetBox)", () => {
  it("chooses the newest sheet, adds to it and confirms with links", async () => {
    const onAdd = vi.fn(async () => {});
    render(<AddToSheetView {...base} sheets={[{ id: 5, title: "<i>Newest</i>" }, { id: 4, title: "Older" }]} onAdd={onAdd} onCreate={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Add to" })).toHaveDisplayValue("Newest");
    await userEvent.click(screen.getByRole("button", { name: "Add to Sheet" }));
    expect(onAdd).toHaveBeenCalledWith({ id: 5, title: "<i>Newest</i>" });
    expect(screen.getByRole("status")).toHaveTextContent("Genesis 1:1 has been added to Newest.");
    expect(screen.getByRole("link", { name: "Newest" })).toHaveAttribute("href", "/sheets/5");
  });
  it("with no sheets, offers a new one by name and creates it first", async () => {
    const onCreate = vi.fn(async (title: string) => ({ id: 9, title }));
    const onAdd = vi.fn(async () => {});
    render(<AddToSheetView {...base} sheets={[]} onAdd={onAdd} onCreate={onCreate} />);
    expect(screen.getByRole("combobox", { name: "Add to" })).toHaveDisplayValue("Create a New Sheet");
    await userEvent.click(screen.getByRole("button", { name: "Add to Sheet" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Name your new sheet");
    await userEvent.type(screen.getByRole("textbox", { name: "Name New Sheet" }), "Creation");
    await userEvent.click(screen.getByRole("button", { name: "Add to Sheet" }));
    expect(onCreate).toHaveBeenCalledWith("Creation");
    expect(onAdd).toHaveBeenCalledWith({ id: 9, title: "Creation" });
  });
});

describe("sourcesFor (the versions sent with the source)", () => {
  const he = { versionTitle: "Miqra according to the Masorah", direction: "rtl" as const };
  const en = { versionTitle: "The Koren Jerusalem Bible", direction: "ltr" as const };
  it("one source keyed by direction", () => {
    expect(sourcesFor(["Genesis 1:1"], he, en)).toEqual([{ refs: ["Genesis 1:1"], "version-he": he.versionTitle, "version-en": en.versionTitle }]);
    expect(sourcesFor(["Genesis 1:1"])).toEqual([{ refs: ["Genesis 1:1"] }]);
  });
  it("two versions in the same direction are two sources", () => {
    expect(sourcesFor(["Philo 1"], { versionTitle: "A", direction: "ltr" }, { versionTitle: "B", direction: "ltr" })).toEqual([
      { refs: ["Philo 1"], "version-en": "A" },
      { refs: ["Philo 1"], "version-en": "B" },
    ]);
  });
});
