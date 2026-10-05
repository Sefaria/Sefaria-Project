/* Testing done using Jest */
// POC landy: the first-visit welcome that hands new visitors to the Library Assistant.
jest.mock("../sefaria/sefaria", () => ({ __esModule: true, default: {
  _: (k) => k,
  _v: (v) => v.en,
  calendars: [
    { title: { en: "Parashat Hashavua" }, url: "Genesis.6.9-11.32", displayValue: { en: "Noach" } },
    { title: { en: "Daf Yomi" }, url: "Menachot.50", displayValue: { en: "Menachot 50" } },
  ],
} }));

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import mockSefaria from "../sefaria/sefaria";
import { LandyWelcome, shouldShowLandyWelcome, markLandyWelcomeSeen, getLearningLinks } from "../LandyWelcome";

describe("LandyWelcome", function () {
  let container, onAsk, onClose;

  beforeAll(() => {
    // jsdom does not implement the <dialog> modal API.
    HTMLDialogElement.prototype.showModal = jest.fn();
    HTMLDialogElement.prototype.close = jest.fn();
  });
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    localStorage.clear();
    onAsk = jest.fn();
    onClose = jest.fn();
    global.gtag = jest.fn();
  });
  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    container.remove();
  });

  const render = (mobile = false) => act(() => {
    ReactDOM.render(<LandyWelcome mobile={mobile} onAsk={onAsk} onClose={onClose} />, container);
  });
  const click = (el) => act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const optionButtons = () => [...container.querySelectorAll(".landyWelcomeOption")];

  it("is a modal on desktop and a bottom sheet on mobile", function () {
    render(false);
    expect(container.querySelector("dialog.landyWelcomeModal")).not.toBeNull();
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    render(true);
    expect(container.querySelector("dialog.landyWelcomeSheet")).not.toBeNull();
  });

  it("sends 'Where am I' straight to the assistant", function () {
    render();
    click(optionButtons()[0]);
    expect(onClose).toHaveBeenCalled();
    expect(onAsk).toHaveBeenCalledWith("landy.where_am_i", undefined);
  });

  it("sends 'suggest things' with the interview intent", function () {
    render();
    click(optionButtons()[1]);
    expect(onAsk).toHaveBeenCalledWith("landy.suggest", "interview");
  });

  it("links to this week's parasha, today's daf, Pirkei Avot and Esther", function () {
    expect(getLearningLinks().map(l => l.href)).toEqual(
      ["/Genesis.6.9-11.32", "/Menachot.50", "/Pirkei_Avot", "/Esther"]
    );
    render();
    const links = [...container.querySelectorAll(".landyWelcomeLearn a")];
    expect(links.map(a => a.getAttribute("href"))).toEqual(
      ["/Genesis.6.9-11.32", "/Menachot.50", "/Pirkei_Avot", "/Esther"]
    );
    click(links[0]);
    expect(onClose).toHaveBeenCalled();
    expect(onAsk).not.toHaveBeenCalled();
  });

  it("falls back to general pages when the calendar has no entries", function () {
    const saved = mockSefaria.calendars;
    mockSefaria.calendars = [];
    try {
      expect(getLearningLinks().slice(0, 2).map(l => l.href)).toEqual(["/topics/category/torah-portions", "/calendars"]);
    } finally {
      mockSefaria.calendars = saved;
    }
  });

  it("submits the free-text question with a 3-line box, and not when empty", function () {
    render();
    const textarea = container.querySelector("textarea");
    expect(textarea.getAttribute("rows")).toBe("3");
    const send = container.querySelector(".landyWelcomeHelpSend");
    expect(send.disabled).toBe(true);
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(textarea, "  What is a midrash?  ");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(onAsk).toHaveBeenCalledWith("What is a midrash?", undefined);
  });

  it("'I'm good' just closes", function () {
    render();
    click(container.querySelector(".landyWelcomeGood"));
    expect(onClose).toHaveBeenCalled();
    expect(onAsk).not.toHaveBeenCalled();
  });
});

describe("shouldShowLandyWelcome", function () {
  const setSearch = (search) => window.history.replaceState({}, "", "/texts" + search);
  beforeEach(() => { localStorage.clear(); setSearch(""); });

  it("shows on the first visit only", function () {
    expect(shouldShowLandyWelcome()).toBe(true);
    markLandyWelcomeSeen();
    expect(shouldShowLandyWelcome()).toBe(false);
  });

  it("?landy=1 forces it and ?landy=0 suppresses it", function () {
    markLandyWelcomeSeen();
    setSearch("?landy=1");
    expect(shouldShowLandyWelcome()).toBe(true);
    localStorage.clear();
    setSearch("?landy=0");
    expect(shouldShowLandyWelcome()).toBe(false);
  });
});
