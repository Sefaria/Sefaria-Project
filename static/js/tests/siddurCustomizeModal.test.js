import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";

jest.mock("../sefaria/sefaria", () => ({ __esModule: true, default: { _: (k) => k } }));
jest.mock("../Misc", () => ({ InterfaceText: ({ children }) => children }));
jest.mock("../ContentText", () => ({ ContentText: ({ text }) => text.en }));

// eslint-disable-next-line import/first
import SiddurCustomizeModal from "../SiddurCustomizeModal";
// eslint-disable-next-line import/first
import { getHiddenRefs, setHiddenRefs } from "../sefaria/siddurCustomization";

const TITLE = "The Koren Shalem Siddur; Ashkenaz";
const ref = path => `${TITLE}, ${path}`;
const leaf = title => ({ title, heTitle: title, nodeType: "JaggedArrayNode", depth: 1, content_counts: 3 });
const SCHEMA = {
  nodes: [
    leaf("Preface"),
    { title: "Weekdays", heTitle: "Weekdays", nodes: [leaf("Tallit"), leaf("Tefillin"), leaf("On Waking")] },
    { title: "Shabbat", heTitle: "Shabbat", nodes: [leaf("Kabbalat Shabbat")] },
  ],
};

describe("SiddurCustomizeModal", () => {
  let container;
  let close;
  const checkbox = label => [...container.querySelectorAll("label")]
    .find(l => l.textContent === label).querySelector("input");
  const click = el => act(() => { el.click(); });
  const button = text => [...container.querySelectorAll("button")].find(b => b.textContent === text);
  const render = () => act(() => {
    ReactDOM.render(<SiddurCustomizeModal title={TITLE} schema={SCHEMA} close={close} />, container);
  });

  beforeAll(() => {
    // jsdom has no <dialog> support.
    HTMLDialogElement.prototype.showModal = jest.fn();
    HTMLDialogElement.prototype.close = jest.fn();
  });
  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    close = jest.fn();
  });
  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  });

  test("starts with every node checked", () => {
    render();
    const boxes = [...container.querySelectorAll("input[type=checkbox]")];
    expect(boxes).toHaveLength(7);
    expect(boxes.every(b => b.checked)).toBe(true);
  });

  test("a parent toggles all of its leaves and reflects partial state", () => {
    render();
    click(checkbox("Weekdays"));
    expect(checkbox("Tallit").checked).toBe(false);
    expect(checkbox("Tefillin").checked).toBe(false);
    click(checkbox("Tefillin"));
    expect(checkbox("Weekdays").checked).toBe(false);
    expect(checkbox("Weekdays").indeterminate).toBe(true);
    click(checkbox("Weekdays"));
    expect(checkbox("Tallit").checked).toBe(true);
    expect(checkbox("Weekdays").indeterminate).toBe(false);
  });

  test("save stores unchecked leaves in book order; cancel doesn't", () => {
    render();
    click(checkbox("Shabbat"));
    click(checkbox("Tallit"));
    click(button("common.cancel"));
    expect(getHiddenRefs(TITLE)).toEqual([]);
    expect(close).toHaveBeenCalledTimes(1);

    click(button("common.save"));
    expect(getHiddenRefs(TITLE)).toEqual([ref("Weekdays, Tallit"), ref("Shabbat, Kabbalat Shabbat")]);
    expect(close).toHaveBeenCalledTimes(2);
  });

  test("loads saved state, and Show All re-checks everything", () => {
    setHiddenRefs(TITLE, [ref("Weekdays, Tallit"), ref("Gone, Stale")]);
    render();
    expect(checkbox("Tallit").checked).toBe(false);
    click(button("siddur_customize.show_all"));
    expect(checkbox("Tallit").checked).toBe(true);
    click(button("common.save"));
    expect(getHiddenRefs(TITLE)).toEqual([]);
  });

  test("collapses a parent's children", () => {
    render();
    click(container.querySelector(".siddurCustomizeCaret:not(.placeholder)"));
    expect(container.textContent).not.toContain("Tallit");
  });

  test("sub-sections start collapsed and save as paragraph ranges", () => {
    render();
    expect(container.textContent).not.toContain("Tzitzit");
    const onWaking = [...container.querySelectorAll("li")].find(li => li.querySelector("label").textContent === "On Waking");
    click(onWaking.querySelector(".siddurCustomizeCaret"));
    click(checkbox("Tzitzit"));
    expect(checkbox("On Waking").indeterminate).toBe(true);
    click(button("common.save"));
    expect(getHiddenRefs(TITLE)).toEqual([ref("Weekdays, On Waking 8-12")]);
  });
});
