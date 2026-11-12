import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TopicLandingSearch, type SearchSuggestion } from "./TopicLanding";

const names: SearchSuggestion[] = [
  { text: "Shabbat", categoryText: "", slug: "shabbat" },
  { text: "Shabbat Meals", categoryText: "", slug: "shabbat-meals" },
  { text: "Shabbat Candles", categoryText: "", slug: "shabbat-candles" },
];
/** The same topics once the topics TOC has arrived: only the category paths are new. */
const withPaths = names.map((s) => ({ ...s, categoryText: "Holidays › Shabbat" }));

const selected = () => screen.getAllByRole("option").map((o) => o.getAttribute("aria-selected"));

// @feature TOP-004
describe("TopicLandingSearch", () => {
  it("keeps the highlighted topic when the same suggestions are filled in with their categories", async () => {
    const props = { numOfTopics: 5768, onInput: vi.fn(), onChoose: vi.fn() };
    const { rerender } = render(<TopicLandingSearch {...props} suggestions={names} />);
    const box = screen.getByRole("combobox");
    await userEvent.type(box, "shabb");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(selected()).toEqual(["false", "true", "false"]);

    rerender(<TopicLandingSearch {...props} suggestions={withPaths} />);
    expect(selected()).toEqual(["false", "true", "false"]);
    await userEvent.keyboard("{ArrowDown}");
    expect(selected()).toEqual(["false", "false", "true"]);
  });

  it("starts over when the topics listed change", async () => {
    const props = { numOfTopics: 5768, onInput: vi.fn(), onChoose: vi.fn() };
    const { rerender } = render(<TopicLandingSearch {...props} suggestions={names} />);
    await userEvent.type(screen.getByRole("combobox"), "shabb");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    rerender(<TopicLandingSearch {...props} suggestions={names.slice(1)} />);
    expect(selected()).toEqual(["false", "false"]);
  });
});
