import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { FindingsView } from "./FindingsView";
import { GENESIS_1, GROUPS } from "./story-data";

const base = { groups: GROUPS, selectedRefs: ["Genesis 1:1"], refHref: (r: string) => `/ref/${r}` };

// @feature CON-073 @feature CON-074
describe("FindingsView", () => {
  it("groups by method, the method with more findings first, its newest finding first", () => {
    render(<FindingsView {...base} />);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Rabbi Ploni's Method", "Rabbi Almoni's Questions"]);
    const first = screen.getByRole("region", { name: "Rabbi Ploni's Method" });
    expect(within(first).getAllByRole("heading", { level: 4 }).map((h) => h.textContent)).toEqual(["Light before the luminaries", "The first verse as a heading for the chapter"]);
  });

  it("each finding: title, conclusion, its label always, the passages it cites, and its sheet and page in a new tab", () => {
    render(<FindingsView {...base} />);
    const item = screen.getByText("The first verse as a heading for the chapter").closest("li")!;
    expect(item).toHaveTextContent("AI-assisted reading in the approach of Rabbi Ploni");
    expect(within(item).getByRole("link", { name: "Genesis 2:4" })).toHaveAttribute("href", "/ref/Genesis 2:4");
    expect(within(item).getByRole("link", { name: "Psalms 104:2" })).toBeInTheDocument();
    expect(within(item).queryByRole("link", { name: "Genesis 1:1-2" })).toBeNull(); // the anchor is the passage being read
    const sheet = within(item).getByRole("link", { name: "Open sheet" });
    expect(sheet).toHaveAttribute("href", GENESIS_1[0]!.sheetUrl);
    expect(sheet).toHaveAttribute("target", "_blank");
    expect(within(item).getByRole("link", { name: "View finding" })).toHaveAttribute("href", GENESIS_1[0]!.url);
    // no sheet: no Open sheet
    const noSheet = screen.getByText("מדוע נפתחה התורה בבריאה").closest("li")!;
    expect(within(noSheet).queryByRole("link", { name: "Open sheet" })).toBeNull();
    expect(noSheet).toHaveTextContent("קריאה בסיוע בינה מלאכותית");
  });

  it("a long conclusion is clamped, with Show more / Show less", async () => {
    render(<FindingsView {...base} />);
    const item = screen.getByText("The first verse as a heading for the chapter").closest("li")!;
    const conclusion = within(item).getByText(/Read with this method/);
    expect(conclusion).toHaveAttribute("data-clamped", "true");
    const more = within(item).getByRole("button", { name: "Show more" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(more);
    expect(conclusion).not.toHaveAttribute("data-clamped");
    expect(within(item).getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
    // a short one has no button
    const short = screen.getByText("Light before the luminaries").closest("li")!;
    expect(within(short).queryByRole("button")).toBeNull();
  });

  it("a plain click on a cited passage opens it in the reader; a modified click is left to the browser", async () => {
    const onOpenRef = vi.fn();
    render(<FindingsView {...base} onOpenRef={onOpenRef} />);
    await userEvent.click(screen.getByRole("link", { name: "Psalms 104:2" }));
    expect(onOpenRef).toHaveBeenCalledWith("Psalms 104:2", expect.anything());
  });

  it("states: loading, nothing known (English and Hebrew)", () => {
    const { rerender } = render(<FindingsView {...base} groups={[]} loading />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    rerender(<FindingsView {...base} groups={[]} />);
    expect(screen.getByText("No findings known here.")).toBeInTheDocument();
    rerender(<InterfaceLangProvider lang="hebrew"><FindingsView {...base} groups={[]} /></InterfaceLangProvider>);
    expect(screen.getByText("אין ממצאים ידועים כאן.")).toBeInTheDocument();
  });

  it("the Hebrew interface names each method in Hebrew", () => {
    render(<InterfaceLangProvider lang="hebrew"><FindingsView {...base} /></InterfaceLangProvider>);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["שיטת רבי פלוני", "שאלות רבי אלמוני"]);
    expect(screen.getAllByRole("link", { name: "פתיחת דף המקורות" }).length).toBe(2);
  });
});
