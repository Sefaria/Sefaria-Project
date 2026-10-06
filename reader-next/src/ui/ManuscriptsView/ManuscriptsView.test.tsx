import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { ManuscriptsView } from "./ManuscriptsView";
import { MANUSCRIPTS } from "./story-data";

// @feature CON-060
describe("ManuscriptsView (Genesis 1:1; compared with sefaria.org)", () => {
  it("shows the thumbnail (linking to the full image), the title, location, courtesy, licence and source", () => {
    render(<ManuscriptsView pages={MANUSCRIPTS} />);
    const img = screen.getByRole("img", { name: "Ancient Manuscript" });
    expect(img.closest("a")).toHaveAttribute("href", expect.stringMatching(/BIB_LENCDX_F001B\.jpg$/));
    expect(img).toHaveAttribute("src", expect.stringMatching(/thumbnail\.jpg$/));
    expect(screen.getByText("Leningrad Codex (1008 CE)")).toBeInTheDocument();
    expect(screen.getByText("LC Folio 1v")).toBeInTheDocument(); // underscores become spaces
    expect(screen.getByText(/Bruce Zuckerman, West Semitic Research/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "dornsife.usc.edu" })).toHaveAttribute("href", expect.stringContaining("dornsife.usc.edu"));
  });
  it("Hebrew interface: the Hebrew title and labels", () => {
    render(<InterfaceLangProvider lang="hebrew"><ManuscriptsView pages={MANUSCRIPTS} /></InterfaceLangProvider>);
    expect(screen.getByText("כתב יד לנינגרד (1008)")).toBeInTheDocument();
    expect(screen.getByText("מיקום:")).toBeInTheDocument();
  });
  it("an empty list says so", () => {
    render(<ManuscriptsView pages={[]} />);
    expect(screen.getByText("No manuscripts known here.")).toBeInTheDocument();
  });
});
