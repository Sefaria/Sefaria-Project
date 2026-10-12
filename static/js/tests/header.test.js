// Companion to header.ssr.test.js: after mounting, the client renders only the header matching the breakpoint,
// and hydrating the server markup (which has both headers) must not produce a mismatch.
import React from "react";
import ReactDOM from "react-dom";
import ReactDOMServer from "react-dom/server";
import { act } from "react-dom/test-utils";

jest.mock("../sefaria/sefaria", () => require("./headerTestMocks").sefariaMock());
jest.mock("../sefaria/util", () => ({ __esModule: true, default: { handleKeyboardClick: () => {} } }));
jest.mock("../Misc", () => require("./headerTestMocks").miscMock());
jest.mock("../common/DropdownMenu", () => require("./headerTestMocks").dropdownMenuMock());
jest.mock("../ProfilePic", () => ({ ProfilePic: require("./headerTestMocks").stub("ProfilePic") }));
jest.mock("../HeaderAutocomplete", () => ({ HeaderAutocomplete: require("./headerTestMocks").stub("HeaderAutocomplete") }));
jest.mock("../common/Button", () => ({ __esModule: true, default: require("./headerTestMocks").stub("Button") }));

// eslint-disable-next-line import/first
import Sefaria from "../sefaria/sefaria";
// eslint-disable-next-line import/first
import { Header } from "../Header";
// eslint-disable-next-line import/first
import { headerProps, textPanel } from "./headerTestMocks";

describe("Header in a browser", () => {
  let container;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    global.sa_event = jest.fn();
    global.gtag = jest.fn();
  });
  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  });

  const mount = (breakpoint, props) => {
    Sefaria.getBreakpoint.mockReturnValue(breakpoint);
    act(() => { ReactDOM.render(<Header {...headerProps(props)} />, container); });
  };

  it("renders only the desktop header on desktop", () => {
    mount("desktop");
    expect(container.querySelector(".headerInner.desktopHeaderInner")).not.toBeNull();
    expect(container.querySelector(".headerInner.mobile")).toBeNull();
    expect(container.querySelector(".mobileNavMenu")).toBeNull();
  });

  it("renders only the desktop header on tablet", () => {
    mount("tablet");
    expect(container.querySelector(".headerInner.desktopHeaderInner")).not.toBeNull();
    expect(container.querySelector(".headerInner.mobile")).toBeNull();
  });

  it("renders only the mobile header and nav menu on mobile", () => {
    mount("mobile");
    expect(container.querySelector(".headerInner.desktopHeaderInner")).toBeNull();
    expect(container.querySelector(".headerInner.mobile")).not.toBeNull();
    expect(container.querySelector(".mobileNavMenu")).not.toBeNull();
  });

  it("renders nothing on mobile while viewing a text", () => {
    mount("mobile", { firstPanel: textPanel });
    expect(container.innerHTML).toBe("");
  });

  it("renders the header on mobile while viewing a text when the mobile nav menu is open", () => {
    mount("mobile", { firstPanel: textPanel, mobileNavMenuOpen: true });
    expect(container.querySelector(".headerInner.mobile")).not.toBeNull();
  });

  it("renders the header on desktop while viewing a text", () => {
    mount("desktop", { firstPanel: textPanel });
    expect(container.querySelector(".headerInner.desktopHeaderInner")).not.toBeNull();
  });

  it.each(["mobile", "desktop"])("hydrates the server markup without a mismatch on %s", (breakpoint) => {
    const props = headerProps();
    container.innerHTML = ReactDOMServer.renderToString(<Header {...props} />);
    Sefaria.getBreakpoint.mockReturnValue(breakpoint);
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      act(() => { ReactDOM.hydrate(<Header {...props} />, container); });
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
    const isMobile = breakpoint === "mobile";
    expect(!!container.querySelector(".headerInner.mobile")).toBe(isMobile);
    expect(!!container.querySelector(".headerInner.desktopHeaderInner")).toBe(!isMobile);
  });
});
