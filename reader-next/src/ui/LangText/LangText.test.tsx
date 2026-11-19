import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContentLangProvider } from "~/lib/i18n/content-lang";
import { dirFor } from "~/lib/i18n/direction";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { ContentText, LangText } from "./LangText";

// @feature I18-013 @feature I18-010
describe("dirFor", () => {
  it("knows the right-to-left languages, region subtags included", () => {
    expect(["he", "he-IL", "arc", "yi", "ar", "fa"].map(dirFor)).toEqual(Array(6).fill("rtl"));
    expect(["en", "de", "fr", "ru"].map(dirFor)).toEqual(Array(4).fill("ltr"));
  });
});

describe("LangText", () => {
  it("always sets lang and dir together, as the element asked for", () => {
    render(<LangText as="p" lang="he">שלום</LangText>);
    const el = screen.getByText("שלום");
    expect(el.tagName).toBe("P");
    expect(el).toHaveAttribute("lang", "he");
    expect(el).toHaveAttribute("dir", "rtl");
  });

  it("keeps a direction the data gives (a version's own) over the one from the language", () => {
    render(<LangText lang="jrb" dir="ltr">x</LangText>);
    expect(screen.getByText("x")).toHaveAttribute("dir", "ltr");
  });

  it("takes sanitised html", () => {
    const { container } = render(<LangText as="div" lang="en" html="<b>bold</b>" />);
    expect(container.querySelector("div[lang=en][dir=ltr] b")?.textContent).toBe("bold");
  });
});

describe("ContentText", () => {
  it("follows the content language provided above, not the interface (an English interface with a Hebrew sidebar)", () => {
    render(
      <InterfaceLangProvider lang="english">
        <ContentLangProvider lang="hebrew">
          <ContentText as="div" en="Rashi on Exodus 18:1" he={'רש"י על שמות י״ח:א׳'} />
        </ContentLangProvider>
      </InterfaceLangProvider>,
    );
    const el = screen.getByText('רש"י על שמות י״ח:א׳');
    expect(el).toHaveAttribute("dir", "rtl");
    expect(el).toHaveAttribute("lang", "he");
    expect(screen.queryByText("Rashi on Exodus 18:1")).toBeNull();
  });

  it("falls back to the interface language where no content language is provided", () => {
    render(
      <InterfaceLangProvider lang="hebrew">
        <ContentText en="Genesis" he="בראשית" />
      </InterfaceLangProvider>,
    );
    expect(screen.getByText("בראשית")).toHaveAttribute("dir", "rtl");
  });

  it("is strict by default and shows the other side, in its own direction, only with fallback", () => {
    const { container } = render(<ContentText lang="english" he="רק עברית" />);
    expect(container).toBeEmptyDOMElement();
    render(<ContentText lang="english" he="רק עברית" fallback />);
    expect(screen.getByText("רק עברית")).toHaveAttribute("dir", "rtl");
  });
});
