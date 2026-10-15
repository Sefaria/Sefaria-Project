// @feature GUI-010
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProfilePic } from "./ProfilePic";

describe("ProfilePic", () => {
  it("shows the picture, and initials if it fails", () => {
    const { container } = render(<ProfilePic name="Ada Lovelace" url="https://example.org/a.png" />);
    const img = screen.getByRole("img", { name: "User Profile Picture" });
    fireEvent.error(img);
    expect(container).toHaveTextContent("AL");
  });
  it("a gravatar starts as initials and switches once it loads", () => {
    const { container } = render(<ProfilePic name="Ada" url="https://www.gravatar.com/avatar/x" />);
    expect(container).toHaveTextContent("A");
    fireEvent.load(container.querySelector("img")!);
    expect(container).not.toHaveTextContent("A");
  });
  it("no picture: initials", () => {
    const { container } = render(<ProfilePic name="Bo Diddley" />);
    expect(container).toHaveTextContent("BD");
  });
});
