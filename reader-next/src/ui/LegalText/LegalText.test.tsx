// @feature ACC-008 @feature STA-007
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LegalText } from "./LegalText";

describe("LegalText", () => {
  it("the terms sentence with both links in new tabs", () => {
    const { container } = render(<LegalText origin="" />);
    expect(container).toHaveTextContent("By continuing, you are agreeing to Sefaria's Terms of Use and Privacy Policy.");
    expect(screen.getByRole("link", { name: "Terms of Use" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy-policy");
  });
});
