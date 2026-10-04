/* Testing done using Jest */
// POC (la-sandbox): the purple banner above "Browse the Library", shown when the widget's
// toolbox places the assistant there, with copy the toolbox can change.
jest.mock("../sefaria/sefaria", () => ({ __esModule: true, default: { interfaceLang: "english" } }));
jest.mock("../Misc", () => ({ InterfaceText: ({ children }) => children }));

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { LibraryAssistantBrowseBanner } from "../LibraryAssistantPoc";

describe("LibraryAssistantBrowseBanner", function () {
  let container;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    document.body.appendChild(document.createElement("lc-chatbot"));
    localStorage.clear();
  });
  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    document.querySelector("lc-chatbot")?.remove();
  });

  const render = () => act(() => { ReactDOM.render(<LibraryAssistantBrowseBanner />, container); });
  const banner = () => container.querySelector(".libraryAssistantBanner");

  it("is absent while the assistant lives in the header", function () {
    render();
    expect(banner()).toBeNull();
  });

  it("shows when placed there, and opens the assistant", function () {
    localStorage.setItem("lc_chatbot:poc_toolbox", JSON.stringify({ placement: "banner" }));
    render();
    expect(banner().textContent).toBe("✦texts_page.library_assistant_banner›");

    const listener = jest.fn();
    document.addEventListener("chatbot:open", listener);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => { banner().dispatchEvent(click); });
    document.removeEventListener("chatbot:open", listener);
    expect(listener.mock.calls[0][0].detail).toEqual({ source: "browse_banner" });
    expect(click.defaultPrevented).toBe(true);
  });

  it("follows live toolbox changes, copy included", function () {
    render();
    act(() => {
      document.dispatchEvent(new CustomEvent("chatbot:poc-config", { detail: { placement: "banner", bannerText: "Start here" } }));
    });
    expect(banner().textContent).toBe("✦Start here›");
  });

  it("is absent when the assistant isn't on the page", function () {
    document.querySelector("lc-chatbot").remove();
    localStorage.setItem("lc_chatbot:poc_toolbox", JSON.stringify({ placement: "banner" }));
    render();
    expect(banner()).toBeNull();
  });
});
