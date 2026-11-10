import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConnectionsPanel, ResourcesTitle } from "./ConnectionsPanel";

// @feature CON-003 @feature CON-070
describe("ConnectionsPanel", () => {
  it("is a named region with the view title", () => {
    render(<ConnectionsPanel label="Resources" title={<ResourcesTitle />}>body</ConnectionsPanel>);
    expect(screen.getByRole("complementary", { name: "Resources" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Resources" })).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("shows a back link instead of a title for sub-views", () => {
    render(<ConnectionsPanel label="Rashi" back={{ href: "/Genesis.1.1?with=all", label: "Resources" }}>x</ConnectionsPanel>);
    expect(screen.getByRole("link", { name: "Resources" })).toHaveAttribute("href", "/Genesis.1.1?with=all");
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("closes", async () => {
    const onClose = vi.fn();
    render(<ConnectionsPanel label="R" title="R" onClose={onClose}>x</ConnectionsPanel>);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("has no close button unless it can close", () => {
    render(<ConnectionsPanel label="R" title="R">x</ConnectionsPanel>);
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  // a11y S5 and N8: the Hebrew interface names the panel, Close and the language button in Hebrew; the button says what it does
  it("is named in the interface's language, its language button by what it does", () => {
    const { rerender } = render(<ConnectionsPanel label="Resources" title="R" lang="en" onLang={() => {}} onClose={() => {}}>x</ConnectionsPanel>);
    expect(screen.getByRole("button", { name: "Show in Hebrew" })).toBeInTheDocument();
    rerender(
      <InterfaceLangProvider lang="hebrew">
        <ConnectionsPanel label="Resources" title="R" lang="he" onLang={() => {}} onClose={() => {}}>x</ConnectionsPanel>
      </InterfaceLangProvider>,
    );
    expect(screen.getByRole("complementary", { name: "קישורים וכלים" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "סגירה" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "הצגה באנגלית" })).toBeInTheDocument();
    rerender(
      <InterfaceLangProvider lang="hebrew">
        <ConnectionsPanel label={{ en: "Rashi", he: 'רש"י' }} title="R">x</ConnectionsPanel>
      </InterfaceLangProvider>,
    );
    expect(screen.getByRole("complementary", { name: 'רש"י' })).toBeInTheDocument();
  });
});
