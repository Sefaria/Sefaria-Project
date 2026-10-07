import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { column, leaf, row, split } from "~/lib/layout/tree";
import { SplitView } from "./SplitView";

const cells = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>("[data-leaf]")].map((e) => e.dataset.leaf);

// @feature SHL-039
describe("SplitView", () => {
  it("renders every leaf in reading order", () => {
    const { container } = render(<SplitView node={row(leaf("a"), column(leaf("b"), leaf("c")))} renderLeaf={(id) => <span>{id}</span>} />);
    expect(cells(container)).toEqual(["a", "b", "c"]);
    expect(container.querySelector('[data-direction="row"] [data-direction="column"]')).not.toBeNull();
  });

  it("gives each cell its share and minimum", () => {
    const { container } = render(<SplitView minLeafSize={360} node={split("row", [leaf("a"), column(leaf("b"), leaf("c"))], [0.68, 0.32])} renderLeaf={(id) => id} />);
    const [a, bc] = [...container.querySelectorAll<HTMLElement>('[data-direction="row"] > div')];
    expect(a!.style.getPropertyValue("--share")).toBe("0.68");
    expect(a!.style.getPropertyValue("--min")).toBe("360px");
    expect(bc!.style.getPropertyValue("--min")).toBe("360px"); // a column of two still needs one panel's width
  });

  it("a row nested in a column needs room for all of its leaves", () => {
    const { container } = render(<SplitView minLeafSize={100} node={column(row(leaf("a"), leaf("b"), leaf("c")), leaf("d"))} renderLeaf={(id) => id} />);
    const first = container.querySelector<HTMLElement>('[data-direction="column"] > div');
    expect(first!.style.getPropertyValue("--min")).toBe("100px"); // along the column it is one leaf tall
  });

  it("can be named as a group", () => {
    render(<SplitView label="Open texts" node={row(leaf("a"), leaf("b"))} renderLeaf={(id) => id} />);
    expect(screen.getByRole("group", { name: "Open texts" })).toBeInTheDocument();
  });

  it("a single leaf renders without a split", () => {
    const { container } = render(<SplitView node={leaf("a")} renderLeaf={(id) => id} />);
    expect(container.querySelector("[data-direction]")).toBeNull();
    expect(cells(container)).toEqual(["a"]);
  });
});
