/**
 * @jest-environment node
 *
 * The breakpoint is unknown during SSR, so the server must render both the mobile and the desktop headers
 * and let CSS media queries pick one. Otherwise narrow screens briefly show the desktop header before the
 * client renders (sc-47529).
 */
import React from "react";
import ReactDOMServer from "react-dom/server";

jest.mock("../sefaria/sefaria", () => require("./headerTestMocks").sefariaMock());
jest.mock("../sefaria/util", () => ({ __esModule: true, default: { handleKeyboardClick: () => {} } }));
jest.mock("../Misc", () => require("./headerTestMocks").miscMock());
jest.mock("../common/DropdownMenu", () => require("./headerTestMocks").dropdownMenuMock());
jest.mock("../ProfilePic", () => ({ ProfilePic: require("./headerTestMocks").stub("ProfilePic") }));
jest.mock("../HeaderAutocomplete", () => ({ HeaderAutocomplete: require("./headerTestMocks").stub("HeaderAutocomplete") }));
jest.mock("../common/Button", () => ({ __esModule: true, default: require("./headerTestMocks").stub("Button") }));

// eslint-disable-next-line import/first
import { Header } from "../Header";
// eslint-disable-next-line import/first
import { headerProps, textPanel } from "./headerTestMocks";

const render = (props) => ReactDOMServer.renderToString(<Header {...headerProps(props)} />);

describe("Header under Node SSR", () => {
  it("renders both the desktop and the mobile header", () => {
    expect(typeof window).toBe("undefined");
    const html = render();
    expect(html).toContain("headerInner desktopHeaderInner");
    expect(html).toContain("headerInner mobile");
    expect(html).toContain("mobileNavMenu");
  });

  it("marks the header to be hidden on mobile while viewing a text", () => {
    const html = render({ firstPanel: textPanel });
    expect(html).toMatch(/class="header hiddenOnMobile"/);
  });

  it("does not mark the header hidden on mobile when the mobile nav menu is open", () => {
    const html = render({ firstPanel: textPanel, mobileNavMenuOpen: true });
    expect(html).not.toContain("hiddenOnMobile");
  });

  it("does not mark the header hidden on mobile on menu pages", () => {
    expect(render()).not.toContain("hiddenOnMobile");
  });
});
