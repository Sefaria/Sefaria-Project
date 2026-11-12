import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { InterfaceText } from "./InterfaceText";

// @feature GUI-012 @feature GUI-019
describe("InterfaceText", () => {
  it("shows the English side in an English interface and tags the language", () => {
    render(
      <InterfaceLangProvider lang="english">
        <InterfaceText en="Texts" he="מקורות" />
      </InterfaceLangProvider>,
    );
    expect(screen.getByText("Texts")).toHaveAttribute("lang", "en");
    expect(screen.queryByText("מקורות")).toBeNull();
  });

  it("shows the Hebrew side in a Hebrew interface", () => {
    render(
      <InterfaceLangProvider lang="hebrew">
        <InterfaceText en="Texts" he="מקורות" />
      </InterfaceLangProvider>,
    );
    expect(screen.getByText("מקורות")).toHaveAttribute("lang", "he");
  });

  it("falls back to the other language rather than rendering nothing", () => {
    render(
      <InterfaceLangProvider lang="hebrew">
        <InterfaceText en="Only English" />
      </InterfaceLangProvider>,
    );
    const el = screen.getByText("Only English");
    expect(el).toHaveAttribute("lang", "en");
  });

  it("sets direction on the provider wrapper", () => {
    const { container } = render(
      <InterfaceLangProvider lang="hebrew">
        <InterfaceText en="x" he="y" />
      </InterfaceLangProvider>,
    );
    expect(container.firstElementChild).toHaveAttribute("dir", "rtl");
    expect(container.firstElementChild).toHaveAttribute("lang", "he");
  });
});
