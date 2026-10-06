import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState, ErrorState, LoadingState } from "./Feedback";

describe("Feedback states", () => {
  it("LoadingState announces status", () => {
    render(<LoadingState />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
  it("EmptyState shows its title and body without an alert", () => {
    render(<EmptyState title="No connections">Try another verse.</EmptyState>);
    expect(screen.getByRole("heading", { name: "No connections" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("ErrorState is an alert", () => {
    render(<ErrorState title="Couldn't load text" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load text");
  });
});
