// DropdownMenu's Escape and click-outside handlers are document-level listeners registered for every mounted menu,
// so onClose (e.g. ModuleSwitcher's close analytics) must fire only when an open menu actually closes.
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";

jest.mock("../sefaria/sefaria", () => ({ __esModule: true, default: { _: (k) => k } }));
jest.mock("../sefaria/util", () => ({
  __esModule: true,
  default: { handleKeyboardClick: () => {}, focusFirstElement: () => {}, trapFocusWithTab: () => {} },
}));
jest.mock("../Misc", () => ({ InterfaceText: ({ children }) => children }));

// eslint-disable-next-line import/first
import { DropdownMenu } from "../common/DropdownMenu";

describe("DropdownMenu onClose", () => {
  let container;
  let onClose;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    onClose = jest.fn();
    act(() => {
      ReactDOM.render(
        <DropdownMenu buttonComponent={<button className="toggle">menu</button>} onClose={onClose}>
          <div>item</div>
        </DropdownMenu>,
        container
      );
    });
  });
  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  });

  const pressEscape = () => act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
  const clickOutside = () => act(() => { document.body.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  const open = () => act(() => { container.querySelector(".toggle").dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  const isOpen = () => !!container.querySelector(".dropdownLinks-menu.open");

  it("does not call onClose on Escape when the menu is closed", () => {
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not call onClose on a click outside when the menu is closed", () => {
    clickOutside();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes and calls onClose once as passive on Escape when the menu is open", () => {
    open();
    expect(isOpen()).toBe(true);
    pressEscape();
    expect(isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith({ type: "passive" });
  });

  it("closes and calls onClose once as passive on a click outside when the menu is open", () => {
    open();
    clickOutside();
    expect(isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith({ type: "passive" });
  });
});
