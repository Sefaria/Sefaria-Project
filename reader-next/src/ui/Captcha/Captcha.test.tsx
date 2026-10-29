// @feature ACC-010
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Captcha } from "./Captcha";

describe("Captcha", () => {
  it("wraps the widget and shows its error", () => {
    const { container, rerender } = render(<Captcha><div id="slot" /></Captcha>);
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(<Captcha error="Verify that you are not a robot"><div id="slot" /></Captcha>);
    expect(screen.getByRole("alert")).toHaveTextContent("Verify that you are not a robot");
    expect(container.querySelector("#slot")).not.toBeNull();
  });
});
