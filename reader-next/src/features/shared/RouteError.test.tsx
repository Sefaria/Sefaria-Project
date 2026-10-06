import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ invalidate: vi.fn() }) }));
import { RouteError } from "./RouteError";

// @feature SHL-035
describe("RouteError", () => {
  it("says something went wrong, how to get back, and what the error was", () => {
    render(<RouteError error={new Error("HTTP 500 for Genesis 1")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong!");
    expect(screen.getByRole("alert")).toHaveTextContent("Please use the back button or the menus above to get back on track.");
    expect(screen.getByTestId("error-message")).toHaveTextContent("HTTP 500 for Genesis 1");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
  it("a thrown string works too", () => {
    render(<RouteError error="boom" />);
    expect(screen.getByTestId("error-message")).toHaveTextContent("boom");
  });
});
