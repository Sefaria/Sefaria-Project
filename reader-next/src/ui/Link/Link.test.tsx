import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Link } from "./Link";

describe("Link", () => {
  it("is a plain anchor by default", () => {
    render(<Link href="/Genesis.1">Genesis 1</Link>);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/Genesis.1");
  });

  it.each(["https://example.org/x", "//example.org/x", "mailto:a@b.c"])("adds rel for external %s", (href) => {
    render(<Link href={href}>x</Link>);
    expect(screen.getByRole("link")).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("adds rel when opening a new tab", () => {
    render(<Link href="/x" target="_blank">x</Link>);
    expect(screen.getByRole("link")).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("leaves internal links without rel", () => {
    render(<Link href="/x">x</Link>);
    expect(screen.getByRole("link")).not.toHaveAttribute("rel");
  });
});
