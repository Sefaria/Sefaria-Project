import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { FilterRow } from "./FilterRow";

const base = { label: { en: "Commentary", he: "מפרשים" }, href: "/Genesis.1.1?with=Commentary+ConnectionsList" };

// @feature CON-019 @feature CON-025 @feature CON-026
describe("FilterRow", () => {
  it("is a real link with the label and count", () => {
    render(<FilterRow {...base} count={958} />);
    const a = screen.getByRole("link", { name: /Commentary/ });
    expect(a).toHaveAttribute("href", base.href);
    expect(a).toHaveTextContent("(958)");
  });

  it("shows the label in the interface language", () => {
    render(<InterfaceLangProvider lang="hebrew"><FilterRow {...base} count={3} /></InterfaceLangProvider>);
    expect(screen.getByRole("link", { name: /מפרשים/ })).toBeInTheDocument();
  });

  it("marks English availability for sighted and screen-reader users", () => {
    render(<FilterRow {...base} hasEnglish />);
    expect(screen.getByText("EN")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("English available")).toBeInTheDocument();
  });

  it("navigates in-app on a plain click, but leaves modified clicks to the browser", async () => {
    const onNavigate = vi.fn();
    render(<FilterRow {...base} onNavigate={onNavigate} />);
    const a = screen.getByRole("link");
    await userEvent.click(a);
    expect(onNavigate).toHaveBeenCalledWith(base.href, expect.anything());
    onNavigate.mockClear();
    fireEvent.click(a, { ctrlKey: true });
    fireEvent.click(a, { metaKey: true });
    fireEvent.click(a, { button: 1 });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("shows the description in the interface language, falling back to the other", () => {
    const { rerender } = render(<FilterRow {...base} description={{ en: "English desc", he: "תיאור" }} />);
    expect(screen.getByText("English desc")).toBeInTheDocument();
    rerender(<InterfaceLangProvider lang="hebrew"><FilterRow {...base} description={{ en: "English desc", he: "תיאור" }} /></InterfaceLangProvider>);
    expect(screen.getByText("תיאור")).toBeInTheDocument();
    rerender(<InterfaceLangProvider lang="hebrew"><FilterRow {...base} description={{ en: "Only English" }} /></InterfaceLangProvider>);
    expect(screen.getByText("Only English")).toBeInTheDocument();
  });

  it("flags the current filter", () => {
    render(<FilterRow {...base} current />);
    expect(screen.getByRole("link")).toHaveAttribute("aria-current", "true");
  });
});
