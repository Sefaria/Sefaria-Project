// @feature USL-008 @feature USL-003 @feature USL-004
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NoteListing, NotesList, TextPassageItem, UserHistoryList, UserHistoryPage } from "./UserHistoryPage";

const hrefs = { saved: "/saved", history: "/history", notes: "/texts/notes" };

describe("UserHistoryPage (the old UserHistoryPanel)", () => {
  it("shows the three tabs, the current one marked", () => {
    render(<UserHistoryPage tab="history" hrefs={hrefs}><p>list</p></UserHistoryPage>);
    expect(screen.getByRole("link", { name: "Saved" })).toHaveAttribute("href", "/saved");
    expect(screen.getByRole("link", { name: "Notes" })).toHaveAttribute("href", "/texts/notes");
    expect(screen.getByRole("link", { name: "History" })).toHaveAttribute("aria-current", "page");
  });
  it("the old empty and disabled messages", () => {
    const { rerender } = render(<UserHistoryList tab="saved" items={[]} settingsHref="/settings/account" />);
    expect(screen.getByText("Click the bookmark icon on texts or sheets to save them here.")).toBeInTheDocument();
    rerender(<UserHistoryList tab="history" items={[]} settingsHref="/settings/account" />);
    expect(screen.getByText("Texts and sheets that you read will be available for you to see here.")).toBeInTheDocument();
    rerender(<UserHistoryList tab="history" items={undefined} disabled settingsHref="/settings/account" />);
    expect(screen.getByRole("link", { name: "account settings" })).toHaveAttribute("href", "/settings/account");
  });
  it("a text: its citation and text link to it, with the time since", () => {
    render(<TextPassageItem href="/Genesis.1.1" citation={{ en: "Genesis 1:1", he: "בראשית א:א" }} text={{ en: "In the beginning", he: "בראשית" }} color="red" timeStamp="5m" />);
    expect(screen.getByRole("link", { name: "Genesis 1:1" })).toHaveAttribute("href", "/Genesis.1.1");
    expect(screen.getByText("5m")).toBeInTheDocument();
    expect(screen.getByText("In the beginning")).toBeInTheDocument();
  });
  it("a note: the citation, the text with links, delete; none yet is the old message", async () => {
    const onDelete = vi.fn();
    const { rerender } = render(<NotesList notes={[<NoteListing key="1" citation="Genesis 1:3" href="/Genesis.1.3?with=Notes" text={"see https://example.com"} onDelete={onDelete} />]} />);
    expect(screen.getByRole("link", { name: "Genesis 1:3" })).toHaveAttribute("href", "/Genesis.1.3?with=Notes");
    expect(screen.getByRole("link", { name: "https://example.com" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete note" }));
    expect(onDelete).toHaveBeenCalled();
    rerender(<NotesList notes={[]} />);
    expect(screen.getByText("You haven't written any notes yet.")).toBeInTheDocument();
  });
});
