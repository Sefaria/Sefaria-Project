import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TopicCreateForm } from "./TopicCreateForm";

const parents = [{ slug: "authors", en: "Authors", he: "מחברים" }, { slug: "holidays", en: "Holidays", he: "חגים" }];

// @feature CON-047
describe("TopicCreateForm", () => {
  it("starts from the typed title and asks for a parent before saving", async () => {
    const onCreate = vi.fn();
    render(<TopicCreateForm initialTitle="Ark" parents={parents} hebrew={false} onCreate={onCreate} onCancel={() => {}} />);
    expect(screen.getByLabelText("Title")).toHaveValue("Ark");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please choose a category.");
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("saves titles, parent and comma-separated alternate titles; author fields show under Authors", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<TopicCreateForm initialTitle="Rashbam" parents={parents} hebrew={false} onCreate={onCreate} onCancel={() => {}} />);
    await userEvent.type(screen.getByLabelText("Hebrew Title"), 'רשב"ם');
    await userEvent.selectOptions(screen.getByLabelText("Parent Topic"), "authors");
    await userEvent.type(screen.getByLabelText("English Alternate Titles (comma separated)"), "Rabbi Samuel ben Meir, Rashbam");
    await userEvent.selectOptions(screen.getByLabelText(/^Era/), "RI");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ enTitle: "Rashbam", heTitle: 'רשב"ם', category: "authors", enAltTitles: ["Rabbi Samuel ben Meir", "Rashbam"], author: { era: "RI" } }));
  });

  it("shows the server's error and lets the moderator try again", async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error("A topic with this slug already exists"));
    render(<TopicCreateForm initialTitle="Ark" parents={parents} hebrew={false} onCreate={onCreate} onCancel={() => {}} />);
    await userEvent.selectOptions(screen.getByLabelText("Parent Topic"), "Main Menu");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});
