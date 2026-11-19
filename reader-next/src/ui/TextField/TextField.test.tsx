// @feature ACC-009 @feature ACC-010
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { TextField } from "./TextField";

function Controlled(props: Partial<Parameters<typeof TextField>[0]>) {
  const [v, setV] = useState("");
  return <TextField label="Password" name="password" type="password" value={v} onChange={(e) => setV(e.target.value)} {...props} />;
}

describe("TextField", () => {
  it("labels the control and ties the error to it", () => {
    render(<TextField label="Email Address" name="email" type="email" value="" onChange={() => {}} error="Required field" />);
    const input = screen.getByLabelText("Email Address");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "email-error");
    expect(screen.getByRole("alert")).toHaveTextContent("Required field");
  });
  it("the password toggle appears once something is typed and flips the type", async () => {
    render(<Controlled />);
    expect(screen.queryByRole("button", { name: "Show password" })).toBeNull();
    await userEvent.type(screen.getByLabelText("Password"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  });
  it("the trailing link works by click and Enter", async () => {
    const onClick = vi.fn();
    render(<Controlled trailingLink={{ text: "Forgot Password?", onClick }} />);
    const link = screen.getByRole("link", { name: "Forgot Password?" });
    await userEvent.click(link);
    link.focus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(2);
  });
  it("keeps the value's direction separate from the page's", () => {
    render(<TextField label="E" name="e" value="" inputDir="ltr" onChange={() => {}} />);
    expect(screen.getByLabelText("E")).toHaveAttribute("dir", "ltr");
  });
});
