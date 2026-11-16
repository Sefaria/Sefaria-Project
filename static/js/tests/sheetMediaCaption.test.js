// SheetMedia builds its caption as an HTML string rendered via dangerouslySetInnerHTML, so caption text
// from a sheet's author must pass through the same sanitizer as the other sheet fields before rendering.
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";

jest.mock("../sefaria/sefaria", () => {
  const util = jest.requireActual("../sefaria/util").default;
  return { __esModule: true, default: { _: (k) => k, util } };
});

// eslint-disable-next-line import/first
import { SheetMedia } from "../sheets/SheetContentSegments";

describe("SheetMedia caption sanitization", () => {
  let container;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    window.__sheetCaptionMarkupRan = undefined;
  });
  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    delete window.__sheetCaptionMarkupRan;
  });

  const render = (caption) => {
    act(() => {
      ReactDOM.render(
        <SheetMedia
          source={{ media: "https://www.youtube.com/embed/abc123", caption, node: 1 }}
          linkCount={0}
          highlighted={false}
          sheetSourceClick={() => {}}
          handleKeyPress={() => {}}
        />,
        container
      );
    });
    return container.querySelector(".mediaCaption");
  };

  it("strips script tags and event-handler attributes from caption.en and caption.he", () => {
    const caption = {
      en: '<img src="x" onerror="window.__sheetCaptionMarkupRan=1"><script>window.__sheetCaptionMarkupRan=2</script>Hello',
      he: '<b onmouseover="window.__sheetCaptionMarkupRan=3">שלום</b><script>window.__sheetCaptionMarkupRan=4</script>',
    };
    const captionEl = render(caption);
    expect(captionEl).not.toBeNull();
    expect(captionEl.querySelector("script")).toBeNull();
    expect(captionEl.querySelector("img")).toBeNull();
    expect(captionEl.innerHTML).not.toMatch(/onerror|onmouseover|<script/i);
    expect(captionEl.querySelector(".en").textContent).toContain("Hello");
    expect(captionEl.querySelector(".he").textContent).toContain("שלום");
    expect(window.__sheetCaptionMarkupRan).toBeUndefined();
  });

  it("keeps ordinary formatting markup in captions", () => {
    const captionEl = render({ en: "<b>Bold</b> text", he: "" });
    expect(captionEl.querySelector(".en b").textContent).toBe("Bold");
  });
});
