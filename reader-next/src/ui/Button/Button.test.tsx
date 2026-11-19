import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { LinkProvider } from "../Link/Link";
import { forwardRef } from "react";

describe("Button", () => {
  it("renders a real button that defaults to type=button", () => {
    render(<Button>Save</Button>);
    const b = screen.getByRole("button", { name: "Save" });
    expect(b.tagName).toBe("BUTTON");
    expect(b).toHaveAttribute("type", "button");
  });

  // Audit appendix: the old Button rendered <a role=button> for links, which mis-announces navigation.
  it("renders a link (not role=button) when given href", () => {
    render(<Button href="/texts">Texts</Button>);
    const a = screen.getByRole("link", { name: "Texts" });
    expect(a).toHaveAttribute("href", "/texts");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("calls onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("blocks activation when disabled but stays focusable and exposes aria-disabled", async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Go</Button>);
    const b = screen.getByRole("button");
    expect(b).toHaveAttribute("aria-disabled", "true");
    b.focus();
    expect(b).toHaveFocus();
    await userEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is busy and blocks clicks while loading, keeping its label", async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Publish</Button>);
    const b = screen.getByRole("button", { name: /Publish/ });
    expect(b).toHaveAttribute("aria-busy", "true");
    await userEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("uses the injected router link for navigation", () => {
    const RouterLink = forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>(
      function RouterLink(props, ref) {
        return <a ref={ref} data-router="yes" {...props} />;
      },
    );
    render(
      <LinkProvider value={RouterLink}>
        <Button href="/Genesis.1">Genesis</Button>
      </LinkProvider>,
    );
    expect(screen.getByRole("link", { name: "Genesis" })).toHaveAttribute("data-router", "yes");
  });

  it("does not follow a disabled link", async () => {
    render(<Button href="/x" aria-disabled>Nope</Button>);
    const a = screen.getByRole("link");
    const prevented = !a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(prevented).toBe(true);
  });
});
