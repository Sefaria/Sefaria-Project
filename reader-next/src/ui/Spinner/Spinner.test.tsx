import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { Spinner } from "./Spinner";

describe("Spinner", () => {
  it("announces loading as a status", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
  });
  it("announces in Hebrew in a Hebrew interface", () => {
    render(<InterfaceLangProvider lang="hebrew"><Spinner /></InterfaceLangProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("טוען");
  });
  it("can be purely decorative", () => {
    render(<Spinner label="" />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
