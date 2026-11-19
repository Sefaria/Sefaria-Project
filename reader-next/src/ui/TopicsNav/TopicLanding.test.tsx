import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { placeBullets, TopicLandingSearch, type SearchSuggestion } from "./TopicLanding";

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

/**
 * A line box for placeBullets: items of the given widths, one space between them, wrapped greedily into a box `width` wide; a bullet
 * widens its item, `data-break` ends the line after it. Each item's offsetTop is its line's index, read live from its attributes.
 */
function cloud(widths: number[], width: number, bullet = 10, space = 5): HTMLElement[] {
  const els = widths.map(() => document.createElement("span"));
  const lineOf = () => {
    const lines: number[] = [];
    let line = 0;
    let x = 0;
    els.forEach((el, i) => {
      const w = widths[i]! + (el.hasAttribute("data-bullet") ? bullet : 0);
      if (x > 0 && x + space + w > width) {
        line++;
        x = 0;
      }
      x += (x > 0 ? space : 0) + w;
      lines.push(line);
      if (el.hasAttribute("data-break")) {
        line++;
        x = 0;
      }
    });
    return lines;
  };
  els.forEach((el, i) => Object.defineProperty(el, "offsetTop", { get: () => lineOf()[i]! * 40 }));
  return els;
}
/** The rule the e2e spec checks: a bullet exactly when the next item is on the same line, and none after the last. */
const wrong = (els: HTMLElement[]) =>
  els.filter((el, i) => (i < els.length - 1 ? el.hasAttribute("data-bullet") !== (el.offsetTop === els[i + 1]!.offsetTop) : el.hasAttribute("data-bullet"))).length;

// @feature TOP-005
describe("placeBullets (the topic cloud)", () => {
  it("an unlucky sample: the bullet would push the next item down, and without it the item fits", () => {
    // 100 + 5 + 95 = 200 fits the 200px line; 100 + 10 (bullet) + 5 + 95 does not. Placing and re-placing flipped between the two.
    const els = cloud([100, 95, 60, 60, 120, 70], 200);
    placeBullets(els);
    expect(wrong(els)).toBe(0);
    expect(els.map((e) => e.offsetTop / 40)).toEqual([0, 1, 1, 2, 3, 4]);
  });

  it("any sample: the rule holds for every item, and lines keep several items with bullets between them", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 200; n++) {
      const els = cloud(Array.from({ length: 50 }, () => 40 + Math.floor(rnd() * 160)), 900);
      placeBullets(els);
      expect(wrong(els)).toBe(0);
      expect(els.filter((e) => e.hasAttribute("data-bullet")).length).toBeGreaterThan(20);
    }
  });

  it("placing again (fonts in, a resize) starts from the layout, not from the last placement", () => {
    const els = cloud([100, 95, 60, 60, 120, 70], 200);
    placeBullets(els);
    placeBullets(els);
    expect(wrong(els)).toBe(0);
  });
});
